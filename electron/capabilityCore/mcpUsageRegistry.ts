// 能力核 · 外部助手「这一次 Nomi 运行里用了多少」的账（MCP 第 4 段，docs/plan/2026-10-05-mcp-official-sdk.md）。
//
// 只存在主进程内存里，Nomi 重启即清零：这是「连接状态」的展示数据，不是审计账（审计走收据）。
// 记账的位置是三条传输（HTTP / Electron stdio / 裸 Node 启动器）汇合之后的第一个主进程边界——
// rpcServer 收到带已验证客户端身份的工具调用的那一刻（工具名与调用号由传输随请求头带来）。
// 身份只认签名口令验出来的 key；助手自报的名字（clientInfo.name）只作展示。
//
// 本文件 electron-free、零依赖：单测直接起它。
import type { McpClientUsage } from '../shared/mcpConnectionContract'

export type McpUsageRegistry = ReturnType<typeof createMcpUsageRegistry>

type Entry = {
  reportedName: string | null
  lastSeenAt: number | null
  lastCall: { tool: string; at: number } | null
  /** 已经计过数的调用号：一次工具调用可能在领域里发好几跳请求，只算一次。 */
  countedCalls: Set<string>
  callCount: number
  /** 调用号 → 还在跑的请求数。 */
  running: Map<string, number>
}

/** 已结束调用号留在 countedCalls 里的上限：只为去重，满了丢最旧的「已结束」的，不让它无限涨。在途调用的号不受此限（见 trimCounted）。 */
const COUNTED_CALLS_CAP = 256

/** 只丢已经结束（不在 running 里）的最旧调用号。在途的号被丢掉，它后续的请求跳会被当成新调用再记一次。 */
function trimCounted(entry: Entry): void {
  if (entry.countedCalls.size <= COUNTED_CALLS_CAP) return
  for (const id of entry.countedCalls) {
    if (entry.countedCalls.size <= COUNTED_CALLS_CAP) return
    if (!entry.running.has(id)) entry.countedCalls.delete(id)
  }
}

export function createMcpUsageRegistry(options: Readonly<{ now?: () => number; onChange?: () => void }> = {}) {
  const now = options.now ?? Date.now
  const entries = new Map<string, Entry>()
  const touch = (client: string): Entry => {
    let entry = entries.get(client)
    if (!entry) {
      entry = { reportedName: null, lastSeenAt: null, lastCall: null, countedCalls: new Set(), callCount: 0, running: new Map() }
      entries.set(client, entry)
    }
    return entry
  }
  const changed = () => options.onChange?.()

  return {
    /** 一个已验证的助手连上来了（握手）。自报名只作展示。 */
    connected(client: string, reportedName?: string): void {
      const entry = touch(client)
      entry.lastSeenAt = now()
      if (reportedName) entry.reportedName = reportedName.slice(0, 80)
      changed()
    },
    /** 一次工具调用的一跳请求进来了；返回「这一跳结束」的回调（可重复调用，只生效一次）。 */
    callStarted(client: string, call: Readonly<{ tool: string; id: string }>): () => void {
      const entry = touch(client)
      const at = now()
      entry.lastSeenAt = at
      entry.lastCall = { tool: call.tool, at }
      if (!entry.countedCalls.has(call.id)) {
        entry.countedCalls.add(call.id)
        entry.callCount += 1
      }
      entry.running.set(call.id, (entry.running.get(call.id) ?? 0) + 1)
      trimCounted(entry)
      changed()
      let ended = false
      return () => {
        if (ended) return
        ended = true
        const left = (entry.running.get(call.id) ?? 1) - 1
        if (left > 0) entry.running.set(call.id, left)
        else entry.running.delete(call.id)
        trimCounted(entry)
        entry.lastSeenAt = now()
        changed()
      }
    },
    snapshot(): Record<string, McpClientUsage> {
      const out: Record<string, McpClientUsage> = {}
      for (const [client, entry] of entries) {
        out[client] = {
          reportedName: entry.reportedName,
          lastSeenAt: entry.lastSeenAt,
          lastCall: entry.lastCall,
          callCount: entry.callCount,
          inFlight: entry.running.size,
        }
      }
      return out
    },
  }
}

let shared: McpUsageRegistry | null = null
/** 主进程里唯一的一本账；rpcServer、HTTP 服务端、IPC 都认它。onChange 由 IPC 层挂上。 */
export function mcpUsageRegistry(): McpUsageRegistry {
  if (!shared) shared = createMcpUsageRegistry({ onChange: () => mcpUsageListeners.forEach((listener) => listener()) })
  return shared
}
const mcpUsageListeners = new Set<() => void>()
export function onMcpUsageChanged(listener: () => void): () => void {
  mcpUsageListeners.add(listener)
  return () => { mcpUsageListeners.delete(listener) }
}
