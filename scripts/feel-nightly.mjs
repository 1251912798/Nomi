import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { scanFeel } from '../tests/ux/_feel.mjs'
import { compareFeelBaseline, recordNewFeelSurfaces } from '../tests/ux/_feel-observer.mjs'

import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createCollector, hash } from '../tests/ux/experience/collect.mjs'
import { writeReport } from '../tests/ux/experience/report.mjs'

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

export async function runExperienceNightly(args = []) {
  const catalog = await readJson('tests/ux/journeys/catalog.json')
  if (args.some((a) => !a.startsWith('--journey=') && a !== '--initialize-baseline'))
    throw new Error('Usage: feel-nightly.mjs [--journey=id] [--initialize-baseline]')
  const requested = args.filter((a) => a.startsWith('--journey=')).map((a) => a.slice('--journey='.length))
  const selected = requested.length ? requested : catalog.journeys.filter((j) => j.experience).map((j) => j.id)
  if (!selected.length || new Set(selected).size !== selected.length) throw new Error('Empty or duplicated selection')
  for (const id of selected)
    if (!catalog.journeys.some((j) => j.id === id && j.runner)) throw new Error(`No executable runner for ${id}`)
  const outputDir = path.join(root, 'artifacts/experience')
  await fs.mkdir(outputDir, { recursive: true })
  const applicationSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const sourceFiles = [
    'tests/ux/experience/collect.mjs',
    'tests/ux/experience/dom.mjs',
    'tests/ux/experience/judge.mjs',
    'tests/ux/experience/rubric.json',
    'tests/ux/_feel.mjs',
    'tests/ux/_feel-observer.mjs',
    'tests/ux/journeys/experience.walk.mjs',
    'tests/ux/_launchApp.mjs',
    'tests/ux/journeys/catalog.json',
  ]
  const digests = Object.fromEntries(
    await Promise.all(sourceFiles.map(async (file) => [file, hash(await fs.readFile(path.join(root, file)))])),
  )
  const runId = randomUUID()
  const identity = {
    runId,
    applicationSha,
    compatibility: {
      rubricVersion: 1,
      sourceHash: hash(JSON.stringify(digests)),
      platform: process.platform,
      architecture: process.arch,
      playwright: (await readJson('node_modules/playwright/package.json')).version,
      electron: (await readJson('node_modules/electron/package.json')).version,
    },
  }
  await fs.writeFile(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify(
      {
        startedAt: new Date().toISOString(),
        selected,
        runId,
        applicationSha,
        digests,
        sourceHash: identity.compatibility.sourceHash,
      },
      null,
      2,
    ) + '\n',
  )
  let failed = false
  for (const id of selected) {
    const journey = catalog.journeys.find((j) => j.id === id)
    const dir = path.join(outputDir, 'runs', id)
    // Remove only this task-owned run's old evidence before starting: stale green cannot survive failure.
    await fs.rm(dir, { recursive: true, force: true })
    const collector = await createCollector({ journey, outputDir: dir, identity })
    try {
      const { runJourney } = await import(new URL(`../tests/ux/journeys/${journey.runner}`, import.meta.url))
      await runJourney(journey, collector)
      console.log(`Completed: ${id}`)
    } catch (error) {
      failed = true
      console.error(`Failed: ${id}: ${error.stack}`)
    }
  }
  const report = await writeReport({ outputDir, catalog, initialize: args.includes('--initialize-baseline') })
  console.log(`Report: ${path.join(outputDir, 'report.md')}`)
  if (failed || report.failed) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2).filter((arg) => arg !== '--')
  if (args.includes('--experience')) await runExperienceNightly(args.filter((arg) => arg !== '--experience'))
  else {
    if (args.length) throw new Error('Use --experience for experience journey options')
    await runFeelNightly()
  }
}
