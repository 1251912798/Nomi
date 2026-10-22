// 性质测试：界面标「在用」的参考图 = 发出去的参考图；换模型 / 换方式一张不丢。
//
// 来历：方向检查 D-b1a-refslots（复盘 docs/audit/2026-10-22-composer-reference-slots-direction.md）先用 `it.fails`
// 钉住了现状（10 条），I-b1a-refslots 按复盘「重写」把参考图收成节点上一份有序列表 + 唯一推导函数
// （nodes/controls/referenceList.ts 的 placeUploadedImages）之后，这些性质应当成立——这就是验收线。
// 仍标 `it.fails` 的，是「请求组装整包带 meta」那一层：归热修 fix/reference-leak-hotfix（GENERIC_REFERENCE_KEYS 白名单）
// 修，热修合进 main、本分支 merge 之后改回 `it`（见各条注释）。
//
// 两段真代码串起来，不起界面、不起 Electron、不花钱：
//   界面「在用」= resolveReferenceSlots（参考行里显示在槽里的图，NodeParameterControls 用的同一个函数）
//   界面「未用到」= computeReferenceRowModel().unusedUrls，unusedUploads 取 resolveReferencePlacement().unused（同 NodeParameterControls）
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
  ensureArchetypeNodeMeta,
  referenceSlotStorage,
} from '../nodes/controls/archetypeMeta'
import { normalizeReferenceListMeta } from '../nodes/controls/referenceList'
import { computeReferenceRowModel } from '../nodes/controls/referenceRowModel'
import { buildCatalogTaskRequest } from './catalogTaskActions'
import { resolveGenerationReferences } from './generationReferenceResolver'
import { resolveReferencePlacement, resolveReferenceSlots } from './referenceSlots'

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

