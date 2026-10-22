import { describe, expect, it } from 'vitest'
import {
  CANVAS_WRITE_HEADLESS_OPERATIONS,
  CANVAS_WRITE_LIVE_RENDERER_OPERATIONS,
  canvasWriteSemanticInputSchema,
} from '../../../../electron/shared/agentCapabilities/canvasWrite'
import { storyboardPlanToCreateNodesArgs } from './storyboardPlan'
import { parseStoryboardPlan } from './storyboardPlanSchema'

// D3：外部助手写分镜时省略 shotKind。工具说明写「默认 image」，实际按 video 建 = 说一套做一套，
// 还会让外部 Agent 无意建出更贵的视频节点。新输入按说明默认 image；旧草稿 / 旧数据的兼容默认（video）不动。
const shot = (extra: Record<string, unknown> = {}) => ({ index: 1, durationSec: 5, anchorIds: [], prompt: '雨夜街口', ...extra })
const externalInput = (shots: Record<string, unknown>[]) => ({ operation: 'propose_storyboard_plan', title: 't', anchors: [], shots })

/** 外部新输入走的路：共享契约的边界解析（主进程在转发给渲染层前就解析）→ 渲染层权威解析 → 转成画布节点。 */
function landExternal(shots: Record<string, unknown>[]) {
  const input = canvasWriteSemanticInputSchema.parse(externalInput(shots))
  if (input.operation !== 'propose_storyboard_plan') throw new Error('unexpected operation')
  const { operation: _operation, ...authorPlan } = input
  const plan = parseStoryboardPlan(authorPlan)
  return { plan, nodes: storyboardPlanToCreateNodesArgs(plan, { defaultImageModelKey: 'img', defaultVideoModelKey: 'vid' }).nodes }
}
const kindOf = (nodes: ReturnType<typeof landExternal>['nodes']) => nodes.find((node) => node.clientId.startsWith('shot-'))?.kind

describe('外部分镜输入的 shotKind 默认值（新输入 × 渲染层）', () => {
  it('省略 → image 节点，绑图片模型，不带时长', () => {
    const { plan, nodes } = landExternal([shot()])
    expect(plan.shots[0].shotKind).toBe('image')
    const node = nodes.find((n) => n.clientId.startsWith('shot-'))!
    expect(node.kind).toBe('image')
    expect(node.modelKey).toBe('img')
    expect(node.params?.duration).toBeUndefined()
  })
  it('显式 image → image', () => expect(kindOf(landExternal([shot({ shotKind: 'image' })]).nodes)).toBe('image'))
  it('显式 video → video（想要视频的外部 Agent 照样能要）', () => {
    const { nodes } = landExternal([shot({ shotKind: 'video' })])
    expect(kindOf(nodes)).toBe('video')
    expect(nodes.find((n) => n.clientId.startsWith('shot-'))?.modelKey).toBe('vid')
  })
  it('同一方案里混写：只补省略的那一行', () => {
    const { plan } = landExternal([shot({ index: 1 }), shot({ index: 2, shotKind: 'video' })])
    expect(plan.shots.map((s) => s.shotKind)).toEqual(['image', 'video'])
  })
})

describe('旧草稿 / 旧数据的兼容默认不动（旧数据 × 渲染层）', () => {
  const legacy = (extra: Record<string, unknown> = {}) => parseStoryboardPlan({ title: 't', anchors: [], shots: [shot(extra)] })
  it('省略 shotKind 的持久化方案仍按 video 建', () => {
    const plan = legacy()
    expect(plan.shots[0].shotKind).toBeUndefined()
    expect(kindOf(storyboardPlanToCreateNodesArgs(plan).nodes)).toBe('video')
  })
  it('显式值原样保留', () => {
    expect(legacy({ shotKind: 'image' }).shots[0].shotKind).toBe('image')
    expect(legacy({ shotKind: 'video' }).shots[0].shotKind).toBe('video')
  })
})

describe('headless 通路', () => {
  it('分镜方案只在渲染层落地：headless 通路不建分镜镜头节点，没有第二处默认值可对不上', () => {
    expect(CANVAS_WRITE_LIVE_RENDERER_OPERATIONS).toContain('propose_storyboard_plan')
    expect(CANVAS_WRITE_HEADLESS_OPERATIONS).not.toContain('propose_storyboard_plan')
  })
})
