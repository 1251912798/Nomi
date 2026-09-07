import type { Model } from './types'
import type { ModelListResult } from '../ai/onboarding/modelListResponse'
import { isJsonRecord } from '../jsonUtils'

/** Listing evidence is vendor-scoped and never overrides a user's enable decision on recovery. */
export function modelListReconciliation(models: readonly Model[], vendorKey: string, result: ModelListResult): Array<Pick<Model, 'vendorKey' | 'modelKey' | 'unlisted' | 'enabled'>> {
  if (!result.ok || result.partial || result.notModified) return []
  const listed = new Set(result.models)
  return models.flatMap((model) => {
    if (model.vendorKey !== vendorKey || model.kind !== 'text') return []
    if (!isJsonRecord(model.meta) || typeof model.meta.catalogLifecycle !== 'string') return []
    const unlisted = !listed.has(model.modelAlias || model.modelKey)
    if (Boolean(model.unlisted) === unlisted) return []
    return [{ vendorKey, modelKey: model.modelKey, unlisted, enabled: unlisted ? false : model.enabled }]
  })
}
