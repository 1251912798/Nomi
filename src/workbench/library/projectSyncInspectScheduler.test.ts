import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceSyncInspection } from '../../../electron/shared/workspaceSyncContracts'
import { createSyncInspectScheduler, SYNC_INSPECT_BATCH_SIZE, SYNC_INSPECT_TTL_MS } from './projectSyncInspectScheduler'

const ready = (): WorkspaceSyncInspection => ({
  status: 'ready', manifestExists: true, backupExists: false, referencedAssetCount: 0, missingAssetCount: 0,
  observedRevision: 1, lastWriterId: null, contentHash: 'h',
})
const projects = (count: number, revision = 1) =>
  Array.from({ length: count }, (_, index) => ({ id: `p${index}`, rootPath: `/lib/p${index}`, revision, savedAt: 100 }))

function harness(now = { value: 1000 }) {
  const queued: Array<() => void> = []
  const inspectMany = vi.fn(async (ids: string[]): Promise<Record<string, WorkspaceSyncInspection | null>> => Object.fromEntries(ids.map((id) => [id, ready()])))
  const scheduler = createSyncInspectScheduler({ inspectMany, schedule: (task) => { queued.push(task) }, now: () => now.value })
  const flush = async (): Promise<void> => {
    while (queued.length) { queued.shift()?.(); await vi.waitFor(() => undefined); await new Promise((resolve) => setTimeout(resolve, 0)) }
  }
  return { scheduler, inspectMany, queued, flush, now }
}

describe('项目库卡片同步状态：回库首屏不等状态检查', () => {
  it('登记只是登记：本次调用里不发任何检查，要等排到空闲时', async () => {
    const { scheduler, inspectMany, queued } = harness()
    scheduler.request(projects(41))
    expect(inspectMany).not.toHaveBeenCalled()
    expect(queued).toHaveLength(1)
  })

  it('41 个项目分批发出，一批 SYNC_INSPECT_BATCH_SIZE 个、同一时刻只有一批在飞', async () => {
    const { scheduler, inspectMany, flush } = harness()
    let inFlight = 0
    let peak = 0
    inspectMany.mockImplementation(async (ids: string[]) => {
      inFlight += 1; peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 1))
      inFlight -= 1
      return Object.fromEntries(ids.map((id) => [id, ready()]))
    })
    scheduler.request(projects(41))
    await flush()
    await vi.waitFor(() => expect(Object.keys(scheduler.snapshot())).toHaveLength(41))
    expect(peak).toBe(1)
    expect(inspectMany.mock.calls.every(([ids]) => ids.length <= SYNC_INSPECT_BATCH_SIZE)).toBe(true)
    expect(inspectMany).toHaveBeenCalledTimes(Math.ceil(41 / SYNC_INSPECT_BATCH_SIZE))
  })

  it('聚焦重新登记：项目没变、结果还新鲜就一次都不发；项目 revision 变了只重查那一个', async () => {
    const { scheduler, inspectMany, flush } = harness()
    scheduler.request(projects(3))
    await flush()
    await vi.waitFor(() => expect(Object.keys(scheduler.snapshot())).toHaveLength(3))
    inspectMany.mockClear()
    scheduler.request(projects(3))
    expect(inspectMany).not.toHaveBeenCalled()
    const changed = projects(3)
    changed[1] = { ...changed[1], revision: 2 }
    scheduler.request(changed)
    await flush()
    await vi.waitFor(() => expect(inspectMany).toHaveBeenCalledTimes(1))
    expect(inspectMany).toHaveBeenCalledWith(['p1'])
  })

  it('结果超过 TTL 才重查（外部同步工具补素材等不改 revision 的变化最终会被看到）', async () => {
    const { scheduler, inspectMany, flush, now } = harness()
    scheduler.request(projects(1))
    await flush()
    await vi.waitFor(() => expect(Object.keys(scheduler.snapshot())).toHaveLength(1))
    inspectMany.mockClear()
    now.value += SYNC_INSPECT_TTL_MS + 1
    scheduler.request(projects(1))
    await flush()
    await vi.waitFor(() => expect(inspectMany).toHaveBeenCalledTimes(1))
  })

  it('没有文件夹的项目不查；查失败 / 查不了的不记结果（卡片不显示徽标，不显示错的状态）', async () => {
    const { scheduler, inspectMany, flush } = harness()
    inspectMany.mockResolvedValueOnce({ p0: null })
    scheduler.request([{ id: 'p0', rootPath: '/x', revision: 1 }, { id: 'native-no-root', revision: 1 }])
    await flush()
    await vi.waitFor(() => expect(inspectMany).toHaveBeenCalledTimes(1))
    expect(inspectMany).toHaveBeenCalledWith(['p0'])
    expect(scheduler.snapshot()).toEqual({})
  })

  it('整批检查抛错不冒出调用栈，后面的批次照常', async () => {
    const { scheduler, inspectMany, flush } = harness()
    inspectMany.mockRejectedValueOnce(new Error('ipc down'))
    scheduler.request(projects(SYNC_INSPECT_BATCH_SIZE + 2))
    await flush()
    await vi.waitFor(() => expect(Object.keys(scheduler.snapshot())).toHaveLength(2))
  })

  describe('失效的结果不能冒充当前状态', () => {
    const missingAssets = (): WorkspaceSyncInspection => ({ ...ready(), status: 'missing-assets', missingAssetCount: 2 })

    it('先有旧值，项目变了再查返回 null：旧徽标撤掉，停在 unknown', async () => {
      const { scheduler, inspectMany, flush } = harness()
      inspectMany.mockResolvedValueOnce({ p0: missingAssets() })
      scheduler.request(projects(1))
      await flush()
      await vi.waitFor(() => expect(scheduler.snapshot().p0?.status).toBe('missing-assets'))
      inspectMany.mockResolvedValueOnce({ p0: null })
      scheduler.request(projects(1, 2))
      expect(scheduler.snapshot()).toEqual({})
      await flush()
      await vi.waitFor(() => expect(inspectMany).toHaveBeenCalledTimes(2))
      expect(scheduler.snapshot()).toEqual({})
    })

    it('先有旧值，超过 TTL 再查整批抛错：同样停在 unknown', async () => {
      const { scheduler, inspectMany, flush, now } = harness()
      inspectMany.mockResolvedValueOnce({ p0: missingAssets() })
      scheduler.request(projects(1))
      await flush()
      await vi.waitFor(() => expect(scheduler.snapshot().p0?.status).toBe('missing-assets'))
      now.value += SYNC_INSPECT_TTL_MS + 1
      inspectMany.mockRejectedValueOnce(new Error('ipc down'))
      scheduler.request(projects(1))
      await flush()
      await vi.waitFor(() => expect(inspectMany).toHaveBeenCalledTimes(2))
      expect(scheduler.snapshot()).toEqual({})
    })

    it('TTL 不是定时器：没有人再 request，过期的旧结果原样留着（这是缓存的可见限制，不自动刷新）', async () => {
      const { scheduler, inspectMany, flush, now } = harness()
      scheduler.request(projects(1))
      await flush()
      await vi.waitFor(() => expect(Object.keys(scheduler.snapshot())).toHaveLength(1))
      inspectMany.mockClear()
      now.value += SYNC_INSPECT_TTL_MS * 3
      await flush()
      expect(inspectMany).not.toHaveBeenCalled()
      expect(Object.keys(scheduler.snapshot())).toHaveLength(1)
    })
  })
})
