// 特征测试：界面标「在用」的参考图 = 发出去的参考图；换模型 / 换方式一张不丢。
//
// 方向检查 D-b1a-refslots 写的（复盘：docs/audit/2026-10-22-composer-reference-slots-direction.md）。
// 这里钉住的是**现状**：标 `it.fails` 的几条，说的是「应该成立、但现在不成立」的性质——
// 现在跑它们会失败，所以 `it.fails` 让 CI 保持绿。**修好后把 `it.fails` 改回 `it`**；
// 哪天某条 `it.fails` 自己变红（= 性质已经成立了），也是同一个动作。
//
// 两段真代码串起来，不起界面、不起 Electron、不花钱：
//   界面「在用」= resolveReferenceSlots（参考行里显示在槽里的图，NodeParameterControls 用的同一个函数）
//   界面「未用到」= computeReferenceRowModel().unusedUrls（参考行淡显的那些）
//   发出去的 = buildCatalogTaskRequest（渲染层请求构造）→ taskTemplateParams（主进程模板参数，供应商 body 从这里取值）
// 「发出去的」按模板参数里出现的全部图片地址算：通用中转 body 读 image_url，APIMart 投影读
// referenceImageUrls / firstFrameUrl 这些原名键，主进程上传白名单读 activeAssetUrls——哪个键都可能上线。
import { describe, expect, it } from 'vitest'
import type { ModelOption } from '../../../config/models'
import {
  MODEL_ARCHETYPES,
  resolveArchetypeForModel,
  type ArchetypeMode,
  type ModelArchetype,
} from '../../../../electron/shared/modelArchetypes'
import { taskTemplateParams } from '../../../../electron/catalog/taskParams'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { createGenerationNode } from '../model/graphOps'
import { buildNodeModelChangePatch } from '../nodes/buildNodeModelChangePatch'
import {
  applyArchetypeModeSwitch,
  archetypeModeArraySlots,
  archetypeModeSlots,
  currentArchetypeMode,
  referenceSlotStorage,
} from '../nodes/controls/archetypeMeta'
import { reassignUploadedImages } from '../nodes/controls/reassignUploadedImages'
import { computeReferenceRowModel } from '../nodes/controls/referenceRowModel'
import { buildCatalogTaskRequest } from './catalogTaskActions'
import { resolveGenerationReferences } from './generationReferenceResolver'
import { resolveReferenceSlots } from './referenceSlots'

const REF = 'nomi-local://ref/'
const refs = (count: number, from = 1) => Array.from({ length: count }, (_, i) => `${REF}u${from + i}.png`)

function videoOrImageNode(archetype: ModelArchetype, modelKey: string, vendor: string, meta: Record<string, unknown>): GenerationCanvasNode {
  const base = createGenerationNode({ id: 'n', kind: archetype.kind === 'image' ? 'image' : 'video', prompt: '一个镜头' })
  return { ...base, meta: { modelKey, modelVendor: vendor, vendor, ...meta } }
}

/** 界面上参考行显示在槽里的图（= 标「在用」的那些）。 */
function inUse(node: GenerationCanvasNode): string[] {
  return resolveReferenceSlots(node, [node], []).flatMap((slot) => slot.fills.map((fill) => fill.url).filter((url): url is string => Boolean(url)))
}

/** 界面上参考行淡显「未用到」的图。和 NodeParameterControls 一样，从 resolveReferenceSlots 回填 assetValuesByKey。 */
function unused(node: GenerationCanvasNode, archetype: ModelArchetype): string[] {
  const meta = node.meta || {}
  const mode = currentArchetypeMode(archetype, meta)
  const assetValuesByKey: Record<string, string[]> = {}
  for (const slot of resolveReferenceSlots(node, [node], [])) {
    const storage = referenceSlotStorage({ kind: slot.slotKind })
    if (storage) assetValuesByKey[storage.metaKey] = slot.fills.map((fill) => fill.url).filter((url): url is string => Boolean(url))
  }
  return computeReferenceRowModel({
    node, nodes: [node], edges: [], meta, assetSlots: [], assetValuesByKey,
    imageUrlSlots: archetypeModeSlots(mode), arraySlots: archetypeModeArraySlots(mode),
    refsUnsupported: false, showReferences: false, fallbackName: () => '',
  }).unusedUrls
}

/** 主进程模板参数里出现的每一张参考图 → 它出现在哪些键里。 */
function sent(node: GenerationCanvasNode): Map<string, string[]> {
  const references = resolveGenerationReferences(node, { nodes: [node], edges: [] })
  const { request } = buildCatalogTaskRequest(node, { references })
  const params = taskTemplateParams(request)
  const found = new Map<string, string[]>()
  const walk = (value: unknown, key: string) => {
    if (typeof value === 'string') {
      if (value.startsWith(REF)) found.set(value, [...(found.get(value) ?? []), key])
    } else if (Array.isArray(value)) value.forEach((item) => walk(item, key))
    else if (value && typeof value === 'object') Object.values(value).forEach((item) => walk(item, key))
  }
  for (const [key, value] of Object.entries(params)) walk(value, key)
  return found
}

