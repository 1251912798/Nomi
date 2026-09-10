import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ showInFolder: vi.fn(), cancel: vi.fn(), reveal: vi.fn(), bridge: true }))
vi.mock('../../desktop/bridge', () => ({ getDesktopBridge: () => mocks.bridge ? { exports: { showInFolder: mocks.showInFolder, cancel: mocks.cancel } } : null }))
vi.mock('../../ui/notificationPolicy', () => ({ revealNotificationTarget: mocks.reveal }))
import { runExportJobTaskAction } from './exportJobTaskAction'
beforeEach(() => { vi.clearAllMocks(); mocks.bridge = true })
it('reveals the actual project output and acknowledges success', async () => {
  mocks.showInFolder.mockResolvedValue({ ok: true })
  await expect(runExportJobTaskAction({ kind: 'reveal_export_output', projectId: 'p', relativePath: 'exports/video.mp4' })).resolves.toBe(true)
  expect(mocks.showInFolder).toHaveBeenCalledWith({ projectId: 'p', relativePath: 'exports/video.mp4' })
})
it('returns through the existing project hydration navigation', async () => {
  mocks.reveal.mockResolvedValue(true)
  await expect(runExportJobTaskAction({ kind: 'return_to_export', projectId: 'p' })).resolves.toBe(true)
  expect(mocks.reveal).toHaveBeenCalledWith({ projectId: 'p', workspaceMode: 'preview' })
})
it('reports unavailable destinations instead of pretending the click worked', async () => {
  mocks.showInFolder.mockResolvedValue({ ok: false })
  await expect(runExportJobTaskAction({ kind: 'reveal_export_output', projectId: 'p', relativePath: 'exports/video.mp4' })).resolves.toBe(false)
  mocks.reveal.mockResolvedValue(false)
  await expect(runExportJobTaskAction({ kind: 'return_to_export', projectId: 'p' })).resolves.toBe(false)
  mocks.cancel.mockResolvedValue({ ok: false })
  await expect(runExportJobTaskAction({ kind: 'cancel_export_job', jobId: 'j' })).resolves.toBe(false)
  mocks.bridge = false
  await expect(runExportJobTaskAction({ kind: 'cancel_export_job', jobId: 'j' })).resolves.toBe(false)
})
