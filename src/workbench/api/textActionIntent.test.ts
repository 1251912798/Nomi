import { afterEach, describe, expect, it, vi } from 'vitest'
import { TEXT_ACTION_INTENT_PROPS, requestTextModelPrewarm } from './textActionIntent'

const bridge = vi.hoisted(() => ({ current: null as null | { tasks: { prewarmTextModel?: () => Promise<{ ok: boolean }> } } }))
vi.mock('../../desktop/bridge', () => ({ getDesktopBridge: () => bridge.current }))

afterEach(() => { vi.unstubAllGlobals() })

// 「整个会话只叫一次」是模块级状态，所以按真实先后写成一条：没桥 → 桥来了 → 指针移进 / 焦点进 / 再请求。
describe('有意图时（指针移进 / 焦点进文本动作）预热文本模型调用核心', () => {
  it('没桥不叫也不记账；有桥后在空闲回调里叫主进程，指针移进、焦点进、再请求合起来只叫一次', () => {
    const idle: Array<() => void> = []
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => { idle.push(callback); return idle.length })

    // 浏览器预览 / 单测：没有桌面桥，什么都不做，也不把「已请求」记下（桥来了还能叫）。
    expect(() => requestTextModelPrewarm()).not.toThrow()
    expect(idle).toHaveLength(0)

    const prewarmTextModel = vi.fn(async () => ({ ok: true }))
    bridge.current = { tasks: { prewarmTextModel } }
    TEXT_ACTION_INTENT_PROPS.onPointerEnter?.({} as never)
    TEXT_ACTION_INTENT_PROPS.onFocus?.({} as never)
    requestTextModelPrewarm()
    // 不当场叫：等渲染层空闲。
    expect(prewarmTextModel).not.toHaveBeenCalled()
    expect(idle).toHaveLength(1)
    idle[0]!()
    expect(prewarmTextModel).toHaveBeenCalledTimes(1)
  })
})
