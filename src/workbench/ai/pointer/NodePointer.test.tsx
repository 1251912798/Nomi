// 指向元素的组件级测试（NodePointer 板；第②步验收清单 S1 / S2 / S3 / S5 / S6 / S8 / S10，外加独立验收 V-d2-pointer 建议 A B D E F 的回归）。
// 测试宿主没有 DOM：读标记用 renderToStaticMarkup，交互用仓库已有的 react-reconciler 测试渲染器直接调 props 上的回调。
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const seen = vi.hoisted(() => ({ reveal: vi.fn(), modelLabelCalls: 0, catalogReady: true }))
vi.mock('./revealNodeFromChat', () => ({ revealNodeFromChat: seen.reveal, returnToChat: vi.fn() }))
// 模型显示名读目录（异步）；这里换成同步桩（`catalogReady` 模拟「目录晚到」），顺便数一个指向元素渲染了几次（每渲染一次读一次）。
vi.mock('../../generation/list/generationListModelLabels', () => ({
  useModelLabels: () => {
    seen.modelLabelCalls += 1
    return (node: { meta?: Record<string, unknown> } | undefined) => (seen.catalogReady && node?.meta?.modelKey ? 'Seedance 2' : '')
  },
}))

import i18n from '../../../i18n'
import type { GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'
import { useGenerationCanvasStore } from '../../generationCanvas/store/generationCanvasStore'
import { useNodeExternalHighlightStore } from '../../generationCanvas/store/nodeExternalHighlightStore'
import { createReactTestRenderer } from '../v4/testReactRenderer'
import { enNodePointer } from '../../../i18n/locales/nodePointer'
import { NodePointer, NodePointerGroup, NodePointerReturnToChat, type NodePointerSubject } from './NodePointer'
import { useNodePointerStore, type NodePointerReturn } from './nodePointerStore'

const video = (id: string, patch: Partial<GenerationCanvasNode> = {}): GenerationCanvasNode => ({
  id, kind: 'video', title: `shot-${id}`, prompt: '', categoryId: 'shots', position: { x: 0, y: 0 }, status: 'idle',
  meta: { modelKey: 'seedance-2', modelVendor: 'apimart', aspect_ratio: '16:9', duration: 4 }, ...patch,
} as GenerationCanvasNode)

/** 不许蓝色描边：边线 / 环 / 描边 / 阴影上不许出现强调色或 info 色（转圈的文字色不算描边）。 */
const ACCENT_OUTLINE = /(?:border|ring|outline|shadow)-[^"\s]*(?:accent|info)/

// renderToStaticMarkup 读 store 走「服务端快照」（zustand 的 getInitialState），同仓 storyboardShotLabel.surfaces.test 的做法：
// 把要读的那几格同时写进活 store 与快照，测完放回去。
const SERVER = useGenerationCanvasStore.getInitialState() as unknown as { nodes: GenerationCanvasNode[]; isReady: boolean }
const SERVER_ORIGINAL = { nodes: SERVER.nodes, isReady: SERVER.isReady }

function seed(nodes: GenerationCanvasNode[], ready = true): void {
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes, edges: [], groups: [] }, 'project-pointer')
  if (!ready) useGenerationCanvasStore.setState({ isReady: false })
  SERVER.nodes = nodes
  SERVER.isReady = ready
}

type Host = { type: string; props: Record<string, unknown> }

function mount(element: React.ReactElement) {
  const hosts: Host[] = []
  const renderer = createReactTestRenderer<Host>({
    createInstance: (type, props) => {
      const host = { type, props }
      hosts.push(host)
      return host
    },
  })
  renderer.render(element)
  renderer.flushPassiveEffects()
  const buttons = () => hosts.filter((host) => host.type === 'button' && typeof host.props['data-node-pointer'] === 'string')
  /** 组下方那一行（`<p>`）此刻的字：最近挂上的那一个（有内容 / 空行是两个组件，切换时会重新挂一个）。 */
  const summaryLine = () => String(hosts.filter((host) => host.type === 'p').at(-1)?.props.children ?? '')
  return { renderer, buttons, summaryLine }
}

beforeEach(async () => {
  await i18n.changeLanguage('zh-CN')
  seen.reveal.mockReset()
  seen.modelLabelCalls = 0
  seen.catalogReady = true
  seed([video('n1'), video('n2'), video('tall', { meta: { modelKey: 'seedance-2', aspect_ratio: '9:16', duration: 5, resolution: '480p' } })])
  useNodeExternalHighlightStore.setState({ hoverNodeId: null, claims: [] })
})

