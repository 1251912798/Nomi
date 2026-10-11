import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { installHeldModifierReconciler, RECONCILED_MODIFIERS } from './heldModifierReconciler'

// 「按着的修饰键」以下一次真实输入事件自带的修饰位为准（2026-10-10 用户报：点第二张卡变「已选 2 个 · 编组」、卡拖不动）。
// 这里的 window（分阶段的假目标）/ document（普通 EventTarget）：
//   · 键盘事件先过 window 捕获（install 挂在那），再按「有没有被谁 stopPropagation」决定会不会送到 window 冒泡；
//   · document 上那只监听扮演 React Flow 的 useKeyPress——它只能靠收到 keyup 才知道键松了。
type Flags = { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }

function inputEvent(type: string, init: Flags & { key?: string } = {}): Event {
  return Object.assign(new Event(type), { shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...init })
}

/** 只够用的一只「window」：分得清捕获 / 冒泡两个阶段（Node 的 EventTarget 在目标上不分阶段）。 */
class PhasedTarget {
  private listeners: Array<{ type: string; listener: (event: Event) => void; capture: boolean }> = []
  addEventListener(type: string, listener: (event: Event) => void, options?: boolean | AddEventListenerOptions): void {
    this.listeners.push({ type, listener, capture: typeof options === 'boolean' ? options : Boolean(options?.capture) })
  }
  removeEventListener(type: string, listener: (event: Event) => void, options?: boolean | EventListenerOptions): void {
    const capture = typeof options === 'boolean' ? options : Boolean(options?.capture)
    this.listeners = this.listeners.filter((entry) => !(entry.type === type && entry.listener === listener && entry.capture === capture))
  }
  dispatchEvent(event: Event): boolean {
    this.fire(event, 'capture')
    this.fire(event, 'bubble')
    return true
  }
  fire(event: Event, phase: 'capture' | 'bubble'): void {
    for (const entry of [...this.listeners]) if (entry.type === event.type && entry.capture === (phase === 'capture')) entry.listener(event)
  }
}

function harness() {
  const windowTarget = new PhasedTarget()
  const documentTarget = new EventTarget()
  // React Flow 视角：按 keydown / keyup 成对记「按着没」。真 DOM 里送到 document 的 keyup 会接着冒泡到 window，这里照做。
  const believedDown = new Set<string>()
  documentTarget.addEventListener('keydown', (event) => believedDown.add((event as KeyboardEvent).key))
  documentTarget.addEventListener('keyup', (event) => {
    believedDown.delete((event as KeyboardEvent).key)
    windowTarget.fire(event, 'bubble')
  })
  let flushes = 0
  const dispose = installHeldModifierReconciler({
    windowTarget: windowTarget as unknown as EventTarget,
    documentTarget,
    flush: (run) => { flushes += 1; run() },
    makeKeyup: (key) => Object.assign(new Event('keyup'), { key }),
  })
  // 真实键盘：window 捕获 → （没人拦就）document → window 冒泡。stoppedInApp = 焦点里的编辑区 stopPropagation 了。
  const key = (type: 'keydown' | 'keyup', name: string, { stoppedInApp = false, swallowedByOs = false, held = {} as Flags } = {}) => {
    if (swallowedByOs) return
    const flags: Flags = type === 'keydown'
      ? { shiftKey: name === 'Shift', metaKey: name === 'Meta', ctrlKey: name === 'Control', altKey: name === 'Alt' }
      : {}
    const event = inputEvent(type, { key: name, ...flags, ...held })
    windowTarget.fire(event, 'capture')
    if (stoppedInApp) return
    documentTarget.dispatchEvent(event)
    if (type === 'keydown') windowTarget.fire(event, 'bubble')
  }
  const pointer = (type: 'pointermove' | 'pointerdown' | 'mousedown' | 'wheel', flags: Flags = {}) => windowTarget.fire(inputEvent(type, flags), 'capture')
  return { believedDown, key, pointer, dispose, flushes: () => flushes }
}

