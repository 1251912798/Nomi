// 指向元素的组件级测试（NodePointer 板；第②步验收清单 S1 / S2 / S3 / S5 / S6 / S8 / S10）。
// 测试宿主没有 DOM：读标记用 renderToStaticMarkup，交互用仓库已有的 react-reconciler 测试渲染器直接调 props 上的回调。
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const seen = vi.hoisted(() => ({ reveal: vi.fn(), modelLabelCalls: 0 }))
vi.mock('./revealNodeFromChat', () => ({ revealNodeFromChat: seen.reveal, returnToChat: vi.fn() }))
// 模型显示名读目录（异步）；这里换成同步桩，顺便数一个指向元素渲染了几次（每渲染一次读一次）。
vi.mock('../../generation/list/generationListModelLabels', () => ({
  useModelLabels: () => {
    seen.modelLabelCalls += 1
    return (node: { meta?: Record<string, unknown> } | undefined) => (node?.meta?.modelKey ? 'Seedance 2' : '')
  },
}))

import i18n from '../../../i18n'
import type { GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'
import { useGenerationCanvasStore } from '../../generationCanvas/store/generationCanvasStore'
import { useNodeExternalHighlightStore } from '../../generationCanvas/store/nodeExternalHighlightStore'
import { createReactTestRenderer } from '../v4/testReactRenderer'
import { NodePointer, NodePointerGroup, type NodePointerSubject } from './NodePointer'

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
  return { renderer, buttons }
}

beforeEach(async () => {
  await i18n.changeLanguage('zh-CN')
  seen.reveal.mockReset()
  seen.modelLabelCalls = 0
  seed([video('n1'), video('n2'), video('tall', { meta: { modelKey: 'seedance-2', aspect_ratio: '9:16', duration: 5, resolution: '480p' } })])
  useNodeExternalHighlightStore.setState({ hoverNodeId: null, hoverOwner: null })
})

afterEach(() => {
  useNodeExternalHighlightStore.setState({ hoverNodeId: null, hoverOwner: null })
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
