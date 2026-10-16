import { describe, expect, it } from 'vitest'
import { planItemMounts, type MountPlanInput } from './storyboardMountPlan'

/**
 * 快速滚动不建编辑器（V-1210 首轮第 2 项：滚动中行挂卸集中发生，100 次滚轮 96 个长任务）。
 * 不变量：滚动中新进来的镜头行一律是占位；已是完整行的不降级；停下后每帧只升级一个，视口里的先。
 */
const shots = (keys: string[], inViewport: (key: string) => boolean = () => true): MountPlanInput['items'] =>
  keys.map((key) => ({ key, kind: 'shot' as const, inViewport: inViewport(key) }))
const none = new Set<string>()

describe('窗口化列表：完整行还是占位', () => {
  it('打开方案（不在滚动、第一次出现）：全部完整行', () => {
    const plan = planItemMounts({ items: shots(['a', 'b', 'c']), isScrolling: false, previousFull: none, previousLight: none, pinned: none })
    expect([...plan.full]).toEqual(['a', 'b', 'c'])
    expect(plan.light.size).toBe(0)
  })

  it('滚动中新进来的镜头行：一律占位，挂一行完整行都不建（与一次滚过多少行无关）', () => {
    const entering = Array.from({ length: 40 }, (_, i) => `s${i}`)
    const plan = planItemMounts({ items: shots(['a', ...entering]), isScrolling: true, previousFull: new Set(['a']), previousLight: none, pinned: none })
    expect([...plan.full]).toEqual(['a'])
    expect(plan.light.size).toBe(40)
  })

  it('已经是完整行的、钉住的、组头：滚动中也是完整行（编辑器不会在用户眼前被拆）', () => {
    const plan = planItemMounts({
      items: [{ key: 'head', kind: 'head', inViewport: true }, ...shots(['kept', 'focused', 'new'])],
      isScrolling: true, previousFull: new Set(['kept']), previousLight: none, pinned: new Set(['focused']),
    })
    expect([...plan.full].sort()).toEqual(['focused', 'head', 'kept'])
    expect([...plan.light]).toEqual(['new'])
  })

  it('停下后每帧只升级一个占位，视口里的先于缓冲区的', () => {
    const items = shots(['buffer-above', 'view-1', 'view-2'], (key) => key.startsWith('view'))
    const light = new Set(['buffer-above', 'view-1', 'view-2'])
    const first = planItemMounts({ items, isScrolling: false, previousFull: none, previousLight: light, pinned: none })
    expect([...first.full]).toEqual(['view-1'])
    const second = planItemMounts({ items, isScrolling: false, previousFull: first.full, previousLight: first.light, pinned: none })
    expect([...second.full].sort()).toEqual(['view-1', 'view-2'])
    const third = planItemMounts({ items, isScrolling: false, previousFull: second.full, previousLight: second.light, pinned: none })
    expect(third.light.size).toBe(0)
  })
})
