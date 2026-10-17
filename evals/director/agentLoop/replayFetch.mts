// Agent 在环评测的录音 / 回放：只换 `OpenLaneOptions.fetch` 这一个口子，lane 本身一行不改。
// 录音把真实端点的原始响应（流式 SSE 也是一段文本）原样记下；回放按顺序交还，请求体对不上就报「录音过期」。
//
// 每次运行都会新生成的标识（提议号 `prop_…`、画布节点号 `gen-v2-…`）不是模型的行为，回放时按出现顺序对齐：
//   · 比对请求体前把它们换成「第 k 个标识」再比，别的字一个都不放过；
//   · 录音里模型回复引用的旧标识（比如补丁指向的导演节点）换成这一次运行里同一位置的新标识再交还。
import { createHash } from 'node:crypto'

/** requestBody 原样留着：录音过期时能直接 diff 出是哪一段提示词 / 工具面变了。 */
export type RecordedExchange = Readonly<{ index: number; requestSha256: string; requestBody: string; status: number; contentType: string; body: string }>

/** 本机每次运行都会变的标识：`proposalTxn.ts` 的 `prop_<uuid 前 10 位>`、`canvasIds.ts` 的 `gen-v2-<kind>-<时间>-<随机>`。 */
const VOLATILE_ID = /prop_[0-9a-f]{8}-[0-9a-f]{1}|gen-v2-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+/g

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

export function requestBodyText(init: RequestInit | undefined): string {
  return typeof init?.body === 'string' ? init.body : ''
}

/** 出现顺序去重后的易变标识。 */
export function volatileIds(text: string): string[] {
  return [...new Set(text.match(VOLATILE_ID) ?? [])]
}

/** 把易变标识换成「第 k 个」：比对用，别的字节不动。 */
export function normalizeVolatileIds(text: string): string {
  const order = volatileIds(text)
  return text.replace(VOLATILE_ID, (id) => `<id${order.indexOf(id)}>`)
}

/** 录音：真实端点原样转发，响应体读全后照原样交还给 lane（流式 SSE 也是一段文本），同时记下来。 */
export function recordingFetch(real: typeof globalThis.fetch, exchanges: RecordedExchange[]): typeof globalThis.fetch {
  return async (input, init) => {
    const response = await real(input, init)
    const body = await response.text()
    const contentType = response.headers.get('content-type') ?? 'application/json'
    const requestBody = requestBodyText(init)
    exchanges.push({ index: exchanges.length, requestSha256: sha256(normalizeVolatileIds(requestBody)), requestBody, status: response.status, contentType, body })
    return new Response(body, { status: response.status, headers: { 'content-type': contentType } })
  }
}

/**
 * 回放：第 n 次请求回第 n 条录音。请求体（易变标识对齐后）与录音不一样 = 提示词 / 工具面 / 上一轮结果变了，
 * 记下来（这张卡的分数就不能算「同一次运行的复现」）。
 */
export function replayFetch(recorded: readonly RecordedExchange[], onStale: (why: string) => void, used: RecordedExchange[]): typeof globalThis.fetch {
  return async (_input, init) => {
    const next = recorded[used.length]
    if (!next) {
      onStale(`request #${used.length + 1} has no recording`)
      return new Response(JSON.stringify({ error: { message: 'replay exhausted' } }), { status: 500, headers: { 'content-type': 'application/json' } })
    }
    const current = requestBodyText(init)
    if (sha256(normalizeVolatileIds(current)) !== next.requestSha256) onStale(`request #${next.index + 1} differs from the recording`)
    used.push(next)
    const recordedIds = volatileIds(next.requestBody)
    const currentIds = volatileIds(current)
    const body = next.body.replace(VOLATILE_ID, (id) => {
      const position = recordedIds.indexOf(id)
      return position >= 0 && currentIds[position] ? currentIds[position] : id
    })
    return new Response(body, { status: next.status, headers: { 'content-type': next.contentType } })
  }
}
