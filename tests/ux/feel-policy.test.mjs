import { test, expect } from 'vitest'
import { applyFeelExemptions, compareFeelBaseline } from './_feel-observer.mjs'

const finding = { rule: 'font-size', target: ['span'], text: ['Badge'], fontSizes: [11] }
const exemptions = { entries: [{ label: 'state', rule: 'font-size', owner: 'typography', reason: 'Reviewed badge', findings: [finding] }] }
const result = (findings, label = 'state') => ({ label, findings })

test('reviewed findings remain evidence while unrelated rules, states and smaller text fail', () => {
  const known = applyFeelExemptions(result([finding]), exemptions)
  expect(known.result.findings).toEqual([])
  expect(known.exempted).toEqual([finding])
  for (const changed of [
    { ...finding, rule: 'clipped-content' },
    { ...finding, text: ['New badge'] },
    { ...finding, target: ['button'] },
    { ...finding, fontSizes: [10] },
  ]) {
    const remaining = applyFeelExemptions(result([changed]), exemptions).result
    expect(compareFeelBaseline(remaining, { entries: [] })[0].kind).toBe('new')
  }
  expect(applyFeelExemptions(result([finding], 'another-state'), exemptions).result.findings).toEqual([finding])
})

test('one reviewed element cannot exempt an additional identical element', () => {
  const reviewed = applyFeelExemptions(result([finding, finding]), exemptions)
  expect(reviewed.exempted).toEqual([finding])
  expect(compareFeelBaseline(reviewed.result, { entries: [] })).toEqual([
    { rule: 'font-size', actual: 1, allowed: 0, kind: 'new' },
  ])
})