/** 发出去了、界面却没标「在用」的图（→ 它出现在哪些键）。空 = 说的 = 摆的。 */
function leaks(node: GenerationCanvasNode): Record<string, string[]> {
  const shown = new Set(inUse(node))
  return Object.fromEntries([...sent(node)].filter(([url]) => !shown.has(url)))
}

/** 节点上还能找到的全部参考（在用 ∪ 未用到）。 */
function everyReference(node: GenerationCanvasNode, archetype: ModelArchetype): Set<string> {
  return new Set([...inUse(node), ...unused(node, archetype)])
}

/** 照 NodeParameterControls.handleModeSwitch 的两步：先搬图，再改 modeId。 */
function switchMode(node: GenerationCanvasNode, archetype: ModelArchetype, modeId: string): GenerationCanvasNode {
  const meta = node.meta || {}
  const to = archetype.modes.find((mode) => mode.id === modeId)!
  const carried = reassignUploadedImages(meta, to).patch
  return { ...node, meta: applyArchetypeModeSwitch(carried ? { ...meta, ...carried } : meta, archetype, modeId) }
}

const option = (modelKey: string, kind: 'video' | 'image' = 'video'): ModelOption =>
  ({ value: modelKey, modelKey, vendor: 'apimart', label: modelKey, kind } as ModelOption)

/** 照模型菜单的写法换模型（单节点选择器和批量换模型共用的 buildNodeModelChangePatch）。 */
function swapModel(node: GenerationCanvasNode, toModelKey: string): { node: GenerationCanvasNode; archetype: ModelArchetype; dropped: number } {
  const from = String(node.meta?.modelKey)
  const { meta, uploadsDropped } = buildNodeModelChangePatch({
    node, nodes: [node], edges: [], modelOptions: [option(from), option(toModelKey)], value: toModelKey, vendor: 'apimart',
  })
  const archetype = resolveArchetypeForModel({ modelKey: toModelKey, vendorKey: 'apimart', meta: {} })!
  return { node: { ...node, meta }, archetype, dropped: uploadsDropped }
}

const imageSlotCap = (mode: ArchetypeMode) => mode.slots.find((slot) => slot.kind === 'image_ref')?.max ?? 0
const seedanceOn = (modelKey: string, modeId: string, meta: Record<string, unknown>) => {
  const archetype = resolveArchetypeForModel({ modelKey, vendorKey: 'apimart', meta: {} })!
  return { archetype, node: videoOrImageNode(archetype, modelKey, 'apimart', { archetype: { id: archetype.id, modeId }, ...meta }) }
}

// ── 验收报告 V-b1a-r2 (b) 表里的三个场景 ──────────────────────────────────────────────

describe('报告 (b) 场景：界面标「未用到」的图不该进请求', () => {
  const fiveOnSeedance = () => seedanceOn('seedance-2', 'omni', { referenceImageUrls: refs(5) })

  it('起点自检：Seedance 参考方式 5 张，界面 5 张都在用、发出去的也正是这 5 张', () => {
    const { node } = fiveOnSeedance()
    expect(inUse(node)).toEqual(refs(5))
    expect(leaks(node)).toEqual({})
  })

  it('现状钉：5 张换到 Veo 3.1，界面 3 张在用 + 2 张未用到，而那 2 张进了首帧 / 尾帧 / image_url', () => {
    const { node, archetype } = swapModel(fiveOnSeedance().node, 'veo3.1')
    expect(inUse(node)).toEqual(refs(3))
    expect(unused(node, archetype)).toEqual(refs(2, 4))
    expect(Object.keys(leaks(node)).sort()).toEqual(refs(2, 4))
  })

  it.fails('5 张换到 Veo 3.1：发出去的 ⊆ 界面在用', () => {
    expect(leaks(swapModel(fiveOnSeedance().node, 'veo3.1').node)).toEqual({})
  })

  it.each(['kling-3.0', 'wan2.7'])('现状钉：5 张换到 %s，未用到的图进了请求，第 5 张被删', (modelKey) => {
    const { node, archetype, dropped } = swapModel(fiveOnSeedance().node, modelKey)
    expect(dropped).toBe(1)
    expect(Object.keys(leaks(node)).length).toBeGreaterThan(0)
    expect(everyReference(node, archetype).size).toBe(4)
  })

  it.fails.each(['kling-3.0', 'wan2.7'])('5 张换到 %s：发出去的 ⊆ 界面在用', (modelKey) => {
    expect(leaks(swapModel(fiveOnSeedance().node, modelKey).node)).toEqual({})
  })

  it('现状钉：Seedance 3 张切到首尾帧，第 3 张标未用到，却作为 reference_image_urls 和首尾帧一起发', () => {
    const { node, archetype } = seedanceOn('seedance-2', 'omni', { referenceImageUrls: refs(3) })
    const switched = switchMode(node, archetype, 'firstlast')
    expect(inUse(switched)).toEqual(refs(2))
    expect(unused(switched, archetype)).toEqual(refs(1, 3))
    expect(leaks(switched)[refs(1, 3)[0]]).toContain('reference_image_urls')
  })

  it.fails('Seedance 3 张切到首尾帧：发出去的 ⊆ 界面在用', () => {
    const { node, archetype } = seedanceOn('seedance-2', 'omni', { referenceImageUrls: refs(3) })
    expect(leaks(switchMode(node, archetype, 'firstlast'))).toEqual({})
  })
})

