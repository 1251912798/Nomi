import { runWhenCanvasWriteBoundarySettled } from '../../../generationCanvas/events/canvasWriteBoundary'
import { getUndoJournalGeneration } from '../../../generationCanvas/events/canvasUndoJournal'
import { projectStoryboardDesign } from './storyboardProjection'
import { createStoryboardShotTable, readShotTable } from '../../../../../electron/shared/canvas/shotTable'
import type { StoryboardDesign } from '../../../workbenchTypes'
import type { useGenerationCanvasStore } from '../../../generationCanvas/store/generationCanvasStore'

/** Explicit design writes create one view; hydration never manufactures canvas nodes. */
export function ensureStoryboardShotTable(design: StoryboardDesign, canvas: ReturnType<typeof useGenerationCanvasStore.getState>): void {
  const existing = canvas.nodes.find((node) => {
    const table = node.kind === 'shot_table' ? readShotTable(node.meta) : undefined
    return table?.source.kind === 'storyboard' && table.source.documentId === design.documentId && table.source.designId === design.id
  })
  if (existing || design.plan.shots.length === 0) return
  canvas.addNode({ kind: 'shot_table', title: design.title, categoryId: 'shots', meta: {
    shotTable: createStoryboardShotTable(design.documentId, design.id, new Date(design.updatedAt).toISOString()),
  } })
}

/** Explicit source edits own the design; their derived canvas view follows the
 * durable write boundary and is discarded if that canvas lifetime has ended. */
export function applyStoryboardPlanProjection(
  readDesign: () => StoryboardDesign | undefined,
  readCanvas: typeof useGenerationCanvasStore.getState,
): void {
  const generation = getUndoJournalGeneration()
  runWhenCanvasWriteBoundarySettled(() => {
    if (getUndoJournalGeneration() !== generation) return
    const design = readDesign()
    if (!design) return
    const canvas = readCanvas()
    ensureStoryboardShotTable(design, canvas)
    projectStoryboardDesign(design, canvas)
  })
}
