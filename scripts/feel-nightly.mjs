import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { scanFeel } from '../tests/ux/_feel.mjs'
import { compareFeelBaseline, recordNewFeelSurfaces } from '../tests/ux/_feel-observer.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readJson = async (file) => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'))

export async function collectNewFeelSurfaces(outputDir) {
  const surfaces = []
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) await visit(file)
      else if (entry.name === 'new-surfaces.json') {
        const records = JSON.parse(await fs.readFile(file, 'utf8'))
        surfaces.push(...records.map((record) => ({ ...record, source: file })))
      }
    }
  }
  await visit(outputDir)
  return surfaces
}

export async function updateFeelLedger(outputDir, records) {
  const ledgerPath = path.join(outputDir, 'first-sweep-ledger.json')
  const ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8'))
  const combined = [...new Map([...ledger.records, ...records].map((record) => [JSON.stringify(record), record])).values()]
  await fs.writeFile(ledgerPath, JSON.stringify({ ...ledger, records: combined }, null, 2) + '\n')
}

export async function runFeelNightly({ journeyId } = {}) {
  const catalog = await readJson('tests/ux/journeys/catalog.json')
  const baseline = await readJson('tests/ux/feel-baseline.json')
  const outputDir = path.join(root, 'artifacts/feel')
  await fs.mkdir(outputDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const records = []
  try {
    for (const journey of catalog.journeys.filter((item) => !journeyId || item.id === journeyId)) {
      for (const state of journey.states) {
        for (const theme of ['light', 'dark']) {
          const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: theme })
          try {
            await page.setContent(`<html style="color-scheme:${theme}"><body style="font:16px sans-serif">${state.html}</body></html>`)
            const label = `${journey.id}:${state.id}:${theme}`
            const screenshot = `${journey.id}-${state.id}-${theme}.png`
            const result = { ...await scanFeel(page, { label }), journey: journey.id, screenshotName: screenshot, platform: process.platform }
            await page.screenshot({ path: path.join(outputDir, screenshot) })
            records.push({
              ...result, screenshot, owner: state.owner, knownSymptom: state.knownSymptom || null,
              evidence: 'rendered-fixture-not-product-walkthrough',
              drift: compareFeelBaseline(result, baseline),
              newSurfaces: recordNewFeelSurfaces(result, baseline),
              rubric: catalog.rubric.map((item) => ({ ...item, score: null, status: 'needs-human-or-visual-judge' })),
            })
          } finally {
            await page.close()
          }
        }
      }
    }
  } finally {
    await browser.close()
  }
  if (!records.length) throw new Error(`No declared states for journey ${journeyId}`)
  const report = {
    generatedAt: new Date().toISOString(), provider: catalog.provider,
    findingCount: records.reduce((sum, record) => sum + record.findings.length, 0),
    records,
    newSurfaces: [...await collectNewFeelSurfaces(outputDir), ...records.flatMap((record) => record.newSurfaces.map((surface) => ({ ...surface, screenshot: record.screenshot })))],
  }
  await updateFeelLedger(outputDir, report.newSurfaces)
  const reportName = journeyId ? `nightly-${journeyId}` : 'nightly'
  await fs.writeFile(path.join(outputDir, `${reportName}.json`), JSON.stringify(report, null, 2) + '\n')
  const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
  await fs.writeFile(path.join(outputDir, `${reportName}.html`), '<!doctype html><meta charset="utf-8"><title>Feel fixture contact sheet</title>'
    + records.map((record) => `<section><h2>${escape(record.label)}</h2><img width="720" src="${escape(record.screenshot)}"><pre>${escape(JSON.stringify(record.findings, null, 2))}</pre></section>`).join('\n')
    + `<section><h2>首次记录，待登记 owner 或修复</h2><pre>${escape(JSON.stringify(report.newSurfaces, null, 2))}</pre></section>`)
  console.log(`feel nightly: ${records.length} screenshots; findings=${report.findingCount}; drift=${records.filter((record) => record.drift.length).length}`)
  if (records.some((record) => record.drift.some((change) => change.actual > change.allowed))) throw new Error(`Feel baseline drift; inspect artifacts/feel/${reportName}.json`)
  return report
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runFeelNightly()
