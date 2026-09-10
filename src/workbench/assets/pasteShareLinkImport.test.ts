import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDesktopBridge } from '../../desktop/bridge'
import { useToastStore } from '../../ui/toast'
import { runPasteShareLinkImport, type PasteShareLinkDeps } from './pasteShareLinkImport'

vi.mock('../../desktop/bridge', () => ({ getDesktopBridge: vi.fn() }))
vi.mock('../../ui/toast', () => ({ useToastStore: { getState: () => ({ push, remove }) } }))
const { push, remove } = vi.hoisted(() => ({ push: vi.fn(), remove: vi.fn() }))

function dependencies(): PasteShareLinkDeps {
  return { prompt: vi.fn(async () => 'https://example.com/shared-video'), present: vi.fn(),
    t: ((key: string) => key) as PasteShareLinkDeps['t'], onImported: vi.fn(), onNeedKey: vi.fn() }
}
function bridge(importToProject = vi.fn(async () => ({ asset: { id: 'video-1' } }))) {
  vi.mocked(getDesktopBridge).mockReturnValue({ connector: { tikhub: {
    keyStatus: vi.fn(async () => ({ status: 'ok' })), importToProject,
  } } } as never)
  return importToProject
}

beforeEach(() => vi.clearAllMocks())

describe('share-link import feedback belongs to the invoking library', () => {
  it('clears old feedback, shows resolving locally and relies on the imported asset for success', async () => {
    const importToProject = bridge()
    const deps = dependencies()
    await runPasteShareLinkImport('project-a', deps)
    expect(importToProject).toHaveBeenCalledWith({ projectId: 'project-a', shareUrl: 'https://example.com/shared-video' })
    expect(deps.onImported).toHaveBeenCalledOnce()
    expect(vi.mocked(deps.present).mock.calls.map(([message]) => message)).toEqual(['', 'assetLibrary.pasteLink.resolving', ''])
    expect(useToastStore.getState().push).not.toHaveBeenCalled()
  })

  it('retains the actionable failure after clearing the resolving state', async () => {
    bridge(vi.fn(async () => { throw new Error('[tikhub:quota] quota exceeded') }))
    const deps = dependencies()
    await runPasteShareLinkImport('project-a', deps)
    expect(deps.present).toHaveBeenLastCalledWith('assetLibrary.pasteLink.errQuota')
    expect(deps.onImported).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('sends an earlier operation result only to its original host', async () => {
    let rejectImport!: (error: Error) => void
    bridge(vi.fn(() => new Promise<never>((_resolve, reject) => { rejectImport = reject })))
    const first = dependencies()
    const second = dependencies()
    const pending = runPasteShareLinkImport('project-a', first)
    await vi.waitFor(() => expect(rejectImport).toBeTypeOf('function'))
    await runPasteShareLinkImport(null, second)
    rejectImport(new Error('[tikhub:auth] expired'))
    await pending
    expect(first.present).toHaveBeenLastCalledWith('assetLibrary.pasteLink.errAuth')
    expect(second.present).toHaveBeenLastCalledWith('assetLibrary.pasteLink.needProject')
    expect(push).not.toHaveBeenCalled()
  })

  it('does not leave a success or failure message when the input is canceled', async () => {
    const importToProject = bridge()
    const deps = dependencies()
    vi.mocked(deps.prompt).mockResolvedValue(null)
    await runPasteShareLinkImport('project-a', deps)
    expect(deps.present).toHaveBeenCalledExactlyOnceWith('')
    expect(importToProject).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })
})