afterEach(() => {
  useNodeExternalHighlightStore.setState({ hoverNodeId: null, claims: [] })
  SERVER.nodes = SERVER_ORIGINAL.nodes
  SERVER.isReady = SERVER_ORIGINAL.isReady
})

describe('NodePointer · one face read from the node', () => {
  it('card: label row, frame and a read-only summary read from the node; aria = name + action', () => {
    const markup = renderToStaticMarkup(<NodePointer subject={{ nodeId: 'n1' }} />)
    expect(markup).toContain('data-node-pointer-face="empty"')
    expect(markup).toContain('Seedance 2 · 16:9 · 4s')
    expect(markup).toContain(`aria-label="${i18n.t('nodePointer.ariaPlain', { name: 'shot-n1' })}"`)
    expect(markup).not.toMatch(ACCENT_OUTLINE)
  })

  it('row drops the ratio for landscape, keeps it for portrait; a single portrait card puts the summary beside the frame', () => {
    expect(renderToStaticMarkup(<NodePointer subject={{ nodeId: 'n1' }} density="row" />)).toContain('Seedance 2 · 4s')
    expect(renderToStaticMarkup(<NodePointer subject={{ nodeId: 'tall' }} density="row" />)).toContain('Seedance 2 · 9:16 · 5s')
    const side = renderToStaticMarkup(<NodePointer subject={{ nodeId: 'tall' }} />)
    expect(side).toContain('9:16 · 5s · 480p')
    expect(side).toContain('aspect-ratio:0.5625')
  })

  it('failed shows the node’s own reason in the status bar and the host outcome on the summary line', () => {
    seed([video('n1', { status: 'error', error: 'socket hang up' })])
    const markup = renderToStaticMarkup(<NodePointer subject={{ nodeId: 'n1', outcome: 'host-outcome' }} />)
    expect(markup).toContain('data-node-pointer-face="failed"')
    expect(markup).toContain('data-generation-status')
    expect(markup).toContain('host-outcome')
    expect(markup).toContain('text-nomi-danger-ink')
    expect(markup).not.toMatch(ACCENT_OUTLINE)
  })
})

describe('NodePointer · deleted only on an explicit fact (board D4)', () => {
  const gone: NodePointerSubject = { nodeId: 'missing', fallbackLabel: { shot: 'S05', title: 'sunrise' } }

  it('host says removed: struck-through snapshot label, 已删除, not clickable, read out as deleted', () => {
    const markup = renderToStaticMarkup(<NodePointer subject={{ ...gone, removed: true }} />)
    expect(markup).toContain('data-node-pointer-face="removed"')
    expect(markup).toContain('aria-disabled="true"')
    expect(markup).toContain(i18n.t('nodePointer.deleted'))
    expect(markup).toContain(i18n.t('nodePointer.deletedHint'))
    expect(markup).toContain('line-through')
    expect(markup).toContain(`aria-label="${i18n.t('nodePointer.ariaDeleted', { name: 'S05 sunrise' })}"`)
  })

  it('node merely missing, or the canvas not loaded yet: a neutral placeholder that never says deleted', () => {
    const missing = renderToStaticMarkup(<NodePointer subject={gone} />)
    expect(missing).toContain('data-node-pointer-face="unavailable"')
    expect(missing).not.toContain(i18n.t('nodePointer.deleted'))
    seed([video('n1')], false)
    const loading = renderToStaticMarkup(<NodePointer subject={{ nodeId: 'n1' }} />)
    expect(loading).toContain('data-node-pointer-face="unavailable"')
    expect(loading).not.toContain(i18n.t('nodePointer.deleted'))
    expect(loading).toContain('aria-disabled="true"')
  })

  it('clicking a deleted or unavailable pointer goes nowhere; a live one goes to its node', () => {
    const { renderer, buttons } = mount(<><NodePointer subject={{ ...gone, removed: true }} /><NodePointer subject={{ nodeId: 'n1' }} /></>)
    try {
      ;(buttons()[0]!.props.onClick as () => void)()
      expect(seen.reveal).not.toHaveBeenCalled()
      ;(buttons()[1]!.props.onClick as () => void)()
      expect(seen.reveal).toHaveBeenCalledWith({ nodeId: 'n1', label: 'shot-n1' })
    } finally {
      renderer.close()
    }
  })
})

