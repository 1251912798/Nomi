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
  /** 已经计过数的调用号 → 这个号最近一次有动静（某一跳开始或结束）的时刻。一次工具调用可能在领域里发好几跳请求，只算一次。 */
  countedCalls: Map<string, number>
  callCount: number
  /** 调用号 → 还在跑的请求数。 */
  running: Map<string, number>
  lastSweepAt: number
}

/**
 * 一个调用号「最后一跳结束后」还保留多久：覆盖跳与跳之间等真人确认的空档（elicitation 5 分钟、Codex 单次工具超时 10 分钟），
 * 过了这个时间这个调用必已结束——调用号是每次调用现生成的 UUID，不会再来。
 * 是「调用的生命周期」决定记没记过，不是「历史有多少条」：别人再多的调用也挤不掉空档里的号。
 */
export const MCP_CALL_IDLE_RELEASE_MS = 30 * 60 * 1000
/** 清理最多每分钟扫一次，不在每次调用上做 O(n)。 */
const SWEEP_EVERY_MS = 60 * 1000

/** 释放「已结束且空闲超过 MCP_CALL_IDLE_RELEASE_MS」的号。在跑的号（running 里有）永不释放，所以不会被当成新调用。 */
function releaseIdleCalls(entry: Entry, at: number): void {
  if (at - entry.lastSweepAt < SWEEP_EVERY_MS) return
  entry.lastSweepAt = at
  for (const [id, lastActiveAt] of entry.countedCalls) {
    if (at - lastActiveAt > MCP_CALL_IDLE_RELEASE_MS && !entry.running.has(id)) entry.countedCalls.delete(id)
  }
}

export function createMcpUsageRegistry(options: Readonly<{ now?: () => number; onChange?: () => void }> = {}) {
  const now = options.now ?? Date.now
  const entries = new Map<string, Entry>()
  const touch = (client: string): Entry => {
    let entry = entries.get(client)
    if (!entry) {
      entry = { reportedName: null, lastSeenAt: null, lastCall: null, countedCalls: new Map(), callCount: 0, running: new Map(), lastSweepAt: now() }
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
      if (!entry.countedCalls.has(call.id)) entry.callCount += 1
      entry.countedCalls.set(call.id, at)
      entry.running.set(call.id, (entry.running.get(call.id) ?? 0) + 1)
      releaseIdleCalls(entry, at)
      changed()
      let ended = false
      return () => {
        if (ended) return
        ended = true
        const left = (entry.running.get(call.id) ?? 1) - 1
        if (left > 0) entry.running.set(call.id, left)
        else entry.running.delete(call.id)
        const endedAt = now()
        entry.countedCalls.set(call.id, endedAt)
        releaseIdleCalls(entry, endedAt)
        entry.lastSeenAt = endedAt
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
