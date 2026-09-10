// Node-only fixture producer: real resolver, pricing and ETA owners; no provider requests.
import { coldstartEtaForGate } from '../../../electron/capabilityCore/mcpGenerationTools'
import { resolveGenerationPlan } from '../../../electron/shared/videoCapabilities/planResolver'
import { MINIMAX_H3_ARCHETYPE } from '../../../electron/shared/videoCapabilities/minimaxH3'
import { buildMultiShotGateProjection } from '../../../electron/productionRun/shotPricing'
import { buildMultiShotContractView } from '../../../src/workbench/generationCanvas/spend/productionContractView'
import { classifyResolveStrategy, storyboardPlanToPlanShotInputs } from '../../../src/workbench/generationCanvas/agent/storyboardStrategy'
import type { StoryboardPlan } from '../../../src/workbench/generationCanvas/agent/storyboardPlan'

const plan: StoryboardPlan = {
  title: '雨夜天台', aspectRatio: '16:9', anchors: [],
  shots: Array.from({ length: 8 }, (_, index) => ({
    shotId: `shot-${index + 1}`, index: index + 1, durationSec: 6,
    prompt: `雨夜天台，第 ${index + 1} 镜`, modelKey: 'unavailable-video-model', anchorIds: [],
  })),
}
const resolution = resolveGenerationPlan({
  shots: storyboardPlanToPlanShotInputs(plan),
  candidates: [{ provider: 'kie', modelKey: 'minimax-h3', label: MINIMAX_H3_ARCHETYPE.label, archetype: MINIMAX_H3_ARCHETYPE }],
  defaultModelKey: 'minimax-h3', goals: { allowAdvisoryMerge: false },
})
const view = classifyResolveStrategy({
  resolvedShots: resolution.shots.map(shot => ({ ...shot, modelKey: shot.candidate?.modelKey ?? null })),
  mergeProposals: resolution.mergeProposals, splitProposals: resolution.splitProposals, planIssues: resolution.issues,
})
// Mirrors mcpGenerationTools.ts:661: eight video jobs, scheduler concurrency six.
const eta = coldstartEtaForGate(['video'], plan.shots.length, 6)
const payload = {
  ...buildMultiShotGateProjection({
    shots: plan.shots.map(shot => ({
      shotId: shot.shotId!, sceneOneLiner: shot.prompt, providerModelText: 'MiniMax H3', durationSeconds: shot.durationSec,
      candidate: { providerId: 'kie', modelId: 'minimax-h3', parameters: { duration: 6 }, references: [] },
    })),
    resolvePricing: () => ({ cost: 1, enabled: true, specCosts: [] }),
    hardLimit: 8, specs: { durationSeconds: 48, aspectRatio: '16:9', shotCount: 8 },
    frozenItems: ['shots', 'models', 'references', 'price'],
  }),
  ...eta,
}
const fixture = { plan, view, contract: buildMultiShotContractView(payload), eta }
export type C04Fixture = typeof fixture
console.log(JSON.stringify(fixture))