/** 界面上参考行淡显「未用到」的图。和 NodeParameterControls 一样：槽值、unusedUploads 都取 resolveReferencePlacement。 */
function unused(node: GenerationCanvasNode, archetype: ModelArchetype): string[] {
  const meta = node.meta || {}
  const mode = currentArchetypeMode(archetype, meta)
  const placement = resolveReferencePlacement(node, [node], [])
  const assetValuesByKey: Record<string, string[]> = {}
  for (const slot of placement.slots) {
    const storage = referenceSlotStorage({ kind: slot.slotKind })
    if (storage) assetValuesByKey[storage.metaKey] = slot.fills.map((fill) => fill.url).filter((url): url is string => Boolean(url))
  }
  return computeReferenceRowModel({
    node, nodes: [node], edges: [], meta, assetSlots: [], assetValuesByKey,
    imageUrlSlots: archetypeModeSlots(mode), arraySlots: archetypeModeArraySlots(mode),
    refsUnsupported: false, unusedUploads: placement.unused, showReferences: false, fallbackName: () => '',
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

/** 只看档案输入（archetypeInput）这一层：它由唯一推导函数直接生成，与请求组装整包带 meta 无关。 */
function archetypeInputLeaks(node: GenerationCanvasNode): string[] {
  const references = resolveGenerationReferences(node, { nodes: [node], edges: [] })
  const shown = new Set(inUse(node))
  const found: string[] = []
  const walk = (value: unknown) => {
    if (typeof value === 'string') { if (value.startsWith(REF) && !shown.has(value)) found.push(value) }
    else if (Array.isArray(value)) value.forEach(walk)
    else if (value && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk(buildCatalogTaskRequest(node, { references }).request.extras?.archetypeInput)
  return found
}

/** 节点上还能找到的全部参考（在用 ∪ 未用到）。 */
function everyReference(node: GenerationCanvasNode, archetype: ModelArchetype): Set<string> {
  return new Set([...inUse(node), ...unused(node, archetype)])
}

/** 照 NodeParameterControls.handleModeSwitch：旧数据落规范形，再只改 modeId——参考列表不动。 */
function switchMode(node: GenerationCanvasNode, archetype: ModelArchetype, modeId: string): GenerationCanvasNode {
  const meta = node.meta || {}
  const normalized = normalizeReferenceListMeta(meta, currentArchetypeMode(archetype, meta)) ?? meta
  return { ...node, meta: applyArchetypeModeSwitch(normalized, archetype, modeId) }
}

const option = (modelKey: string, kind: 'video' | 'image' = 'video'): ModelOption =>
  ({ value: modelKey, modelKey, vendor: 'apimart', label: modelKey, kind } as ModelOption)

/** 照模型菜单的写法换模型（buildNodeModelChangePatch），再补界面紧接着的那一步（useNodeModelAutoSelect 的 ensureArchetypeNodeMeta）。 */
function swapModel(node: GenerationCanvasNode, toModelKey: string): { node: GenerationCanvasNode; archetype: ModelArchetype } {
  const from = String(node.meta?.modelKey)
  const { meta } = buildNodeModelChangePatch({
    node, nodes: [node], edges: [], modelOptions: [option(from), option(toModelKey)], value: toModelKey, vendor: 'apimart',
  })
  const archetype = resolveArchetypeForModel({ modelKey: toModelKey, vendorKey: 'apimart', meta: {} })!
  return { node: { ...node, meta: ensureArchetypeNodeMeta(meta, archetype) ?? meta }, archetype }
}

const imageSlotCap = (mode: ArchetypeMode) => mode.slots.find((slot) => slot.kind === 'image_ref')?.max ?? 0
const seedanceOn = (modelKey: string, modeId: string, meta: Record<string, unknown>) => {
  const archetype = resolveArchetypeForModel({ modelKey, vendorKey: 'apimart', meta: {} })!
  return { archetype, node: videoOrImageNode(archetype, modelKey, 'apimart', { archetype: { id: archetype.id, modeId }, ...meta }) }
}

// ── 验收报告 V-b1a-r2 (b) 表里的三个场景 ──────────────────────────────────────────────

describe('报告 (b) 场景：界面标「未用到」的图不进请求', () => {
  const fiveOnSeedance = () => seedanceOn('seedance-2', 'omni', { referenceImageUrls: refs(5) })

  it('起点自检：Seedance 参考方式 5 张，界面 5 张都在用、发出去的也正是这 5 张', () => {
    const { node } = fiveOnSeedance()
    expect(inUse(node)).toEqual(refs(5))
    expect(leaks(node)).toEqual({})
  })

  it('5 张换到 Veo 3.1：参考方式 3 张在用 + 2 张未用到，节点上 5 张一张不少', () => {
    const { node, archetype } = swapModel(fiveOnSeedance().node, 'veo3.1')
    expect(inUse(node)).toEqual(refs(3))
    expect(unused(node, archetype)).toEqual(refs(2, 4))
    expect(node.meta?.referenceImageUrls).toEqual(refs(5))
  })

  it('档案输入层：换模型 / 切方式后，archetypeInput 里只有界面在用的图', () => {
    expect(archetypeInputLeaks(swapModel(fiveOnSeedance().node, 'veo3.1').node)).toEqual([])
    expect(archetypeInputLeaks(swapModel(fiveOnSeedance().node, 'kling-3.0').node)).toEqual([])
    const { node, archetype } = seedanceOn('seedance-2', 'omni', { referenceImageUrls: refs(3) })
    expect(archetypeInputLeaks(switchMode(node, archetype, 'firstlast'))).toEqual([])
  })

  // 待热修合入后改回 it：请求组装仍整包 `...meta`，列表里未用到的图经 referenceImageUrls → reference_image_urls 带出去。
  it.fails('5 张换到 Veo 3.1：发出去的 ⊆ 界面在用', () => {
    expect(leaks(swapModel(fiveOnSeedance().node, 'veo3.1').node)).toEqual({})
  })

  // 待热修合入后改回 it（同上）。
  it.fails.each(['kling-3.0', 'wan2.7'])('5 张换到 %s：发出去的 ⊆ 界面在用', (modelKey) => {
    expect(leaks(swapModel(fiveOnSeedance().node, modelKey).node)).toEqual({})
  })

  it.each(['kling-3.0', 'wan2.7'])('5 张换到 %s：一张不删（在用 ∪ 未用到 = 5 张）', (modelKey) => {
    const { node, archetype } = swapModel(fiveOnSeedance().node, modelKey)
    expect(everyReference(node, archetype)).toEqual(new Set(refs(5)))
  })

  it('Seedance 3 张切到首尾帧：前两张落首帧 / 尾帧，第 3 张未用到；切回参考 3 张原样', () => {
    const { node, archetype } = seedanceOn('seedance-2', 'omni', { referenceImageUrls: refs(3) })
    const switched = switchMode(node, archetype, 'firstlast')
    expect(inUse(switched)).toEqual(refs(2))
    expect(unused(switched, archetype)).toEqual(refs(1, 3))
    expect(inUse(switchMode(switched, archetype, 'omni'))).toEqual(refs(3))
  })

  // 待热修合入后改回 it（同上）。
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
  const leakedFromArchetypeInput: string[] = []
  const lost: string[] = []
  for (const { archetype, mode, node, original } of cells) {
    for (const [url, keys] of Object.entries(leaks(node))) leaked.push(`${archetype.id}/${mode.id}: ${url.slice(REF.length)} ← ${[...new Set(keys)].join(',')}`)
    for (const url of archetypeInputLeaks(node)) leakedFromArchetypeInput.push(`${archetype.id}/${mode.id}: ${url.slice(REF.length)}`)
    const kept = everyReference(node, archetype)
    const missing = original.filter((url) => !kept.has(url))
    if (missing.length) lost.push(`${archetype.id}/${mode.id}: 少了 ${missing.length} 张`)
  }
  return { leaked, leakedFromArchetypeInput, lost }
}

describe('性质：全部档案的每个方式，「请求构造 → 主进程模板参数」两段串起来', () => {
  const cells = propertyCells()

  it('覆盖面自检：至少 20 个收图档案、60 个方式格都跑到了', () => {
    expect(new Set(cells.map((cell) => cell.archetype.id)).size).toBeGreaterThanOrEqual(20)
    expect(cells.length).toBeGreaterThanOrEqual(60)
  })

  it('档案输入层：每个档案 × 每个方式，archetypeInput 里的图 ⊆ 界面在用', () => {
    expect(audit(cells).leakedFromArchetypeInput).toEqual([])
  })

  // 待热修合入后改回 it：剩下的漏都在「请求组装整包带 meta」那一层（referenceImageUrls / firstFrameUrl 原名键）。
  it.fails('发出去的图片地址集合 ⊆ 界面标「在用」的图（每个档案 × 每个方式）', () => {
    expect(audit(cells).leaked).toEqual([])
  })

  it('在用 ∪ 未用到 = 原来那一份，一张不少（同一模型内切方式）', () => {
    expect(audit(cells).lost).toEqual([])
  })
})

// ── 复盘第 3 节的预测：不只上传的图，别的入口同样漏 ─────────────────────────────────────

describe('连线进来的图、文生方式下的残留键：标未用到就不发', () => {
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

  // 待热修合入后改回 it：首尾帧方式下标准参考面 referenceImages 还没按方式门控（热修的 orderedSentMediaReferenceUrls 那一段）。
  it.fails('连线进来的图：发出去的 ⊆ 界面在用', () => {
    const { node, nodes, edges } = threeEdgesIntoFirstLast()
    const shown = new Set(resolveReferenceSlots(node, nodes, edges).flatMap((slot) => slot.fills.map((fill) => fill.url)))
    const params = taskTemplateParams(buildCatalogTaskRequest(node, { references: resolveGenerationReferences(node, { nodes, edges }) }).request)
    expect((params.reference_images as string[] | undefined ?? []).filter((url) => !shown.has(url))).toEqual([])
  })

  // MCP canvas.write 的 metadata 原样进 meta、旧工程留下的首帧键、改 modeId 的写入口——都会落到这个形状：
  // 文生方式（没有任何图片槽），meta 里却还躺着一张首帧。它归一进参考列表、标「未用到」。
  it('文生方式的残留首帧：读进参考列表、界面标未用到', () => {
    const { node, archetype } = seedanceOn('seedance-2', 't2v', { firstFrameUrl: `${REF}stale.png` })
    expect(inUse(node)).toEqual([])
    expect(unused(node, archetype)).toEqual([`${REF}stale.png`])
    expect(archetypeInputLeaks(node)).toEqual([])
  })

  // 待热修合入后改回 it：旧键 firstFrameUrl 仍经 `...meta` → firstReferenceImage → image_url。
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

  it('换过去再切回来，参考一张不少、顺序不变', () => {
    const there = swapModel(thirty().node, 'veo3.1')
    const back = swapModel(there.node, 'seedance-2.5')
    expect(inUse(back.node)).toEqual(refs(30))
  })

  it('停在 Veo 3.1 时，30 张都还在节点上（在用 ∪ 未用到）', () => {
    const there = swapModel(thirty().node, 'veo3.1')
    expect(everyReference(there.node, there.archetype)).toEqual(new Set(refs(30)))
  })
})