// ── 性质：全部档案 × 每个方式 ─────────────────────────────────────────────────────────

// 起点：创作者在「收图最多的那个方式」里放满参考（上限没写就放 9 张），然后切到这个模型的每一个方式。
// 每一格都问两件事：①发出去的 ⊆ 界面在用；②在用 ∪ 未用到 = 原来那一份，一张不少。
type Cell = { archetype: ModelArchetype; mode: ArchetypeMode; node: GenerationCanvasNode; original: string[] }
function propertyCells(): Cell[] {
  const cells: Cell[] = []
  for (const archetype of MODEL_ARCHETYPES) {
    if (archetype.kind !== 'video' && archetype.kind !== 'image') continue
    const start = [...archetype.modes].sort((a, b) => imageSlotCap(b) - imageSlotCap(a))[0]
    if (!start || imageSlotCap(start) === 0) continue
    const original = refs(Math.min(imageSlotCap(start), 9))
    const modelKey = archetype.identifierPatterns[0]!
    const begin = videoOrImageNode(archetype, modelKey, 'apimart', { archetype: { id: archetype.id, modeId: start.id }, referenceImageUrls: original })
    for (const mode of archetype.modes) {
      const node = mode.id === start.id ? begin : switchMode(begin, archetype, mode.id)
      cells.push({ archetype, mode, node, original })
    }
  }
  return cells
}

/** 一格的结果，失败时直接看得出是哪个档案哪个方式、哪张图从哪个键漏出去。 */
function audit(cells: Cell[]) {
  const leaked: string[] = []
  const lost: string[] = []
  for (const { archetype, mode, node, original } of cells) {
    for (const [url, keys] of Object.entries(leaks(node))) leaked.push(`${archetype.id}/${mode.id}: ${url.slice(REF.length)} ← ${[...new Set(keys)].join(',')}`)
    const kept = everyReference(node, archetype)
    const missing = original.filter((url) => !kept.has(url))
    if (missing.length) lost.push(`${archetype.id}/${mode.id}: 少了 ${missing.length} 张`)
  }
  return { leaked, lost }
}

describe('性质：全部档案的每个方式，「请求构造 → 主进程模板参数」两段串起来', () => {
  const cells = propertyCells()

  it('覆盖面自检：至少 20 个收图档案、60 个方式格都跑到了', () => {
    expect(new Set(cells.map((cell) => cell.archetype.id)).size).toBeGreaterThanOrEqual(20)
    expect(cells.length).toBeGreaterThanOrEqual(60)
  })

  it('现状钉：有方式格把「未用到」的图发了出去（修好后这条会红——到时删掉它，并把下面的 it.fails 改回 it）', () => {
    expect(audit(cells).leaked.length).toBeGreaterThan(0)
  })

  it.fails('发出去的图片地址集合 ⊆ 界面标「在用」的图（每个档案 × 每个方式）', () => {
    expect(audit(cells).leaked).toEqual([])
  })

  it('现状钉：同一模型内切方式也会删图（HappyHorse 切「编辑」少 2 张、Wan 2.7 切「图生视频」少 1 张）', () => {
    expect(audit(cells).lost).toEqual(['happyhorse/edit: 少了 2 张', 'wan-2.7/i2v: 少了 1 张'])
  })

  it.fails('在用 ∪ 未用到 = 原来那一份，一张不少（同一模型内切方式）', () => {
    expect(audit(cells).lost).toEqual([])
  })
})

// ── 复盘第 3 节的预测：不只上传的图，别的入口同样漏 ─────────────────────────────────────