describe('NodePointer · hover lights the node and only clears its own claim (S5)', () => {
  it('enter / leave publish and clear the canvas hover', () => {
    const { renderer, buttons } = mount(<NodePointer subject={{ nodeId: 'n1' }} />)
    try {
      ;(buttons()[0]!.props.onPointerEnter as () => void)()
      expect(useNodeExternalHighlightStore.getState().hoverNodeId).toBe('n1')
      ;(buttons()[0]!.props.onPointerLeave as () => void)()
      expect(useNodeExternalHighlightStore.getState().hoverNodeId).toBeNull()
    } finally {
      renderer.close()
    }
  })

  it('two pointers on the same node: one leaving does not clear the other; unmount releases', () => {
    const { renderer, buttons } = mount(<><NodePointer subject={{ nodeId: 'n1' }} /><NodePointer subject={{ nodeId: 'n1' }} density="row" /></>)
    try {
      const [a, b] = buttons()
      ;(a!.props.onPointerEnter as () => void)()
      ;(b!.props.onFocus as () => void)()
      ;(a!.props.onPointerLeave as () => void)()
      expect(useNodeExternalHighlightStore.getState().hoverNodeId).toBe('n1')
    } finally {
      renderer.close()
    }
    expect(useNodeExternalHighlightStore.getState().hoverNodeId).toBeNull()
  })

  it.each([
    ['first in, first out', [0, 1]],
    ['last in, first out', [1, 0]],
  ] as const)('two pointers on the same node, %s: the node stays lit until the last one leaves (V-d2-pointer E3)', (_order, leaving) => {
    const { renderer, buttons } = mount(<><NodePointer subject={{ nodeId: 'n1' }} /><NodePointer subject={{ nodeId: 'n1' }} density="row" /></>)
    try {
      const pointers = buttons()
      ;(pointers[0]!.props.onPointerEnter as () => void)()
      ;(pointers[1]!.props.onPointerEnter as () => void)()
      expect(useNodeExternalHighlightStore.getState().hoverNodeId).toBe('n1')
      ;(pointers[leaving[0]]!.props.onPointerLeave as () => void)()
      // 先走的是谁都一样：另一个还在指着，画布上的亮不能被清掉（原来只有一个槽，后到者一走就清掉先到者的）。
      expect(useNodeExternalHighlightStore.getState().hoverNodeId).toBe('n1')
      ;(pointers[leaving[1]]!.props.onPointerLeave as () => void)()
      expect(useNodeExternalHighlightStore.getState().hoverNodeId).toBeNull()
    } finally {
      renderer.close()
    }
  })

  it('pointers on different nodes: the latest lights its node, and the earlier one lights again when the latest leaves', () => {
    const { renderer, buttons } = mount(<><NodePointer subject={{ nodeId: 'n1' }} /><NodePointer subject={{ nodeId: 'n2' }} density="row" /></>)
    try {
      const [first, second] = buttons()
      ;(first!.props.onFocus as () => void)()
      ;(second!.props.onPointerEnter as () => void)()
      expect(useNodeExternalHighlightStore.getState().hoverNodeId).toBe('n2')
      ;(second!.props.onPointerLeave as () => void)()
      expect(useNodeExternalHighlightStore.getState().hoverNodeId).toBe('n1')
      ;(first!.props.onBlur as () => void)()
      expect(useNodeExternalHighlightStore.getState().hoverNodeId).toBeNull()
    } finally {
      renderer.close()
    }
  })

  it('a deleted pointer never lights anything on the canvas', () => {
    const { renderer, buttons } = mount(<NodePointer subject={{ nodeId: 'missing', removed: true }} />)
    try {
      ;(buttons()[0]!.props.onPointerEnter as () => void)()
      expect(useNodeExternalHighlightStore.getState().hoverNodeId).toBeNull()
    } finally {
      renderer.close()
    }
  })
})

describe('NodePointer · subscriptions (S10)', () => {
  it('editing another node does not re-render the pointer; editing its own node does', async () => {
    const { renderer } = mount(<NodePointer subject={{ nodeId: 'n1' }} />)
    try {
      seen.modelLabelCalls = 0
      useGenerationCanvasStore.getState().updateNode('n2', { title: 'renamed elsewhere' })
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      renderer.flushPassiveEffects()
      expect(seen.modelLabelCalls).toBe(0)
      useGenerationCanvasStore.getState().updateNode('n1', { title: 'renamed here' })
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      renderer.flushPassiveEffects()
      expect(seen.modelLabelCalls).toBeGreaterThan(0)
    } finally {
      renderer.close()
    }
  })
})

