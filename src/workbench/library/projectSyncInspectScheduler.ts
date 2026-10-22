import type { WorkspaceSyncInspection } from '../../../electron/shared/workspaceSyncContracts'

/**
 * 项目库卡片的「同步状态」后台检查的**唯一调度者**（P-library，2026-10-21）。
 *
 * 此前：页面挂载和每次窗口聚焦都对库里每个带文件夹的项目各发一次检查（41 个项目 = 41 次 IPC，
 * 聚焦一次又来一遍），回库的卡片一出来，主进程就被这一整批读盘排满。
 *
 * 现在：
 * - 从不在调用栈里同步发请求：`request` 只登记，真正发出去排在浏览器空闲时（首屏先画完）；
 * - 只查「需要查」的：项目的 revision / 保存时间变了，或上次结果超过 TTL；聚焦也只是重新登记，没变就什么都不发；
 * - 分批串行：一批最多 BATCH_SIZE 个项目、同一时刻只有一批在飞，主进程那边再限并发；
 * - 结果存在这里（模块级），离开项目库再回来卡片上的徽标不闪、不重查。
 *
 * 结果的语义（「失效的结果不能冒充当前状态」）：
 * - 有结果 = 对这一版项目（revision / 保存时间）、在 TTL 之内查到的状态；
 * - 没有结果 = unknown，卡片不显示徽标，也不参与「打开项目前要不要拦」的判断；
 * - 项目变了（revision / 保存时间不同）或结果超过 TTL，**登记那一刻**就把旧结果撤掉再重查；重查返回 null 或抛错，
 *   就停在 unknown，不会退回旧值。
 * 注意 TTL 不是定时器：没人再调 `request`（聚焦、列表变化、重新挂载），停在页面上不会自己到期刷新。
 */
export const SYNC_INSPECT_TTL_MS = 5 * 60 * 1000
export const SYNC_INSPECT_BATCH_SIZE = 6

export type SyncInspectTarget = { id: string; rootPath?: string; revision?: number; savedAt?: number }

type InspectMany = (projectIds: string[]) => Promise<Record<string, WorkspaceSyncInspection | null>>
type Schedule = (task: () => void) => void

type Entry = { key: string; at: number; inspection: WorkspaceSyncInspection }

const keyOf = (target: SyncInspectTarget): string => `${target.revision ?? 0}:${target.savedAt ?? 0}`

export function createSyncInspectScheduler(options: {
  inspectMany: InspectMany
  /** 把任务排到「不挡首屏」的时刻；默认空闲回调（没有就退成宏任务）。 */
  schedule?: Schedule
  now?: () => number
}) {
  const now = options.now ?? Date.now
  const schedule: Schedule = options.schedule ?? defaultSchedule
  const entries = new Map<string, Entry>()
  const listeners = new Set<() => void>()
  const pending: SyncInspectTarget[] = []
  let running = false
  let scheduled = false
  let snapshot: Record<string, WorkspaceSyncInspection> = {}

  const publish = (): void => {
    snapshot = Object.fromEntries([...entries].map(([id, entry]) => [id, entry.inspection]))
    for (const listener of listeners) listener()
  }

  const stale = (target: SyncInspectTarget): boolean => {
    const entry = entries.get(target.id)
    return !entry || entry.key !== keyOf(target) || now() - entry.at > SYNC_INSPECT_TTL_MS
  }

  const drain = async (): Promise<void> => {
    if (running) return
    running = true
    try {
      while (pending.length) {
        const batch = pending.splice(0, SYNC_INSPECT_BATCH_SIZE)
        let result: Record<string, WorkspaceSyncInspection | null> = {}
        try {
          result = await options.inspectMany(batch.map((target) => target.id))
        } catch {
          // 有意静默：后台批量探测，产出只是卡片上的可选徽标；探不到就不显示徽标。
          continue
        }
        const at = now()
        for (const target of batch) {
          const inspection = result[target.id]
          if (inspection) entries.set(target.id, { key: keyOf(target), at, inspection })
        }
        publish()
      }
    } finally {
      running = false
    }
  }

  return {
    /** 登记要检查的项目；已有新鲜结果的跳过。不会在本次调用里发请求。 */
    request(targets: readonly SyncInspectTarget[]): void {
      const queued = new Set(pending.map((target) => target.id))
      let revoked = false
      for (const target of targets) {
        if (!target.rootPath || queued.has(target.id) || !stale(target)) continue
        // 过期 / 对不上这一版的旧结果先撤掉：重查没结果时停在 unknown，不留旧徽标冒充当前状态。
        if (entries.delete(target.id)) revoked = true
        pending.push(target)
        queued.add(target.id)
      }
      if (revoked) publish()
      if (!pending.length || scheduled || running) return
      scheduled = true
      schedule(() => {
        scheduled = false
        void drain()
      })
    },
    /** 用户点「重新检查」拿到的新结果直接写进来（同一份存放处，不另起一份）。 */
    set(target: SyncInspectTarget, inspection: WorkspaceSyncInspection): void {
      entries.set(target.id, { key: keyOf(target), at: now(), inspection })
      publish()
    },
    snapshot: (): Record<string, WorkspaceSyncInspection> => snapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

function defaultSchedule(task: () => void): void {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback
  if (idle) idle(task, { timeout: 2000 })
  else setTimeout(task, 0)
}
