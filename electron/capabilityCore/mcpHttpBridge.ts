// 能力核 · 只会 stdio 的宿主（Claude Desktop）→ 本机 HTTP 的转发桥（设计卡第 2 段）。
//
// 帧原样两头搬：宿主那一侧（stdio）收到什么就发给 Nomi 的 HTTP 端点，Nomi 回什么（响应、进度、
// 确认弹框请求、list_changed）就原样还给宿主。这里**没有任何领域逻辑**：不认工具、不碰审批、不改参数。
// 只做两件 HTTP 传输本身要的事：
//   ① initialize 的响应回来时把协商出的协议版本告诉 HTTP 传输（规范要求后续请求带 MCP-Protocol-Version 头；
//      平常由 SDK 的 Client 做，转发桥没有 Client，只好在这里看一眼那一帧）；
//   ② Nomi 连不上（没开）时，给宿主那个请求回一帧错误，而不是让它干等到超时；
//   ③ Nomi 回 404（会话号作废：Nomi 重启了 / 会话被挤掉）时，用宿主当初那条 initialize 在上游重新握手，
//      再把这一个没被受理的请求重发一次（404 发生在受理之前，重发不会重复执行写入或生成）；
//      重握手不成才如实说「会话已失效」。错误文案按原因区分：没开 / 会话失效 / 身份没过 / 其它，不再一律说「请先打开 Nomi」。
// 必须 electron-free：转发口跑在裸 Node 上。
import type { JSONRPCMessage, Transport } from '@modelcontextprotocol/server'
import type { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { isTransportLevelFailure, outboundRequestWasNeverWritten } from '../outboundDispatchEvidence'

export const NOMI_UNREACHABLE_MESSAGE =
  '连不上 Nomi：请先打开 Nomi 再试。 / Cannot reach Nomi: open the Nomi app first, then try again.'

export const NOMI_SESSION_LOST_MESSAGE =
  'Nomi 这边的会话已失效，自动重连没成功：请在助手里重新连接 Nomi（或重启这个助手）。 / The Nomi session expired and automatic reconnect failed: reconnect Nomi in your assistant (or restart it).'
export const NOMI_AUTH_MESSAGE =
  'Nomi 没认出这个助手的身份：请在 Nomi 设置里重新接入这个助手。 / Nomi did not accept this assistant identity: reconnect it from Nomi settings.'

export const NOMI_INTERRUPTED_MESSAGE =
  '连接中断了一下，这次操作可能已经执行：请先查看结果再决定要不要重试，不要直接重发。 / The connection dropped and this call may already have run: check the result before retrying.'

const INTERNAL_CALL_TIMEOUT_MS = 10_000
/**
 * 探活最多问几次。Nomi 同端口重启后，连接池里还留着几条指向旧进程的空闲 keep-alive 连接：拿它们发请求被对面
 * 复位（ECONNRESET），每条失败一次就被丢掉。只有「证明一个字节都没写出去」（拒连 / DNS，见 outboundDispatchEvidence）
 * 才算 Nomi 没开；连接层复位就换条连接再问——ping 天然可重复，多问不花钱、不改画布。超时不再问（Nomi 卡住了，多等无益）。
 */
const PROBE_ATTEMPTS = 4
/** 天然可重复的请求：重发不会花钱、不会改画布。其余（tools/call 等）连接状态不明时绝不重发。 */
const IDEMPOTENT_METHODS = /^(ping|tools\/list|resources\/(list|read|templates\/list)|prompts\/(list|get)|completion\/complete|logging\/setLevel)$/

type FailureKind = 'unreachable' | 'session-lost' | 'unauthenticated' | 'interrupted' | 'other'

/** 上游发送失败的原因：只看 HTTP 状态与是否根本没连上，不看文案。 */
function classifyUpstreamFailure(error: unknown): FailureKind {
  const status = (error as { status?: unknown } | null)?.status
  if (status === 404) return 'session-lost'
  if (status === 401 || status === 403) return 'unauthenticated'
  if (typeof status === 'number') return 'other'
  return 'unreachable'
}

function failureMessage(kind: FailureKind, error: unknown): string {
  if (kind === 'unreachable') return NOMI_UNREACHABLE_MESSAGE
  if (kind === 'session-lost') return NOMI_SESSION_LOST_MESSAGE
  if (kind === 'unauthenticated') return NOMI_AUTH_MESSAGE
  if (kind === 'interrupted') return NOMI_INTERRUPTED_MESSAGE
  return `Nomi 返回了错误：${(error instanceof Error ? error.message : String(error)).slice(0, 200)} / Nomi returned an error.`
}

function requestIdOf(message: JSONRPCMessage): string | number | undefined {
  return 'method' in message && 'id' in message && (typeof message.id === 'string' || typeof message.id === 'number') ? message.id : undefined
}

/**
 * 把宿主侧传输（downstream）与 Nomi 的 HTTP 传输（upstream）接起来。任一侧关掉，两侧都收；
 * 返回的 Promise 在两侧都关完后结束（转发口进程据此退出）。
 */
export async function bridgeStdioToHttp(
  downstream: Transport,
  upstream: StreamableHTTPClientTransport,
  hooks: Readonly<{ onError?: (error: Error) => void }> = {},
): Promise<void> {
  const initializeIds = new Set<string | number>()
  let closing = false
  let finished!: () => void
  const done = new Promise<void>((resolve) => { finished = resolve })
  const report = (error: unknown) => hooks.onError?.(error instanceof Error ? error : new Error(String(error)))

  const closeBoth = async () => {
    if (closing) return
    closing = true
    // 宿主走了：先让 Nomi 那边收掉这条会话（中止在途调用），再关本地两头。
    await upstream.terminateSession().catch(() => {})
    await Promise.allSettled([upstream.close(), downstream.close()])
    finished()
  }

  // 宿主当初那条 initialize：上游会话作废时用它原样重握手（同一个宿主、同一份能力声明）。
  let hostInitialize: (JSONRPCMessage & { method: string; params?: unknown }) | null = null
  // 桥自己发的请求（ping 探活 / 重握手）：回复只给桥，不转给宿主。
  const internal = new Map<string, { resolve: () => void; reject: (error: Error) => void }>()
  let internalSeq = 0
  let recovering: Promise<boolean> | null = null

  const internalCall = (method: string, params: unknown): Promise<void> => {
    const id = `nomi-bridge-${(internalSeq += 1)}`
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { internal.delete(id); reject(new Error(`${method} timed out`)) }, INTERNAL_CALL_TIMEOUT_MS)
      internal.set(id, {
        resolve: () => { clearTimeout(timer); internal.delete(id); resolve() },
        reject: (error) => { clearTimeout(timer); internal.delete(id); reject(error) },
      })
      upstream.send({ jsonrpc: '2.0', id, method, params } as JSONRPCMessage).catch((error: unknown) => {
        clearTimeout(timer)
        internal.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      })
    })
  }

  /** 在上游开一条新会话；成功才算数。并发的失效请求共用同一次重握手。 */
  const recoverSession = (): Promise<boolean> => {
    if (!hostInitialize) return Promise.resolve(false)
    if (recovering) return recovering
    const init = hostInitialize
    recovering = (async () => {
      try {
        await internalCall(init.method, init.params)
        await upstream.send({ jsonrpc: '2.0', method: 'notifications/initialized' } as JSONRPCMessage)
        return true
      } catch (error) {
        report(error)
        return false
      } finally {
        recovering = null
      }
    })()
    return recovering
  }

  /**
   * 没拿到状态码的失败（连接被重置 / 连不上）：用 ping 问，分清「Nomi 没开」「会话丢了」「连接抖了一下」。
   * 「没开」只认拒连这类证据；复位是旧连接被对面关了，换条连接再问（2026-10-18：同端口重启后头两次 ping 都撞旧连接，
   * 旧写法第一次复位就判「没开」，Nomi 明明开着却叫用户「请先打开 Nomi」）。
   */
  const probeUpstream = async (): Promise<'alive' | 'session-lost' | 'down'> => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await internalCall('ping', undefined)
        return 'alive'
      } catch (error) {
        const kind = classifyUpstreamFailure(error)
        if (kind === 'session-lost') return 'session-lost'
        // 再问的只有连接层复位（旧连接被关）；拒连 = 证据确凿没开，超时 = Nomi 卡住了，都不再问。
        const staleConnection = kind === 'unreachable' && isTransportLevelFailure(error) && !outboundRequestWasNeverWritten(error)
        if (!staleConnection || attempt >= PROBE_ATTEMPTS) return 'down'
      }
    }
  }

  const forward = async (message: JSONRPCMessage, id: string | number | undefined): Promise<void> => {
    const method = (message as { method?: string }).method ?? ''
    const fail = (kind: FailureKind, error: unknown) => {
      if (id !== undefined) void downstream.send({ jsonrpc: '2.0', id, error: { code: -32000, message: failureMessage(kind, error) } }).catch(report)
    }
    try {
      await upstream.send(message)
      return
    } catch (error) {
      report(error)
      if (method === 'initialize') return fail(classifyUpstreamFailure(error), error)
      let kind = classifyUpstreamFailure(error)
      // 对「没拿到状态码」的失败：服务器有没有受理过这一帧无从得知，先问清上游还在不在。
      let replaySafe = kind === 'session-lost' // 404 发生在受理之前：重发不会重复执行任何写入 / 生成。
      if (kind === 'unreachable') {
        const state = await probeUpstream()
        if (state === 'down') return fail('unreachable', error)
        if (state === 'alive') {
          // 连接只是抖了一下、会话还在：只重发天然可重复的读请求；其它不重发，如实说「可能已执行」。
          if (!IDEMPOTENT_METHODS.test(method)) return fail('interrupted', error)
          try { await upstream.send(message); return } catch (retryError) { report(retryError); return fail(classifyUpstreamFailure(retryError), retryError) }
        }
        kind = 'session-lost'
        replaySafe = IDEMPOTENT_METHODS.test(method)
      }
      if (kind === 'session-lost') {
        if (!(await recoverSession())) return fail('session-lost', error)
        if (!replaySafe) return fail('interrupted', error)
        try {
          await upstream.send(message)
        } catch (retryError) {
          report(retryError)
          fail(classifyUpstreamFailure(retryError), retryError)
        }
        return
      }
      fail(kind, error)
    }
  }

  downstream.onmessage = (message) => {
    const id = requestIdOf(message)
    if (id !== undefined && 'method' in message && message.method === 'initialize') {
      initializeIds.add(id)
      hostInitialize = message
    }
    void forward(message, id)
  }
  upstream.onmessage = (message) => {
    if ('id' in message && message.id !== undefined && internal.has(String(message.id))) {
      const pending = internal.get(String(message.id))!
      if ('result' in message) {
        const version = (message.result as { protocolVersion?: unknown } | null)?.protocolVersion
        if (typeof version === 'string') upstream.setProtocolVersion(version)
        pending.resolve()
      } else {
        pending.reject(new Error('error' in message ? String((message as { error?: { message?: unknown } }).error?.message ?? 'error') : 'error'))
      }
      return
    }
    if ('id' in message && 'result' in message && message.id !== undefined && initializeIds.delete(message.id as string | number)) {
      const version = (message.result as { protocolVersion?: unknown }).protocolVersion
      if (typeof version === 'string') upstream.setProtocolVersion(version)
    }
    downstream.send(message).catch(report)
  }
  downstream.onclose = () => { void closeBoth() }
  upstream.onclose = () => { void closeBoth() }
  downstream.onerror = report
  upstream.onerror = report

  await upstream.start()
  await downstream.start()
  return done
}
