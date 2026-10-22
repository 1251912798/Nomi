import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ current: null as null | { tasks: { prewarmTextModel?: () => Promise<{ ok: boolean }> } } }))
vi.mock('../../desktop/bridge', () => ({ getDesktopBridge: () => bridge.current }))

beforeEach(() => {
  vi.resetModules()
  bridge.current = null
})

describe('有意图时（指针移进 / 焦点进文本动作）预热文本模型调用核心', () => {
  it('在空闲回调里叫主进程，整个会话只叫一次', async () => {
    const prewarmTextModel = vi.fn(async () => ({ ok: true }))
    bridge.current = { tasks: { prewarmTextModel } }
    const idle: Array<() => void> = []
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => { idle.push(callback); return idle.length })
    const { requestTextModelPrewarm } = await import('./textActionIntent')
    requestTextModelPrewarm()
    requestTextModelPrewarm()
    expect(prewarmTextModel).not.toHaveBeenCalled()
    expect(idle).toHaveLength(1)
    idle[0]!()
    expect(prewarmTextModel).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('没有桌面桥（浏览器预览 / 单测）就什么都不做，之后桥出现了还能叫', async () => {
    const { requestTextModelPrewarm } = await import('./textActionIntent')
    expect(() => requestTextModelPrewarm()).not.toThrow()
    const prewarmTextModel = vi.fn(async () => ({ ok: true }))
    bridge.current = { tasks: { prewarmTextModel } }
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => { callback(); return 1 })
    requestTextModelPrewarm()
    expect(prewarmTextModel).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})

describe('文本动作根元素上的意图属性', () => {
  it('指针移进或焦点进来都会请求预热（同一个会话只请求一次）', async () => {
    const prewarmTextModel = vi.fn(async () => ({ ok: true }))
    bridge.current = { tasks: { prewarmTextModel } }
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => { callback(); return 1 })
    const { TEXT_ACTION_INTENT_PROPS } = await import('./textActionIntent')
    TEXT_ACTION_INTENT_PROPS.onPointerEnter?.({} as never)
    TEXT_ACTION_INTENT_PROPS.onFocus?.({} as never)
    expect(prewarmTextModel).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})
