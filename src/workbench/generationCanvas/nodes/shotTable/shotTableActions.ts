import { readShotTable, type DeconstructionShotTableDocument } from '../../../../../electron/shared/canvas/shotTable'
import { useGenerationCanvasStore } from '../../store/generationCanvasStore'

/** Edits operate on the latest document, preserving unrelated edits and immutable measured fields. */
export function editShotTableFacts(nodeId: string, edit: (table: DeconstructionShotTableDocument) => DeconstructionShotTableDocument): void {
  const store = useGenerationCanvasStore.getState()
  const node = store.nodes.find(candidate => candidate.id === nodeId)
  const table = readShotTable(node?.meta)
  if (!node || !table) return
  store.updateNode(nodeId, { meta: { ...node.meta, shotTable: { ...edit(table), revision: table.revision + 1, updatedAt: new Date().toISOString() } } })
}