describe('installHeldModifierReconciler', () => {
  it('用户报的那一下：Shift 松开被系统吞掉，下一次不带 Shift 的按下前就把它放开', () => {
    const h = harness()
    h.key('keydown', 'Shift')
    h.key('keyup', 'Shift', { swallowedByOs: true })
    expect(h.believedDown.has('Shift')).toBe(true)
    h.pointer('pointerdown', { shiftKey: false })
    expect(h.believedDown.has('Shift')).toBe(false)
    h.dispose()
  })

  it('松开被焦点里的编辑区 stopPropagation 拦下（React Flow 收不到）：同样在下一次按下前放开', () => {
    const h = harness()
    h.key('keydown', 'Shift')
    h.key('keyup', 'Shift', { stoppedInApp: true })
    expect(h.believedDown.has('Shift')).toBe(true)
    h.pointer('pointerdown')
    expect(h.believedDown.has('Shift')).toBe(false)
    h.dispose()
  })

  // 类级矩阵：登记的每个修饰键（RECONCILED_MODIFIERS 清单）× 两种丢法 × 每一种带修饰位的后续输入，全都得对上账；
  // 同一格里真按着的那一下（修饰位 true）必须什么都不发。
  const LOSS_MODES = ['swallowedByOs', 'stoppedInApp'] as const
  const FOLLOW_UPS = ['pointermove', 'pointerdown', 'mousedown', 'wheel', 'keydown'] as const
  const MATRIX = RECONCILED_MODIFIERS.flatMap((modifier) => LOSS_MODES.flatMap((loss) => FOLLOW_UPS.map((followUp) => ({ modifier, loss, followUp }))))
  it.each(MATRIX)('矩阵：$modifier 松开被 $loss 吞掉，下一次 $followUp 对账', ({ modifier, loss, followUp }) => {
    const h = harness()
    const flag = { Shift: 'shiftKey', Meta: 'metaKey', Control: 'ctrlKey', Alt: 'altKey' }[modifier]
    h.key('keydown', modifier)
    // 真按着：同一种输入带着修饰位 true，不能补发。
    if (followUp === 'keydown') h.key('keydown', 'x', { held: { [flag]: true } })
    else h.pointer(followUp, { [flag]: true })
    expect(h.believedDown.has(modifier)).toBe(true)
    expect(h.flushes()).toBe(0)
    h.key('keyup', modifier, { [loss]: true })
    expect(h.believedDown.has(modifier)).toBe(true)
    if (followUp === 'keydown') h.key('keydown', 'a')
    else h.pointer(followUp)
    expect(h.believedDown.has(modifier)).toBe(false)
    expect(h.flushes()).toBe(1)
    h.dispose()
  })

  it('鼠标一挪就对账：界面在用户点下去之前就回到「没按着」的样子', () => {
    const h = harness()
    h.key('keydown', 'Shift')
    h.key('keyup', 'Shift', { swallowedByOs: true })
    h.pointer('pointermove')
    expect(h.believedDown.has('Shift')).toBe(false)
    h.dispose()
  })

  it('滚轮、别的键按下也带修饰位，一样能对账', () => {
    const h = harness()
    h.key('keydown', 'Meta')
    h.key('keyup', 'Meta', { swallowedByOs: true })
    h.pointer('wheel', { metaKey: false })
    expect(h.believedDown.has('Meta')).toBe(false)

    h.key('keydown', 'Shift')
    h.key('keyup', 'Shift', { swallowedByOs: true })
    h.key('keydown', 'a')
    expect(h.believedDown.has('Shift')).toBe(false)
    h.dispose()
  })

  it('真按着（事件修饰位还是 true）时什么都不做：Shift 多选、Shift 框选照常', () => {
    const h = harness()
    h.key('keydown', 'Shift')
    h.pointer('pointerdown', { shiftKey: true })
    h.pointer('mousedown', { shiftKey: true })
    expect(h.believedDown.has('Shift')).toBe(true)
    expect(h.flushes()).toBe(0)
    h.dispose()
  })

  it('松开正常送到了每个人：不补发任何东西', () => {
    const h = harness()
    h.key('keydown', 'Shift')
    h.key('keyup', 'Shift')
    h.pointer('pointerdown')
    expect(h.flushes()).toBe(0)
    h.dispose()
  })

  it('补发只补一次：同一次丢失不会在后面每一下按下都再补', () => {
    const h = harness()
    h.key('keydown', 'Shift')
    h.key('keyup', 'Shift', { swallowedByOs: true })
    h.pointer('pointerdown')
    h.pointer('mousedown')
    h.pointer('pointerdown')
    expect(h.flushes()).toBe(1)
    h.dispose()
  })

  it('卸下后不再对账', () => {
    const h = harness()
    h.dispose()
    h.key('keydown', 'Shift')
    h.key('keyup', 'Shift', { swallowedByOs: true })
    h.pointer('pointerdown')
    expect(h.believedDown.has('Shift')).toBe(true)
  })

  it('结构：渲染进程入口在挂 React 之前装上它（全 App 一处，画布 / 版本卡 / 导演台的按键状态都吃这一处）', () => {
    const entry = fs.readFileSync(path.resolve(__dirname, '../../main.tsx'), 'utf8')
    const install = entry.indexOf('installHeldModifierReconciler()')
    expect(install).toBeGreaterThan(-1)
    expect(install).toBeLessThan(entry.indexOf('root?.render('))
  })
})
