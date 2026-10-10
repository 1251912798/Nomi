import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { installHeldModifierReconciler, RECONCILED_MODIFIERS } from './heldModifierReconciler'

// 「按着的修饰键」以下一次真实输入事件自带的修饰位为准（2026-10-10 用户报：点第二张卡变「已选 2 个 · 编组」、卡拖不动）。
// 这里的 window / document 是两只普通 EventTarget：
//   · 键盘事件先过 window 捕获（install 挂在那），再按「有没有被谁 stopPropagation」决定会不会送到 window 冒泡；
//   · document 上那只监听扮演 React Flow 的 useKeyPress——它只能靠收到 keyup 才知道键松了。
type Flags = { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }

function inputEvent(type: string, init: Flags & { key?: string } = {}): Event {
  return Object.assign(new Event(type), { shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...init })
}

function harness() {
  const windowTarget = new EventTarget()
  const documentTarget = new EventTarget()
  // React Flow 视角：按 keydown / keyup 成对记「按着没」。
  const believedDown = new Set<string>()
  documentTarget.addEventListener('keydown', (event) => believedDown.add((event as KeyboardEvent).key))
  documentTarget.addEventListener('keyup', (event) => believedDown.delete((event as KeyboardEvent).key))
  let flushes = 0
  const dispose = installHeldModifierReconciler({
    windowTarget,
    documentTarget,
    flush: (run) => { flushes += 1; run() },
    makeKeyup: (key) => Object.assign(new Event('keyup'), { key }),
  })
  // 真实键盘：window 捕获 → （没人拦就）document → window 冒泡。stoppedInApp = 焦点里的编辑区 stopPropagation 了。
  const key = (type: 'keydown' | 'keyup', name: string, { stoppedInApp = false, swallowedByOs = false } = {}) => {
    if (swallowedByOs) return
    const flags: Flags = type === 'keydown'
      ? { shiftKey: name === 'Shift', metaKey: name === 'Meta', ctrlKey: name === 'Control', altKey: name === 'Alt' }
      : {}
    windowTarget.dispatchEvent(inputEvent(type, { key: name, ...flags }))
    if (stoppedInApp) return
    documentTarget.dispatchEvent(inputEvent(type, { key: name, ...flags }))
    windowTarget.dispatchEvent(inputEvent(type, { key: name, ...flags }))
  }
  const pointer = (type: 'pointerdown' | 'mousedown' | 'wheel', flags: Flags = {}) => windowTarget.dispatchEvent(inputEvent(type, flags))
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

  it.each(RECONCILED_MODIFIERS)('四个修饰键一个规矩：%s', (modifier) => {
    const h = harness()
    h.key('keydown', modifier)
    h.key('keyup', modifier, { swallowedByOs: true })
    h.pointer('mousedown')
    expect(h.believedDown.has(modifier)).toBe(false)
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
