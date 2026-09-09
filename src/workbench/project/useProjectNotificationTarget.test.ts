import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ mode: vi.fn(), navigate: vi.fn(), focus: vi.fn(), nodes: [] as { id: string }[] }))
vi.mock('../workbenchStore', () => ({ useWorkbenchStore: { getState: () => ({ setWorkspaceMode: mocks.mode }) } }))
vi.mock('../generationCanvas/store/generationCanvasStore', () => ({ useGenerationCanvasStore: { getState: () => ({ nodes: mocks.nodes }) } }))
vi.mock('../production/productionRunStore', () => ({ useProductionRunStore: { getState: () => ({ navigateTo: mocks.navigate }) } }))
vi.mock('../deepLinkFocus', () => ({ focusCanvasNodeWhenReady: mocks.focus }))
import { revealProjectTarget } from './useProjectNotificationTarget'

describe('notification project navigation', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('window', { dispatchEvent: vi.fn() }) })
  afterEach(() => vi.unstubAllGlobals())
  it('does not switch workspace until guarded hydration activates the original project', async () => {
    const activeProjectId = { current: 'new-project' as string | null }
    let finish!: (value: boolean) => void
    const hydrateProject = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve }))
    const operation = revealProjectTarget({ projectId: 'original', workspaceMode: 'preview' }, { activeProjectId, isHydrating: { current: false }, hydrateProject })
    expect(hydrateProject).toHaveBeenCalledWith('original', { replaceUrl: true })
    expect(mocks.mode).not.toHaveBeenCalled()
    activeProjectId.current = 'original'
    finish(true)
    expect(await operation).toBe(true)
    expect(mocks.mode).toHaveBeenCalledWith('preview')
  })
  it('does not act on a rejected or superseded project opening', async () => {
    const activeProjectId = { current: 'other' as string | null }
    for (const opened of [false, true]) {
      expect(await revealProjectTarget({ projectId: 'original', nodeIds: ['node-a'] }, { activeProjectId, isHydrating: { current: false }, hydrateProject: vi.fn(async () => opened) })).toBe(false)
    }
    expect(mocks.mode).not.toHaveBeenCalled()
    expect(mocks.focus).not.toHaveBeenCalled()
  })
  it('does not mistake a published project ID for completed Surface hydration', async () => {
    const activeProjectId = { current: 'original' as string | null }
    const isHydrating = { current: true }
    const hydrateProject = vi.fn(async () => true)
    expect(await revealProjectTarget({ projectId: 'original' }, { activeProjectId, isHydrating, hydrateProject })).toBe(false)
    expect(hydrateProject).toHaveBeenCalled()
    expect(mocks.mode).not.toHaveBeenCalled()
  })
  it('reuses the active project without hydration and guards delayed focus against later switches', async () => {
    const activeProjectId = { current: 'original' as string | null }
    const hydrateProject = vi.fn()
    mocks.focus.mockImplementationOnce(async (input: { hasNode: () => boolean; dispatch: (id: string) => void }) => {
      activeProjectId.current = 'other'
      expect(input.hasNode()).toBe(false)
      const dispatch = vi.spyOn(window, 'dispatchEvent')
      input.dispatch('node-a')
      expect(dispatch).not.toHaveBeenCalled()
      dispatch.mockRestore()
      return false
    })
    expect(await revealProjectTarget({ projectId: 'original', nodeIds: ['node-a'] }, { activeProjectId, isHydrating: { current: false }, hydrateProject })).toBe(false)
    expect(hydrateProject).not.toHaveBeenCalled()
  })
})
