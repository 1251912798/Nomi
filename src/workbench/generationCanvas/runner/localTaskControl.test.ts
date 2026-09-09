import { notifications, notificationsStore } from '@mantine/notifications'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearTaskCancel, isTaskCancelRequested, requestTaskCancel } from './localTaskControl'

const mocks = vi.hoisted(() => ({ cancel: vi.fn(), interrupt: vi.fn(), unwatch: vi.fn(), status: vi.fn(), preview: vi.fn(), nodes: [] as Array<{ id: string; status: string; progress: { taskId: string } }> }))
vi.mock('../../../desktop/bridge', () => ({ getDesktopBridge: () => ({ tasks: { cancel: mocks.cancel, comfyuiInterrupt: mocks.interrupt, comfyuiUnwatch: mocks.unwatch } }) }))
vi.mock('../store/generationCanvasStore', () => ({ useGenerationCanvasStore: { getState: () => ({ nodes: mocks.nodes, setNodeStatus: mocks.status }) } }))
vi.mock('../store/nodeLivePreviewStore', () => ({ useNodeLivePreviewStore: { getState: () => ({ clearPreview: mocks.preview }) } }))

async function settled() { for (let step = 0; step < 5; step++) await Promise.resolve() }

describe('cancel feedback stays with its requesting host', () => {
  beforeEach(() => { vi.clearAllMocks(); notifications.clean(); clearTaskCancel('node'); mocks.nodes = []; mocks.unwatch.mockResolvedValue(undefined) })
  it('shows local cancellation failure inline without changing the task', async () => {
    mocks.cancel.mockResolvedValue({ ok: false })
    const present = vi.fn()
    requestTaskCancel({ id: 'node', progress: { taskId: 'local-task' } }, present)
    await settled()
    expect(present).toHaveBeenCalledWith('')
    expect(present.mock.calls.at(-1)?.[0]).toContain('没能确认')
    expect(mocks.status).not.toHaveBeenCalled()
    expect(notificationsStore.getState().notifications).toHaveLength(0)
  })
  it('retains the stale-task guard when cancellation finishes after a new run', async () => {
    mocks.cancel.mockResolvedValue({ ok: true })
    mocks.nodes = [{ id: 'node', status: 'running', progress: { taskId: 'local-new' } }]
    const present = vi.fn()
    requestTaskCancel({ id: 'node', progress: { taskId: 'local-old' } }, present)
    await settled()
    expect(mocks.status).not.toHaveBeenCalled()
    expect(present.mock.calls).toEqual([['']])
  })
  it('reports queue-only limits inline while retaining cancellation and unwatch', async () => {
    mocks.interrupt.mockResolvedValue({ ok: true, mode: 'queue-only' })
    const present = vi.fn()
    requestTaskCancel({ id: 'node', progress: { taskId: 'queued' } }, present)
    await settled()
    expect(present.mock.calls.at(-1)?.[0]).toContain('继续完成')
    expect(isTaskCancelRequested('node')).toBe(true)
    expect(mocks.status).toHaveBeenCalledWith('node', 'idle')
    expect(mocks.unwatch).toHaveBeenCalledWith('queued')
    expect(notificationsStore.getState().notifications).toHaveLength(0)
  })
})
