import { test, expect } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { collectNewFeelSurfaces } from '../../scripts/feel-nightly.mjs'
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
    expect(compareFeelBaseline(remaining, { entries: [{ label: 'state', rule: changed.rule, count: 0 }] })[0].kind).toBe('new')
  }
  expect(applyFeelExemptions(result([finding], 'another-state'), exemptions).result.findings).toEqual([finding])
})

test('one reviewed element cannot exempt an additional identical element', () => {
  const reviewed = applyFeelExemptions(result([finding, finding]), exemptions)
  expect(reviewed.exempted).toEqual([finding])
  expect(compareFeelBaseline(reviewed.result, { entries: [{ label: 'state', rule: 'font-size', count: 0 }] })).toEqual([
    { rule: 'font-size', actual: 1, allowed: 0, kind: 'new' },
  ])
})

test('unregistered surfaces record while explicit zero and known counts still ratchet', () => {
  const baseline = { entries: [{ label: 'state', rule: 'font-size', count: 0 }] }
  expect(compareFeelBaseline(result([finding], 'new-journey'), baseline)).toEqual([])
  expect(compareFeelBaseline(result([{ rule: 'text-overlap' }]), baseline)).toEqual([])
  expect(compareFeelBaseline(result([finding]), baseline)).toEqual([
    { rule: 'font-size', actual: 1, allowed: 0, kind: 'new' },
  ])
  expect(compareFeelBaseline(result([finding, finding]), { entries: [{ label: 'state', rule: 'font-size', count: 1 }] })[0].actual).toBe(2)
})

test('nightly collects every run including nested runs without discarding findings', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'feel-nightly-'))
  try {
    const surface = { label: 'new-journey', rule: finding.rule, mode: 'record', findings: [finding], screenshot: 'evidence.png' }
    for (const run of ['run-a', 'nested/run-b']) {
      await fs.mkdir(path.join(dir, run), { recursive: true })
      await fs.writeFile(path.join(dir, run, 'new-surfaces.json'), JSON.stringify([surface]))
    }
    const records = await collectNewFeelSurfaces(dir)
    expect(records).toHaveLength(2)
    for (const record of records) expect(record).toMatchObject(surface)
    expect(new Set(records.map((record) => record.source)).size).toBe(2)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('shipped smoke registration still rejects an extra reviewed-looking element', async () => {
  const baseline = JSON.parse(await fs.readFile(new URL('./feel-baseline.json', import.meta.url), 'utf8'))
  const reviewed = JSON.parse(await fs.readFile(new URL('./feel-exemptions.json', import.meta.url), 'utf8'))
  const entry = reviewed.entries[0]
  const findings = entry.findings.map((item) => ({ ...item, rule: entry.rule }))
  const clean = applyFeelExemptions(result(findings, entry.label), reviewed).result
  expect(compareFeelBaseline(clean, baseline)).toEqual([])
  const extra = applyFeelExemptions(result([...findings, findings[0]], entry.label), reviewed).result
  expect(compareFeelBaseline(extra, baseline)).toEqual([{ rule: entry.rule, actual: 1, allowed: 0, kind: 'new' }])
})
