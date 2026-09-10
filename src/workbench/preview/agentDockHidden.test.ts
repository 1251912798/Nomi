import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import { subscribeWithSelector } from 'zustand/middleware'
import { createEditingPanelLayoutSlice, type EditingPanelLayoutSlice } from './editingPanelLayoutSlice'
import { EDITING_PANEL_DEFAULTS } from './panelLayout'

const makeStore = () => createStore<{ persistRevision: number } & EditingPanelLayoutSlice>()(
  subscribeWithSelector((...args) => ({ persistRevision: 0, ...createEditingPanelLayoutSlice(...args) })),
)

describe('collapsed dock user preference', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('defaults visible; dismiss survives rebuilding the store without modifying project persistence', () => {
    const store = makeStore()
    expect(store.getState().agentDockHidden).toBe(false)
    store.getState().setAgentDockHidden(true)
    expect(store.getState().agentDockHidden).toBe(true)
    expect(store.getState().persistRevision).toBe(0)
    expect(makeStore().getState().agentDockHidden).toBe(true)
  })

  it('panel restore, collapse, project layout load, presets and undo preserve dismissal', () => {
    const store = makeStore()
    store.getState().setAgentDockHidden(true)
    store.getState().setProjectAgentDockCollapsed(false)
    store.getState().setProjectAgentDockCollapsed(true)
    store.getState().setEditingPanelLayout(EDITING_PANEL_DEFAULTS, false)
    store.getState().setEditingPanelPreset('default')
    store.getState().resetEditingPanelLayout()
    store.getState().toggleEditingPanel('assistant')
    store.getState().undoEditingPanelLayout()
    expect(store.getState().agentDockHidden).toBe(true)
    expect(makeStore().getState().agentDockHidden).toBe(true)
  })

  it('unavailable preference storage does not prevent closing for this session', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('storage unavailable') },
      setItem: () => { throw new Error('storage unavailable') },
    })
    const store = makeStore()
    expect(store.getState().agentDockHidden).toBe(false)
    store.getState().setAgentDockHidden(true)
    expect(store.getState().agentDockHidden).toBe(true)
  })
})
