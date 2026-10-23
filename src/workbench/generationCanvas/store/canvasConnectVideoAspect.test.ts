// 连线手势铺视频比例默认值（用户 2026-07-17 规则 + 2026-10-22 Q2 拍板）：
//   连线那一刻算（单连 / 组连线同一个手势），只改没被明确选过比例的视频节点，一次 ⌘Z 连同连线一起撤；
//   用户选过的、Agent / 分镜写过的不改；断线、删上游不回头改。
// 模型目录只种最外面那次取数（seedModelCatalogForTests），认档案 / 算控件 / 写 meta 全走现役代码。
import { beforeEach, describe, expect, it } from 'vitest'
import { useGenerationCanvasStore, __resetGenerationCanvasHistoryForTests } from './generationCanvasStore'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { seedModelCatalogForTests } from '../../../config/modelCatalogCache'
import { toCatalogModelOptions } from '../../../config/modelOptionMappers'
import { buildAgentModelEntries } from '../agent/availableModels'
import { buildModelEntryIndex, buildPlannedNodeMeta } from '../agent/plannedNodeMeta'
import { ASPECT_EXPLICIT_META_KEY } from '../nodes/aspectExplicit'
import { readNodeAspectRatio } from '../nodes/aspectRatio'
import { normalizeAspectRatioToWH } from '../../../../electron/shared/aspectRatioValue'

// Kling 3.0：图连进来按「参考」边收（比例规则只看首帧 / 尾帧 / 参考三种输入，角色参考不算——2026-07-17 规则原样）。
const MODEL_KEY = 'kling-v3'
const OPTIONS = toCatalogModelOptions([
  { modelKey: MODEL_KEY, vendorKey: 'apimart', labelZh: 'Kling 3.0', kind: 'video', enabled: true, published: true, publishedModes: ['text_to_video', 'image_to_video'], availability: { usable: true } },
] as Parameters<typeof toCatalogModelOptions>[0])
const HEALTH = { ok: true, counts: { vendors: 1, enabledVendors: 1, models: 1, enabledModels: 1, mappings: 0, enabledMappings: 0, enabledApiKeys: 1 }, byKind: [], issues: [] }
const ENTRIES = buildModelEntryIndex(buildAgentModelEntries(OPTIONS), ['apimart'])

const state = () => useGenerationCanvasStore.getState()

function image(id: string, aspect: string): GenerationCanvasNode {
  return { id, title: id, kind: 'image', categoryId: 'shots', position: { x: 0, y: 0 }, meta: { aspect_ratio: aspect } }
}

/** 落地 / 手建后已经有模型的视频节点（meta 走落画布同一个构造器）。 */
function video(id: string, params: Record<string, unknown> = {}): GenerationCanvasNode {
  const meta = buildPlannedNodeMeta({ modelKey: MODEL_KEY, vendor: 'apimart', params }, ENTRIES)
  if (!meta) throw new Error('fixture model not in the entry index')
  return { id, title: id, kind: 'video', categoryId: 'shots', position: { x: 600, y: 0 }, meta }
}

function aspectOf(nodeId: string): string | null {
  const node = state().nodes.find((candidate) => candidate.id === nodeId)
  const ratio = node ? readNodeAspectRatio(node) : null
  if (!ratio) return null
  return normalizeAspectRatioToWH(ratio > 1 ? '16:9' : ratio < 1 ? '9:16' : '1:1')
}

function connect(sourceId: string, targetId: string) {
  state().startConnection(sourceId, 'right')
  return state().connectToNode(targetId)
}

beforeEach(() => {
  __resetGenerationCanvasHistoryForTests()
  seedModelCatalogForTests(HEALTH as Parameters<typeof seedModelCatalogForTests>[0], [{ kind: 'video', requiredMode: 'text_to_video', options: OPTIONS }])
})

