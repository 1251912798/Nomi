// 转发口的失败分类（2026-10-18）：Nomi 同端口重启后，连接池里指向旧进程的空闲连接被对面复位（ECONNRESET），
// 旧写法第一次复位就判「Nomi 没开」，宿主看到「请先打开 Nomi」——Nomi 明明开着。满负荷下 mcpHostReliability 的重启用例
// 12/12 复现；这里用假的上游把两种失败的真实形状（undici 的 `fetch failed` + cause）钉死，不依赖机器忙不忙。
import type { JSONRPCMessage, Transport } from '@modelcontextprotocol/server'
import type { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { describe, expect, it } from 'vitest'

import { bridgeStdioToHttp, NOMI_UNREACHABLE_MESSAGE } from './mcpHttpBridge'

/** undici 抛出来的样子：外壳只说 fetch failed，真相在 cause。 */
const resetError = () => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET', syscall: 'read' }) })
const refusedError = () => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), { code: 'ECONNREFUSED', syscall: 'connect' }) })
const sessionGone = () => Object.assign(new Error('Session not found'), { status: 404 })

type Outcome = Error | 'ok'

/** 上游：按方法名排好每一次 send 的结局；'ok' 的请求立刻回一帧 result。 */
function fakeUpstream(plan: Record<string, Outcome[]>) {
  const sent: string[] = []
  const upstream = {
    onmessage: undefined as ((message: JSONRPCMessage) => void) | undefined,
    onclose: undefined as (() => void) | undefined,
    onerror: undefined as ((error: Error) => void) | undefined,
    async start() {},
    async close() {},
    async terminateSession() {},
    setProtocolVersion() {},
    async send(message: JSONRPCMessage) {
      const method = (message as { method?: string }).method ?? ''
      sent.push(method)
      const outcome = plan[method]?.shift() ?? 'ok'
      if (outcome !== 'ok') throw outcome
      const id = (message as { id?: string | number }).id
      if (id !== undefined) queueMicrotask(() => upstream.onmessage?.({ jsonrpc: '2.0', id, result: method === 'tools/list' ? { tools: [{ name: 'nomi_read' }] } : { protocolVersion: '2025-11-25' } } as JSONRPCMessage))
    },
  }
  return { upstream: upstream as unknown as StreamableHTTPClientTransport, sent }
}

function fakeHost() {
  const received: JSONRPCMessage[] = []
  let waiters: Array<() => void> = []
  const host = {
    onmessage: undefined as ((message: JSONRPCMessage) => void) | undefined,
    onclose: undefined as (() => void) | undefined,
    onerror: undefined as ((error: Error) => void) | undefined,
    async start() {},
    async close() {},
    async send(message: JSONRPCMessage) { received.push(message); const wake = waiters; waiters = []; wake.forEach((fn) => fn()) },
  }
  const reply = async (id: number) => {
    for (;;) {
      const found = received.find((message) => (message as { id?: unknown }).id === id)
      if (found) return found as { result?: unknown; error?: { message?: string } }
      await new Promise<void>((resolve) => waiters.push(resolve))
    }
  }
  return { host: host as unknown as Transport, emit: (message: JSONRPCMessage) => host.onmessage?.(message), reply }
}

async function connected(plan: Record<string, Outcome[]>) {
  const { upstream, sent } = fakeUpstream(plan)
  const { host, emit, reply } = fakeHost()
  void bridgeStdioToHttp(host, upstream)
  await new Promise((resolve) => setTimeout(resolve, 0))
  emit({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'claude-desktop', version: '1' } } } as JSONRPCMessage)
  await reply(1)
  sent.length = 0
  return { sent, emit, reply }
}

describe('转发口：「Nomi 没开」只认拒连，旧连接被复位换条连接再问', () => {
  it('同端口重启：请求和头两次探活都撞旧连接（复位），第三次探活拿到 404 → 重握手 → 宿主拿到结果', async () => {
    const { sent, emit, reply } = await connected({ 'tools/list': [resetError()], ping: [resetError(), resetError(), sessionGone()] })
    emit({ jsonrpc: '2.0', id: 2, method: 'tools/list' } as JSONRPCMessage)
    const answer = await reply(2)
    expect(answer.error).toBeUndefined()
    expect((answer.result as { tools: unknown[] }).tools).toHaveLength(1)
    expect(sent).toEqual(['tools/list', 'ping', 'ping', 'ping', 'initialize', 'notifications/initialized', 'tools/list'])
  })

  it('拒连 = 证据确凿没开：只探一次就如实说「请先打开 Nomi」，不重试', async () => {
    const { sent, emit, reply } = await connected({ 'tools/list': [refusedError()], ping: [refusedError()] })
    emit({ jsonrpc: '2.0', id: 2, method: 'tools/list' } as JSONRPCMessage)
    expect((await reply(2)).error?.message).toBe(NOMI_UNREACHABLE_MESSAGE)
    expect(sent).toEqual(['tools/list', 'ping'])
  })

  it('一直复位：探活有上限（4 次），之后才说连不上', async () => {
    const { sent, emit, reply } = await connected({ 'tools/list': [resetError()], ping: [resetError(), resetError(), resetError(), resetError(), resetError()] })
    emit({ jsonrpc: '2.0', id: 2, method: 'tools/list' } as JSONRPCMessage)
    expect((await reply(2)).error?.message).toBe(NOMI_UNREACHABLE_MESSAGE)
    expect(sent.filter((method) => method === 'ping')).toHaveLength(4)
  })
})
