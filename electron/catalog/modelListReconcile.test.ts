import { describe, expect, it } from 'vitest'
import type { Model } from './types'
import { modelListReconciliation } from './modelListReconcile'

const model = (vendorKey: string, modelKey: string): Model => ({ vendorKey, modelKey, labelZh: modelKey, kind: 'text', enabled: true, meta: { catalogLifecycle: 'value' }, createdAt: 'a', updatedAt: 'a' })
describe('catalog list reconciliation', () => {
  it('disables missing seeded ids and clears listing status without enabling restored ids', () => {
    const missing = modelListReconciliation([model('a', 'gone')], 'a', { ok: true, models: ['present'], statuses: [200] })
    expect(missing).toEqual([expect.objectContaining({ enabled: false, unlisted: true })])
    expect(modelListReconciliation([{ ...model('a', 'gone'), ...missing[0] }], 'a', { ok: true, models: ['gone'], statuses: [200] })).toEqual([expect.objectContaining({ enabled: false, unlisted: false })])
  })
  it('isolates vendors, manual entries and non-text models', () => {
    const rows = [model('b', 'gone'), { ...model('a', 'manual'), meta: {} }, { ...model('a', 'image'), kind: 'image' as const }]
    expect(modelListReconciliation(rows, 'a', { ok: true, models: [], statuses: [200] })).toEqual([])
  })
  it('does not treat failed, partial or unchanged responses as absence evidence', () => {
    for (const result of [{ ok: false as const, error: 'offline', statuses: [] }, { ok: true as const, models: [], statuses: [200], partial: true }, { ok: true as const, models: [], statuses: [304], notModified: true }]) {
      expect(modelListReconciliation([model('a', 'gone')], 'a', result)).toEqual([])
    }
  })
})
