// 站位参考图接目标镜头（2026-10-24 导演台走查 ⑤）。站位图接不接得上目标镜头只有一个判据 stagingAttachForTarget
// （与写边总闸 validateReferenceEdge 同一条规则），只有一扇写边门 attachStagingReference（连完再读画布，以画布为准）；
// 工具受理时的回执和出图后的 Host 都问它。反例先红：修前 Host 照连不误、不看结果，被总闸拒了也一声不吭；
// Agent 回执无条件说「并连到镜头作 composition_ref」——工具栏默认图片模型只吃文字，用户以为接上了，其实没有。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../../../i18n'
import { useGenerationCanvasStore } from '../../../store/generationCanvasStore'
import { attachStagingReference, stagingAttachForTarget, stagingAttachReceipt, type StagingAttachPlan } from './createStagingReferenceNode'

/** 工具栏默认图片模型：只有文生图一个模式，没有任何参考槽。 */
const TEXT_ONLY = { archetype: { id: 'z-image-turbo', modeId: 't2i' } }
/** 当前在文生图模式、但「改图」模式有 image_ref 槽：总闸按全部模式判，能接（连上后由连线派生切模式）。 */
const TAKES_IMAGES = { archetype: { id: 'seedream', modeId: 't2i' } }
const PROMISE = '连到镜头作 composition_ref'

function addNode(kind: 'image' | 'text' | 'asset', meta?: Record<string, unknown>): string {
  return useGenerationCanvasStore.getState().addNode({ kind, title: kind, prompt: 'p', ...(meta ? { meta } : {}) }).id
}

/** Host 出图后落下的那张站位图：一张带图片产物的图片节点。 */
function stagingImage(): string {
  const id = addNode('image')
  useGenerationCanvasStore.getState().updateNode(id, { result: { id: `r-${id}`, type: 'image', url: `nomi-local://p/${id}.png`, createdAt: 1 }, status: 'success' })
  return id
}

const edgesBetween = (source: string, target: string) =>
  useGenerationCanvasStore.getState().edges.filter((edge) => edge.source === source && edge.target === target)

beforeEach(() => {
  vi.restoreAllMocks()
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], selectedNodeIds: [], groups: [] })
})

describe('stagingAttachForTarget — 两半（工具受理 / Host 出图）问的是同一个判据', () => {
  it('目标只吃文字（工具栏默认模型）→ rejected，原因是总闸的 unsupported_reference', () => {
    expect(stagingAttachForTarget(addNode('image', TEXT_ONLY))).toEqual({ kind: 'rejected', reason: 'unsupported_reference' })
  })

  it('目标能接（任一模式有参考图槽，哪怕当前在文生图模式）→ connect', () => {
    expect(stagingAttachForTarget(addNode('image', TAKES_IMAGES))).toEqual({ kind: 'connect' })
  })

  it('目标还没选模型 → connect（与总闸「无档案一律放行」同口径）', () => {
    expect(stagingAttachForTarget(addNode('image'))).toEqual({ kind: 'connect' })
  })

  it('目标这一类不收输入（上传素材卡）→ rejected target_takes_no_input', () => {
    expect(stagingAttachForTarget(addNode('asset'))).toEqual({ kind: 'rejected', reason: 'target_takes_no_input' })
  })

  it('没指目标 → none；目标不在画布上 → missing', () => {
    expect(stagingAttachForTarget(undefined)).toEqual({ kind: 'none' })
    expect(stagingAttachForTarget('ghost')).toEqual({ kind: 'missing' })
  })
})

