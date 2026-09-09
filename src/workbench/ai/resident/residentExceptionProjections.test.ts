import i18n from '../../../i18n'
import { describe, expect, it } from 'vitest'
import { residentArgsForSelection, residentCandidates, residentPlanShots, residentVisibleCandidates } from './residentExceptionProjections'

void i18n.changeLanguage('zh-CN')

describe('resident exception projections', () => {
  it('keeps the first three candidates compact and reveals the second row on expand', () => {
    const candidates = residentCandidates({ candidates: [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id: `candidate-${id}`, title: `Version ${id}` })) })

    expect(residentVisibleCandidates(candidates, false).map((candidate) => candidate.id)).toEqual(['candidate-1', 'candidate-2', 'candidate-3'])
    expect(residentVisibleCandidates(candidates, true).map((candidate) => candidate.id)).toEqual(['candidate-1', 'candidate-2', 'candidate-3', 'candidate-4', 'candidate-5', 'candidate-6'])
  })

  it('projects every planned shot and selection without dropping provider metadata', () => {
    const args = { operation: 'create_canvas_nodes', nodes: [{ clientId: 'shot-1', title: 'Opening', prompt: 'Wide shot' }, { clientId: 'shot-2', title: 'Close', prompt: 'Close shot' }], providerId: 'provider-a' }
    expect(residentPlanShots(args)).toEqual([
      { id: 'shot-1', title: 'Opening', description: '' },
      { id: 'shot-2', title: 'Close', description: '' },
    ])
    expect(residentArgsForSelection(args, ['shot-2'])).toMatchObject({ providerId: 'provider-a', nodes: [{ clientId: 'shot-2' }] })
  })
})

it('C05 derives a recognisable title from semantic shot content and preserves metadata', () => {
  const shots = residentPlanShots({ shots: [{ shotId: 'one', prompt: '小禾走到河边旧街。她举起相机。', modelKey: 'MiniMax-H3', params: { resolution: '768P', duration: 8, aspect_ratio: '16:9' } }] })
  expect(shots[0]).toMatchObject({ title: '小禾走到河边旧街', description: 'MiniMax-H3 · 768P · 8s · 16:9' })
})
it('C05 empty shots use human shot numbers, never hash identifiers', () => {
  expect(residentPlanShots({ nodes: [{ clientId: 'one', kind: 'video' }] })[0]?.title).toBe('第 1 镜')
})
