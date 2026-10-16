import type { AssetRef } from '../../assets/assetTypes'
import { canvasNodeToAssetRefs } from '../../assets/assetTypes'
import type { AssetSlot } from '../../assets/AssetReference'
import { listNodeMediaResults } from '../model/nodeResultLifecycle'
import { enterCanvasPickMode } from '../store/canvasPickMode'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'

/** Point selection uses the same declared slots and original results as the picker. */
export function pickNodeSlotReference({ nodeId, slots, valuesByKey, occupiedByKey, remainingCapacity, onPick }: {
  nodeId: string
  slots: AssetSlot[]
  valuesByKey: Record<string, string | string[]>
  occupiedByKey: Map<string, number>
  remainingCapacity: number
  onPick: (slot: AssetSlot, asset: AssetRef) => void
}): () => void {
  const candidate = (sourceId: string) => {
    if (sourceId === nodeId) return undefined
    const source = useGenerationCanvasStore.getState().nodes.find(item => item.id === sourceId)
    if (!source) return undefined
    for (const asset of canvasNodeToAssetRefs(source).slice(0, 1)) {
      // Pointing at a node means its visible primary version; history remains in the + picker.
      // A poster is display data; it must never become a media input.
      if (!listNodeMediaResults(source).some(result => result.url === asset.renderUrl)) continue
      const slot = slots.find(item => {
        if (item.accept !== asset.kind) return false
        if (item.form === 'single') return true
        const values = valuesByKey[item.key]
        return !(Array.isArray(values) && values.includes(asset.renderUrl))
          && (item.max === undefined || (occupiedByKey.get(item.key) ?? 0) < item.max)
          && remainingCapacity > 0
      })
      if (slot) return { slot, asset }
    }
    return undefined
  }
  return enterCanvasPickMode({
    eligible: sourceId => Boolean(candidate(sourceId)),
    onPick: sourceId => { const selected = candidate(sourceId); if (selected) onPick(selected.slot, selected.asset) },
  })
}
