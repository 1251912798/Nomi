import { projectShotNode } from './storyboardProjection'
import { buildAgentModelEntries } from '../../../generationCanvas/agent/availableModels'
import { buildModelEntryIndex } from '../../../generationCanvas/agent/plannedNodeMeta'
import { useWorkbenchStore } from '../../../workbenchStore'
import { useGenerationCanvasStore } from '../../../generationCanvas/store/generationCanvasStore'
import { overriddenShotFields } from '../../../generationCanvas/model/storyboardOverrides'
import { effectiveShotValue } from '../shotRow/shotRowModel'
import { renderShotNodePrompt, stableShotId } from '../../../generationCanvas/agent/storyboardPlan'
import { pushUndoSnapshot } from '../../../generationCanvas/events/canvasUndoJournal'

/** Resolve exactly one field on the bound original. Discard is one canvas undo step. */
export function resolveStoryboardOverride(nodeId: string, field: string, action: 'adopt' | 'discard'): void {
  const canvas = useGenerationCanvasStore.getState()
  const node = canvas.nodes.find(candidate => candidate.id === nodeId)
  if (!node || !overriddenShotFields(node).includes(field)) return
  const store = useWorkbenchStore.getState()
  const design = Object.values(store.storyboardDesignsByDocumentId).flat().find(candidate => candidate.id === node.meta?.storyboardDesignId)
  const shot = design?.plan.shots.find(candidate => stableShotId(candidate) === node.meta?.shotId)
  if (!design || !shot) return
  const meta: Record<string, unknown> = { ...node.meta, overriddenFields: overriddenShotFields(node).filter(candidate => candidate !== field) }
  if (action === 'adopt') {
    const value = effectiveShotValue(shot, node, field)
    const nextShot = field.startsWith('params.')
      ? { ...shot, params: { ...shot.params, [field.slice(7)]: value } }
      : { ...shot, [field]: value, ...(field === 'prompt' ? { promptSegments: undefined } : {}) }
    store.setStoryboardPlan({ ...design.plan, shots: design.plan.shots.map(candidate => candidate === shot ? nextShot : candidate) }, design.documentId, design.id)
    canvas.updateNode(nodeId, { meta }, { origin: 'storyboard-projection' })
    return
  }
  pushUndoSnapshot(canvas)
  if (field === 'modelKey' || field === 'modelVendor' || field === 'modeId') {
    const entries = buildModelEntryIndex(buildAgentModelEntries(shot.modelKey ? [{ value: shot.modelKey, label: shot.modelKey, vendor: shot.modelVendor, kind: shot.shotKind ?? 'video' }] : []))
    const cleared = { ...node, meta }
    const patch = projectShotNode(design.plan, shot, cleared, 'shot', entries)
    canvas.updateNode(nodeId, patch, { origin: 'storyboard-projection', history: false })
    return
  }
  const value = effectiveShotValue(shot, null, field)
  if (field === 'prompt') {
    canvas.updateNode(nodeId, { prompt: renderShotNodePrompt(design.plan, shot), meta }, { origin: 'storyboard-projection', history: false })
  } else {
    const restored: Record<string, unknown> = { ...meta }
    if (field === 'modeId') restored.archetype = { ...(meta.archetype as object), modeId: value }
    else restored[field.startsWith('params.') ? field.slice(7) : field] = value
    canvas.updateNode(nodeId, { meta: restored }, { origin: 'storyboard-projection', history: false })
  }
}
