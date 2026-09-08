import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { scanFeel } from './_feel.mjs'

const baselinePath = new URL('./feel-baseline.json', import.meta.url)
const exemptionsPath = new URL('./feel-exemptions.json', import.meta.url)
const installed = new WeakMap()
const catalog = JSON.parse(fs.readFileSync(new URL('./journeys/catalog.json', import.meta.url), 'utf8'))
const ratchetJourneys = new Set([...catalog.journeys.map((journey) => journey.id), 'smoke'])
export const feelMode = (journey) => ratchetJourneys.has(journey) ? 'ratchet' : 'record'
export const feelSurfaceKey = ({ journey, screenshotName, rule }) => JSON.stringify([journey, screenshotName, rule])
const sameScreenshot = (entry, result) => entry.journey === result.journey && entry.screenshotName === result.screenshotName

export function compareFeelBaseline(result, baseline) {
  if (feelMode(result.journey) === 'record') return []
  const counts = new Map()
  for (const finding of result.findings) counts.set(finding.rule, (counts.get(finding.rule) || 0) + 1)
  const expected = baseline.entries.filter((entry) => sameScreenshot(entry, result))
  const rules = new Set([...counts.keys(), ...expected.map((entry) => entry.rule)])
  return [...rules].flatMap((rule) => {
    const actual = counts.get(rule) || 0
    const entry = expected.find((entry) => entry.rule === rule)
    if (!entry) return []
    const allowed = entry.count
    return actual === allowed ? [] : [{ rule, actual, allowed, kind: actual > allowed ? 'new' : 'reduced-update-baseline' }]
  })
}

/** Missing registration is evidence to triage, never an implicit zero budget. */
export function recordNewFeelSurfaces(result, baseline) {
  const rules = [...new Set(result.findings.map((finding) => finding.rule))]
  return rules.filter((rule) => feelMode(result.journey) === 'record' || !baseline.entries.some((entry) => sameScreenshot(entry, result) && entry.rule === rule))
    .map((rule) => ({
      label: result.label, journey: result.journey, screenshotName: result.screenshotName, platform: process.platform, rule, mode: 'record',
      findings: result.findings.filter((finding) => finding.rule === rule),
    }))
}

/** Consume reviewed findings once; new text, smaller type or duplicate nodes still fail. */
export function applyFeelExemptions(result, exemptions) {
  const entries = exemptions.entries.filter((entry) => entry.label === result.label)
  const remaining = entries.flatMap((entry) => entry.findings.map((finding) => ({ ...finding, rule: entry.rule })))
  const identity = ({ rule, target, text, fontSizes }) => JSON.stringify({ rule, target, text, fontSizes })
  const exempted = []
  const findings = result.findings.filter((finding) => {
    const index = remaining.findIndex((known) => identity(known) === identity(finding))
    if (index < 0) return true
    remaining.splice(index, 1)
    exempted.push(finding)
    return false
  })
  return { result: { ...result, findings }, exempted, entries }
}

/** Every page records; only mechanism-owned journeys can reject baseline drift. */
export function installFeelObserver(page, {
  name,
  outputDir = path.resolve('artifacts/feel', `${name.replace(/[^a-z0-9_-]/gi, '_')}-${randomUUID()}`),
  baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')),
  exemptions = JSON.parse(fs.readFileSync(exemptionsPath, 'utf8')),
} = {}) {
  if (installed.has(page)) return installed.get(page)
  fs.mkdirSync(outputDir, { recursive: true })
  let sequence = 0
  const screenshot = page.screenshot.bind(page)
  const records = []
  const newSurfaces = []
  const recordedSurfaces = new Set()
  async function checkpoint(label, existingScreenshot, screenshotName = existingScreenshot ? path.basename(String(existingScreenshot)) : `${label}.png`) {
    const result = { ...await scanFeel(page, { label }), journey: name, screenshotName, platform: process.platform, mode: feelMode(name) }
    const reviewed = applyFeelExemptions(result, exemptions)
    const drift = compareFeelBaseline(reviewed.result, baseline)
    const file = existingScreenshot || path.join(outputDir, `${++sequence}.png`)
    if (!existingScreenshot) await screenshot({ path: file })
    const surfaces = recordNewFeelSurfaces(result.mode === 'record' ? result : reviewed.result, baseline).map((surface) => ({ ...surface, screenshot: file }))
    const fresh = surfaces.filter((surface) => !recordedSurfaces.has(feelSurfaceKey(surface)))
    for (const surface of surfaces) recordedSurfaces.add(feelSurfaceKey(surface))
    newSurfaces.push(...surfaces)
    const record = { ...result, screenshot: file, drift, newSurfaces: surfaces, exempted: reviewed.exempted, exemptions: reviewed.entries }
    records.push(record)
    fs.writeFileSync(path.join(outputDir, 'contact-sheet.json'), JSON.stringify(records, null, 2) + '\n')
    fs.writeFileSync(path.join(outputDir, 'new-surfaces.json'), JSON.stringify(newSurfaces, null, 2) + '\n')
    console.log(`feel ${result.mode}: ${name}/${screenshotName}; findings=${result.findings.length}; new-surfaces=${fresh.length}; evidence: ${outputDir}`)
    if (drift.some((change) => change.actual > change.allowed)) throw new Error(`Feel baseline drift at ${label}: ${JSON.stringify(drift)}; evidence: ${outputDir}`)
    return result
  }
  const instrumented = new WeakSet()
  const locatorFactories = [
    'locator', 'getByRole', 'getByText', 'getByLabel', 'getByPlaceholder',
    'getByTitle', 'getByAltText', 'getByTestId', 'frameLocator', 'contentFrame',
    'filter', 'first', 'last', 'nth', 'and', 'or',
  ]
  function instrumentScreenshots(target) {
    if (instrumented.has(target)) return target
    instrumented.add(target)
    if (typeof target.screenshot === 'function') {
      const original = target === page ? screenshot : target.screenshot.bind(target)
      target.screenshot = async (options = {}) => {
        const value = await original(options)
        const label = `${name}:screenshot:${options.path ? path.basename(String(options.path)) : 'page'}`
        await checkpoint(label, options.path)
        return value
      }
    }
    for (const method of locatorFactories) {
      if (typeof target[method] !== 'function') continue
      const original = target[method].bind(target)
      target[method] = (...args) => instrumentScreenshots(original(...args))
    }
    if (typeof target.all === 'function') {
      const original = target.all.bind(target)
      target.all = async () => (await original()).map(instrumentScreenshots)
    }
    return target
  }
  instrumentScreenshots(page)
  // Public state-wait APIs used by walkthroughs; no Playwright private instrumentation.
  for (const method of ['waitForFunction', 'waitForSelector', 'waitForLoadState']) {
    const original = page[method].bind(page)
    page[method] = async (...args) => {
      const value = await original(...args)
      await checkpoint(`${name}:${method}`, undefined, `${method}.png`)
      return value
    }
  }
  const observer = { checkpoint, records }
  installed.set(page, observer)
  return observer
}