describe('连线那一刻铺视频比例默认值', () => {
  it('前提：没写比例的落地 / 手建节点是 16:9，且没有「明确选过」标记', () => {
    state().restoreSnapshot({ nodes: [video('v')], edges: [], groups: [] })
    expect(aspectOf('v')).toBe('16:9')
    expect(state().nodes[0].meta?.[ASPECT_EXPLICIT_META_KEY]).toBeUndefined()
  })

  it('连进一张竖图 → 9:16；一次 ⌘Z 连线与比例一起撤', () => {
    state().restoreSnapshot({ nodes: [image('tall', '9:16'), video('v')], edges: [], groups: [] })
    const before = state().readDocumentSnapshot()
    expect(connect('tall', 'v')).toMatchObject({ ok: true })
    expect(aspectOf('v')).toBe('9:16')
    state().undo()
    expect(state().readDocumentSnapshot()).toEqual(before)
  })

  it('连进横图 → 16:9（已经是首选，比例键不写）', () => {
    state().restoreSnapshot({ nodes: [image('wide', '16:9'), video('v')], edges: [], groups: [] })
    connect('wide', 'v')
    expect(aspectOf('v')).toBe('16:9')
    expect(state().nodes.find((node) => node.id === 'v')!.meta?.aspect_ratio).toBe('16:9')
  })

  it('横竖混连 → 16:9（只有全竖才 9:16）', () => {
    state().restoreSnapshot({ nodes: [image('tall', '9:16'), image('wide', '16:9'), video('v')], edges: [], groups: [] })
    connect('wide', 'v')
    connect('tall', 'v')
    expect(aspectOf('v')).toBe('16:9')
  })

  it('用户在比例控件上选过 → 连竖图不改', () => {
    const chosen = video('v')
    chosen.meta = { ...chosen.meta, [ASPECT_EXPLICIT_META_KEY]: true }
    state().restoreSnapshot({ nodes: [image('tall', '9:16'), chosen], edges: [], groups: [] })
    connect('tall', 'v')
    expect(aspectOf('v')).toBe('16:9')
  })

  it('Agent / 分镜落地写了合法比例 → 落地即记「明确选过」，连竖图不改', () => {
    const authored = video('v', { aspect_ratio: '16:9' })
    expect(authored.meta?.[ASPECT_EXPLICIT_META_KEY]).toBe(true)
    state().restoreSnapshot({ nodes: [image('tall', '9:16'), authored], edges: [], groups: [] })
    connect('tall', 'v')
    expect(aspectOf('v')).toBe('16:9')
  })

  it('断线、删上游 → 比例不回头改', () => {
    state().restoreSnapshot({ nodes: [image('tall', '9:16'), video('v')], edges: [], groups: [] })
    connect('tall', 'v')
    expect(aspectOf('v')).toBe('9:16')
    state().disconnectEdge(state().edges[0].id)
    expect(state().edges).toHaveLength(0)
    expect(aspectOf('v')).toBe('9:16')
    connect('tall', 'v')
    state().selectNodes(['tall'])
    state().deleteSelectedNodes()
    expect(state().nodes.some((node) => node.id === 'tall')).toBe(false)
    expect(aspectOf('v')).toBe('9:16')
  })

  it('组连线（用户 10-22：和逐张连是同一个手势）：一组竖图连到视频节点 → 9:16，一次 ⌘Z 全撤', () => {
    state().restoreSnapshot({ nodes: [image('tall-a', '9:16'), image('tall-b', '9:16'), video('v')], edges: [], groups: [] })
    const group = state().createGroup('shots', 'refs', { nodeIds: ['tall-a', 'tall-b'] })
    expect(group).toBeTruthy()
    state().startGroupConnection(group!.id, 'right')
    const outcome = state().connectToNode('v')
    expect(outcome).toMatchObject({ ok: true })
    expect(state().edges.length).toBe(2)
    expect(aspectOf('v')).toBe('9:16')
    // 一次 ⌘Z：组连线的边与跟着变的比例一起回去。不比整份快照：建组 + 组连线之后撤一次本来就回不到建组后的整份快照
    // （改前没有任何模型时同样如此，与本条无关）。
    state().undo()
    expect(state().edges).toHaveLength(0)
    expect(aspectOf('v')).toBe('16:9')
  })
})