describe('预测：连线进来的图、文生方式下的残留键，同样「标未用到却发出去」', () => {
  /** 三个出过图的上游节点连到一个 Seedance 首尾帧节点（连线不带语义，和拖线 / 批量落画布一样）。 */
  function threeEdgesIntoFirstLast() {
    const { node } = seedanceOn('seedance-2', 'firstlast', {})
    const sources = [1, 2, 3].map((i) => ({
      ...createGenerationNode({ id: `s${i}`, kind: 'image' }),
      result: { id: `r${i}`, type: 'image' as const, url: `${REF}e${i}.png`, createdAt: 0 },
    }))
    const edges = sources.map((source, order) => ({ id: `edge-${order}`, source: source.id, target: node.id, order }))
    return { node, nodes: [node, ...sources] as GenerationCanvasNode[], edges: edges as never }
  }

  it('现状钉：连 3 张图进首尾帧，界面只有 1 张在用，3 张都作为 reference_images 发出', () => {
    const { node, nodes, edges } = threeEdgesIntoFirstLast()
    expect(resolveReferenceSlots(node, nodes, edges).flatMap((slot) => slot.fills.map((fill) => fill.url))).toEqual([`${REF}e1.png`])
    const params = taskTemplateParams(buildCatalogTaskRequest(node, { references: resolveGenerationReferences(node, { nodes, edges }) }).request)
    expect(params.reference_images).toEqual([1, 2, 3].map((i) => `${REF}e${i}.png`))
  })

  it.fails('连线进来的图：发出去的 ⊆ 界面在用', () => {
    const { node, nodes, edges } = threeEdgesIntoFirstLast()
    const shown = new Set(resolveReferenceSlots(node, nodes, edges).flatMap((slot) => slot.fills.map((fill) => fill.url)))
    const params = taskTemplateParams(buildCatalogTaskRequest(node, { references: resolveGenerationReferences(node, { nodes, edges }) }).request)
    expect((params.reference_images as string[]).filter((url) => !shown.has(url))).toEqual([])
  })

  // MCP canvas.write 的 metadata 原样进 meta、旧工程留下的首帧键、20 个改 modeId 的写入口里没走搬图的 18 个——
  // 都会落到这个形状：文生方式（没有任何图片槽），meta 里却还躺着一张首帧。
  it('现状钉：文生视频方式下残留一张首帧，界面标未用到，主进程却把它当 image_url', () => {
    const { node, archetype } = seedanceOn('seedance-2', 't2v', { firstFrameUrl: `${REF}stale.png` })
    expect(inUse(node)).toEqual([])
    expect(unused(node, archetype)).toEqual([`${REF}stale.png`])
    expect(leaks(node)[`${REF}stale.png`]).toContain('image_url')
  })

  it.fails('文生方式的残留键：发出去的 ⊆ 界面在用', () => {
    expect(leaks(seedanceOn('seedance-2', 't2v', { firstFrameUrl: `${REF}stale.png` }).node)).toEqual({})
  })
})

// ── 换模型往返 ────────────────────────────────────────────────────────────────────────

describe('换模型往返：30 张 → Veo 3.1 → 切回', () => {
  const thirty = () => seedanceOn('seedance-2.5', 'omni', { referenceImageUrls: refs(30) })

  it('起点自检：Seedance 2.5 参考方式放得下 30 张，界面 30 张都在用', () => {
    expect(inUse(thirty().node)).toEqual(refs(30))
  })

  it('现状钉：换到 Veo 3.1 只剩 5 张（3 在用 + 2 未用到），25 张被删；切回也只有 5 张', () => {
    const there = swapModel(thirty().node, 'veo3.1')
    expect(there.dropped).toBe(25)
    expect(everyReference(there.node, there.archetype).size).toBe(5)
    const back = swapModel(there.node, 'seedance-2.5')
    expect(everyReference(back.node, back.archetype).size).toBe(5)
    // 暂存进首 / 尾帧键的第 4、5 张，切回来反过来决定了方式：落成「首尾帧」，原来的第 4、5 张成了首帧、尾帧。
    expect(currentArchetypeMode(back.archetype, back.node.meta).id).toBe('firstlast')
    expect(inUse(back.node)).toEqual(refs(2, 4))
  })

  it.fails('换过去再切回来，参考一张不少、顺序不变', () => {
    const there = swapModel(thirty().node, 'veo3.1')
    const back = swapModel(there.node, 'seedance-2.5')
    expect(inUse(back.node)).toEqual(refs(30))
  })

  it.fails('停在 Veo 3.1 时，30 张都还在节点上（在用 ∪ 未用到）', () => {
    const there = swapModel(thirty().node, 'veo3.1')
    expect(everyReference(there.node, there.archetype)).toEqual(new Set(refs(30)))
  })
})