describe('NodePointerGroup · folding (board pointer.group.more, D-b)', () => {
  const subjects = (count: number): NodePointerSubject[] => Array.from({ length: count }, (_, index) => ({ nodeId: `g${index}` }))

  it('five: three tiles, the third carries 还有 2 个; four folds too', () => {
    seed(Array.from({ length: 5 }, (_, index) => video(`g${index}`)))
    const five = renderToStaticMarkup(<NodePointerGroup subjects={subjects(5)} />)
    expect(five.match(/data-node-pointer="card"/g)).toHaveLength(3)
    expect(five).toContain('data-node-pointer-more="2"')
    expect(five).toContain(i18n.t('nodePointer.more', { count: 2 }))
    const four = renderToStaticMarkup(<NodePointerGroup subjects={subjects(4)} />)
    expect(four).toContain('data-node-pointer-more="1"')
    const three = renderToStaticMarkup(<NodePointerGroup subjects={subjects(3)} />)
    expect(three).not.toContain('data-node-pointer-more')
    const chips = renderToStaticMarkup(<NodePointerGroup subjects={subjects(5)} density="chip" />)
    expect(chips).toContain(i18n.t('nodePointer.moreCompact', { count: 2 }))
    for (const markup of [five, four, three, chips]) expect(markup).not.toMatch(ACCENT_OUTLINE)
  })
})

describe('NodePointer · the read-out name carries what the host said (V-d2-pointer E)', () => {
  const reasonIn = (markup: string): string => /data-generation-message[^>]*>([^<]+)</.exec(markup)?.[1] ?? ''

  it.each(['card', 'row', 'chip'] as const)('failed %s: the node reason and the host outcome are both read out; with no outcome the name is as before', (density) => {
    seed([video('n1', { status: 'error', error: 'socket hang up' })])
    const reason = reasonIn(renderToStaticMarkup(<NodePointer subject={{ nodeId: 'n1' }} />))
    expect(reason).not.toBe('')
    const withOutcome = renderToStaticMarkup(<NodePointer subject={{ nodeId: 'n1', outcome: 'host-outcome' }} density={density} />)
    expect(withOutcome).toContain(`aria-label="${i18n.t('nodePointer.ariaOutcome', { name: 'shot-n1', status: reason, outcome: 'host-outcome' })}"`)
    const plain = renderToStaticMarkup(<NodePointer subject={{ nodeId: 'n1' }} density={density} />)
    expect(plain).toContain(`aria-label="${i18n.t('nodePointer.aria', { name: 'shot-n1', status: reason })}"`)
    expect(plain).not.toContain('host-outcome')
  })

  it('an outcome only means something on a failed pointer; a finished one ignores it', () => {
    const markup = renderToStaticMarkup(<NodePointer subject={{ nodeId: 'n1', outcome: 'host-outcome' }} />)
    expect(markup).not.toContain('host-outcome')
  })
})

describe('NodePointer · the failed outcome line stays red (V-d2-pointer F)', () => {
  /** 带这段文字的那个元素上的 class。 */
  const classOfText = (markup: string, text: string): string => new RegExp(`<[a-z]+ class="([^"]*)"[^>]*>${text}</`).exec(markup)?.[1] ?? ''

  it.each(['card', 'row'] as const)('%s: the host outcome is danger ink, not the muted gray the board render fell into by CSS-specificity accident', (density) => {
    seed([video('n1', { status: 'error', error: 'socket hang up' })])
    const markup = renderToStaticMarkup(<NodePointer subject={{ nodeId: 'n1', outcome: 'host-outcome' }} density={density} />)
    expect(classOfText(markup, 'host-outcome')).toContain('text-nomi-danger-ink')
  })
})

