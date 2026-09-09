import { resolveArchetypeForModel } from '../../../config/modelArchetypes'
import { anchorsConsumedBy } from '../../../config/modelArchetypes/anchorPolicy'
import type { ArchetypeMode } from '../../../config/modelArchetypes/types'
import type { PlanShot, StoryboardPlan } from './storyboardPlan'
import { isVisualAnchor } from './storyboardPromptCompiler'
import i18n from '../../../i18n'

export type IgnoredAnchor = { anchorId: string; name: string; reason: string }
export type AnchorModelFitIssue = {
  kind: 'anchor-not-consumable'
  shotIndex: number
  ignoredAnchors: IgnoredAnchor[]
  correction: string
}

export function ignoredShotAnchors(plan: StoryboardPlan, shot: PlanShot, mode: ArchetypeMode | null | undefined): IgnoredAnchor[] {
  if (!mode || !anchorsConsumedBy(mode).includes('none')) return []
  return plan.anchors.filter(anchor => shot.anchorIds.includes(anchor.id) && isVisualAnchor(anchor)).map(anchor => ({
    anchorId: anchor.id,
    name: anchor.name,
    reason: i18n.t('storyboardEditor.anchorPolicy.ignoredReason', { mode: mode.id }),
  }))
}

/** Advisory only: a user's explicit t2v choice is accepted unchanged. */
export function validateAnchorModelFit(plan: StoryboardPlan): AnchorModelFitIssue[] {
  return plan.shots.flatMap(shot => {
    const archetype = resolveArchetypeForModel({ modelKey: shot.modelKey ?? '', vendorKey: shot.modelVendor })
    if (!archetype) return []
    const mode = archetype.modes.find(candidate => candidate.id === (shot.modeId ?? archetype.defaultModeId))
    const ignoredAnchors = ignoredShotAnchors(plan, shot, mode)
    if (!ignoredAnchors.length) return []
    const alternative = archetype.modes.find(candidate => !anchorsConsumedBy(candidate).includes('none'))
    return [{
      kind: 'anchor-not-consumable' as const,
      shotIndex: shot.index,
      ignoredAnchors,
      correction: i18n.t(alternative ? 'storyboardEditor.anchorPolicy.switchMode' : 'storyboardEditor.anchorPolicy.removeAnchors', {
        index: shot.index, mode: mode?.id, alternative: alternative?.id, anchors: ignoredAnchors.map(anchor => anchor.name).join('、'),
      }),
    }]
  })
}
