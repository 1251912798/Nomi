import { describe, expect, it } from 'vitest'
import { toPublishedJsonSchema } from '../../../../electron/shared/agentCapabilities/modelVisibleJsonSchema'
import { LEGACY_OMITTED_SHOT_KIND } from '../../../../electron/shared/storyboard/storyboardPlan'
import { effectiveShotDurationSec, storyboardShotToCreateNodesArgs, type StoryboardPlan } from './storyboardPlan'
import { storyboardPlanSchema } from './storyboardPlanSchema'

// 对账：发给规划 LLM 的 schema 说明里写的「省略 shotKind 是什么」，必须等于落画布时省略真正建出的节点种类。
// 说明与落画布共用 LEGACY_OMITTED_SHOT_KIND；这条测试再从真实落画布结果反推一次，任何一边被改成手写字面量都会红。
const PLAN: StoryboardPlan = {
  title: 't',
  anchors: [],
  shots: [{ index: 1, shotId: 's1', durationSec: 4, anchorIds: [], prompt: 'p' }],
}

function publishedOmittedKind(): string {
  const schema = toPublishedJsonSchema(storyboardPlanSchema) as { properties?: { shots?: { items?: { properties?: { shotKind?: { description?: string } } } } } }
  const shotKind = schema.properties?.shots?.items?.properties?.shotKind
  const match = /omitted means (image|video)/.exec(shotKind?.description ?? '')
  expect(match, `shotKind description: ${shotKind?.description}`).not.toBeNull()
  return match![1]
}

describe('storyboard shotKind omitted default: what the planner is told = what gets built', () => {
  it('the published description names the same kind a shot without shotKind actually materialises as', () => {
    const built = storyboardShotToCreateNodesArgs(PLAN, PLAN.shots[0])
    const shotNode = built.nodes.find((node) => node.clientId === 's1')
    expect(shotNode?.kind).toBe(publishedOmittedKind())
    expect(shotNode?.kind).toBe(LEGACY_OMITTED_SHOT_KIND)
  })

  it('an explicit kind is never overridden by the omitted-default', () => {
    for (const kind of ['image', 'video'] as const) {
      const built = storyboardShotToCreateNodesArgs(PLAN, { ...PLAN.shots[0], shotKind: kind })
      expect(built.nodes.find((node) => node.clientId === 's1')?.kind).toBe(kind)
    }
  })

  it('duration semantics follow the same default (omitted = video: 0 stays 0, no image dwell fallback)', () => {
    const omitted = effectiveShotDurationSec({ ...PLAN.shots[0], durationSec: 0 })
    expect(omitted).toBe(effectiveShotDurationSec({ ...PLAN.shots[0], durationSec: 0, shotKind: LEGACY_OMITTED_SHOT_KIND }))
  })
})