describe('NodePointerGroup · the line under the tiles (V-d2-pointer A)', () => {
  const tiles = (count: number): NodePointerSubject[] => Array.from({ length: count }, (_, index) => ({ nodeId: `g${index}` }))
  const seedGroup = (): void => seed(Array.from({ length: 3 }, (_, index) => video(`g${index}`)))
  /** 空行里放的那个不换行空格（撑着行高）。 */
  const BLANK = String.fromCharCode(0xa0)

  it('one line of height is always there, empty while nothing is hovered, so hovering never pushes what is below down', () => {
    seedGroup()
    const markup = renderToStaticMarkup(<NodePointerGroup subjects={tiles(3)} />)
    expect(markup).toMatch(new RegExp(`<p class="[^"]*"[^>]*aria-hidden="true"[^>]*>${BLANK}</p>`))
    expect(markup).not.toContain('data-node-pointer-hover-summary')
  })

  it('shows the hovered tile’s summary, worked out from the node each time: it follows a late catalog and a rename', async () => {
    seedGroup()
    seen.catalogReady = false
    const { renderer, buttons, summaryLine } = mount(<NodePointerGroup subjects={tiles(3)} />)
    try {
      ;(buttons()[1]!.props.onPointerEnter as () => void)()
      renderer.flushPassiveEffects()
      // 模型目录还没到：摘要里先没有模型名。
      expect(summaryLine()).toBe('shot-g1 · 16:9 · 4s')
      // 目录到了（组被重渲）：不用再悬停一次，摘要自己补上模型名（原来摘要被拍成字符串存进 state，之后不刷新）。
      seen.catalogReady = true
      renderer.render(<NodePointerGroup subjects={tiles(3)} />)
      renderer.flushPassiveEffects()
      expect(summaryLine()).toBe('shot-g1 · Seedance 2 · 16:9 · 4s')
      // 节点改名：摘要跟着变。
      useGenerationCanvasStore.getState().updateNode('g1', { title: 'renamed' })
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      renderer.flushPassiveEffects()
      expect(summaryLine()).toBe('renamed · Seedance 2 · 16:9 · 4s')
      // 离开：回到空行。
      ;(buttons()[1]!.props.onPointerLeave as () => void)()
      renderer.flushPassiveEffects()
      expect(summaryLine()).toBe(BLANK)
    } finally {
      renderer.close()
    }
  })

  it('two tiles in a row: leaving the earlier one does not blank the line of the one still hovered', () => {
    seedGroup()
    const { renderer, buttons, summaryLine } = mount(<NodePointerGroup subjects={tiles(3)} />)
    try {
      ;(buttons()[0]!.props.onFocus as () => void)()
      ;(buttons()[2]!.props.onPointerEnter as () => void)()
      renderer.flushPassiveEffects()
      expect(summaryLine()).toContain('shot-g2')
      ;(buttons()[0]!.props.onBlur as () => void)()
      renderer.flushPassiveEffects()
      expect(summaryLine()).toContain('shot-g2')
    } finally {
      renderer.close()
    }
  })
})

describe('NodePointerReturnToChat · the visible words obey §1.8 rule 3, the accessible name says it all (V-d2-pointer D)', () => {
  // renderToStaticMarkup 读 store 走「服务端快照」：把要读的那一格同时写进快照，测完放回去（同上面画布 store 的做法）。
  const POINTER_SERVER = useNodePointerStore.getInitialState() as unknown as { returnTo: NodePointerReturn | null }
  const visibleText = (markup: string): string => markup.replace(/<[^>]+>/g, '').trim()
  const words = (text: string): number => text.split(/\s+/).filter(Boolean).length

  afterEach(() => {
    POINTER_SERVER.returnTo = null
  })

  it('English: the visible text is at most two words, the read-out and hover name keep “Back to chat”', async () => {
    await i18n.changeLanguage('en')
    POINTER_SERVER.returnTo = { surface: 'generation', form: 'float', nodeId: 'n1', label: 'Shot 02' }
    const plain = renderToStaticMarkup(<NodePointerReturnToChat />)
    expect(words(visibleText(plain))).toBeLessThanOrEqual(2)
    expect(plain).toContain('aria-label="Back to chat"')
    expect(plain).toContain('title="Back to chat"')
    const labelled = renderToStaticMarkup(<NodePointerReturnToChat withLabel />)
    // 带那一枚标签的形态：标签之外的动作词同样 ≤2 词；读屏名带标签写全。
    expect(words(visibleText(labelled).replace('Shot 02 ·', ''))).toBeLessThanOrEqual(2)
    expect(labelled).toContain('aria-label="Shot 02 · Back to chat"')
    // 词条本身也钉一遍（组件不渲染时也不会漂回 3 词）。
    expect(words(enNodePointer.backToChat)).toBeLessThanOrEqual(2)
    expect(words(enNodePointer.backToChatWithLabel.replace('{{label}} ·', ''))).toBeLessThanOrEqual(2)
  })

  it('Chinese: at most four characters (verb first), the same words as the accessible name', () => {
    POINTER_SERVER.returnTo = { surface: 'generation', form: 'float', nodeId: 'n1', label: '镜 02' }
    const plain = renderToStaticMarkup(<NodePointerReturnToChat />)
    expect(visibleText(plain)).toBe(i18n.t('nodePointer.backToChat'))
    expect([...visibleText(plain)].length).toBeLessThanOrEqual(4)
    expect(plain).toContain(`aria-label="${i18n.t('nodePointer.backToChatName')}"`)
  })

  it('draws nothing when there is no chat to go back to', () => {
    expect(renderToStaticMarkup(<NodePointerReturnToChat />)).toBe('')
  })
})