describe('attachStagingReference — 站位图 → 镜头 composition_ref 的唯一写边门', () => {
  it('目标能接 → composition_ref 边真落在画布上，报 connected', () => {
    const target = addNode('image', TAKES_IMAGES)
    const image = stagingImage()
    expect(attachStagingReference(image, target)).toEqual({ kind: 'connected' })
    expect(edgesBetween(image, target).map((edge) => edge.mode)).toEqual(['composition_ref'])
  })

  it('目标只吃文字 → 不留边，报 not_connected，带「这个镜头的模型不接参考图」那句话', () => {
    const target = addNode('image', TEXT_ONLY)
    const image = stagingImage()
    const outcome = attachStagingReference(image, target)
    expect(outcome).toEqual({ kind: 'not_connected', reason: 'stagingTextOnly', message: i18n.t('director.agent.stagingTextOnly') })
    expect(i18n.exists('director.agent.stagingTextOnly')).toBe(true)
    expect(edgesBetween(image, target)).toEqual([])
  })

  it('判据说能接、写边却没落下（总闸另有裁决）→ 以画布为准报 not_connected，不报接上了', () => {
    const target = addNode('image', TAKES_IMAGES)
    const image = stagingImage()
    vi.spyOn(useGenerationCanvasStore.getState(), 'connectNodes').mockImplementation(() => {})
    const outcome = attachStagingReference(image, target)
    expect(outcome).toEqual({ kind: 'not_connected', reason: 'stagingNotConnected', message: i18n.t('director.agent.stagingNotConnected') })
    expect(i18n.exists('director.agent.stagingNotConnected')).toBe(true)
  })

  it('目标不在了 / 没指目标 → 不连、不提示（与运镜参考同口径：只出图留痕）', () => {
    const image = stagingImage()
    const before = useGenerationCanvasStore.getState().edges
    expect(attachStagingReference(image, 'ghost')).toEqual({ kind: 'missing' })
    expect(attachStagingReference(image, undefined)).toEqual({ kind: 'none' })
    expect(useGenerationCanvasStore.getState().edges).toEqual(before)
  })
})

describe('stagingAttachReceipt — Agent 回执照预判说', () => {
  const plans: StagingAttachPlan[] = [
    { kind: 'none' },
    { kind: 'missing' },
    { kind: 'connect' },
    { kind: 'rejected', reason: 'unsupported_reference' },
    { kind: 'rejected', reason: 'target_takes_no_input' },
    { kind: 'rejected', reason: 'source_not_referenceable' },
    { kind: 'rejected', reason: 'dangling' },
  ]

  it.each(plans)('%j：说「连到镜头」⇔ 预判能接；标降级 ⇔ 指了目标却接不上', (plan) => {
    const receipt = stagingAttachReceipt(plan)
    expect(receipt.clause.includes(PROMISE)).toBe(plan.kind === 'connect')
    expect(receipt.degraded).toBe(plan.kind === 'missing' || plan.kind === 'rejected')
  })

  it('只吃文字时告诉 Agent 下一步：换接参考图的模型，或改用 customBlocking 走文字', () => {
    const { clause } = stagingAttachReceipt({ kind: 'rejected', reason: 'unsupported_reference' })
    expect(clause).toContain('不接参考图')
    expect(clause).toContain('customBlocking')
  })

  // 类测试：画布上每一种目标，工具受理时的承诺和 Host 出图后真发生的事一致（同一个判据，不会一边说接上、一边没接）。
  const targets: Array<[string, () => string | undefined]> = [
    ['只吃文字的图片镜头', () => addNode('image', TEXT_ONLY)],
    ['能接参考图的图片镜头', () => addNode('image', TAKES_IMAGES)],
    ['还没选模型的图片镜头', () => addNode('image')],
    ['文字节点（左环收图，看图写描述）', () => addNode('text')],
    ['上传素材卡（不收输入）', () => addNode('asset')],
    ['不在画布上的节点', () => 'ghost'],
    ['没指目标', () => undefined],
  ]
  it.each(targets)('%s：回执的承诺 = 写边门的结果', (_label, makeTarget) => {
    const target = makeTarget()
    const receipt = stagingAttachReceipt(stagingAttachForTarget(target))
    const outcome = attachStagingReference(stagingImage(), target)
    expect(receipt.clause.includes(PROMISE)).toBe(outcome.kind === 'connected')
    expect(receipt.degraded).toBe(target !== undefined && outcome.kind !== 'connected')
  })
})
