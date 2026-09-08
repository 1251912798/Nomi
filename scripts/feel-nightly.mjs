// Shared first/second-layer entry. Only selected executable journeys may claim execution.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createCollector, readJson, hash } from '../tests/ux/experience/collect.mjs'
import { writeReport } from '../tests/ux/experience/report.mjs'
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const catalog = await readJson(path.join(root, 'tests/ux/journeys/catalog.json'))
const args = process.argv.slice(2)
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
    playwright: (await readJson(path.join(root, 'node_modules/playwright/package.json'))).version,
    electron: (await readJson(path.join(root, 'node_modules/electron/package.json'))).version,
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
