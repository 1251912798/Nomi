#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const MODEL = 'gemini-2.5-flash-image-preview'
const PRICE_URL = 'https://apimart.ai/api/marketplace/models?keyword=nano%20banana&page_size=10'
const MAX_CNY = 6
// Conservative accounting ceiling, not a claimed live exchange rate.
const CNY_PER_USD_CEILING = 8
const args = process.argv.slice(2)
const value = (flag) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined
const dryRun = args.includes('--dry-run')
const anchor = value('--anchor')
const limit = Number(value('--limit') ?? (anchor ? 10 : 3))
const outputRoot = path.join(root, 'docs/design/covers')
const ledgerPath = path.join(outputRoot, 'generation-receipt.json')

function saveLedger(ledger) {
  fs.mkdirSync(outputRoot, { recursive: true })
  fs.writeFileSync(`${ledgerPath}.tmp`, `${JSON.stringify(ledger, null, 2)}\n`)
  fs.renameSync(`${ledgerPath}.tmp`, ledgerPath)
}
function getEntries() {
  const { parseSkillFrontmatter } = require(path.join(root, 'dist-electron/skills/skillFrontmatter.js'))
  const { readSkillCuration } = require(path.join(root, 'dist-electron/skills/skillCuration.js'))
  return fs.readdirSync(path.join(root, 'skills')).sort().flatMap((name) => {
    const filename = path.join(root, 'skills', name, 'SKILL.md')
    if (!fs.existsSync(filename)) return []
    const source = fs.readFileSync(filename, 'utf8')
    const front = parseSkillFrontmatter(source)
    if (front.error) throw new Error(`Invalid Skill: ${name}`)
    const entry = readSkillCuration(front.values)
    if (!entry || entry.preview) return []
    return [{ name, filename, entry, front }]
  })
}
function palette() {
  const css = fs.readFileSync(path.join(root, 'src/theme/nomi-tokens.css'), 'utf8')
  return ['paper', 'ink', 'accent'].map((name) => {
    const match = css.match(new RegExp(`--nomi-${name}:\\s*([^;]+);`))
    if (!match) throw new Error(`Missing design token: ${name}`)
    return `${name} ${match[1]}`
  }).join(', ')
}
function promptFor(concept, variation) {
  return `Editorial flat geometric illustration for Nomi. Concept: ${concept}. ` +
    `Palette from design tokens: ${palette()}. Use only paper, ink and one blue accent. ` +
    `One visual metaphor, at most five simple shapes, generous paper space, no gradients, no 3D rendering, ` +
    `no faces, no letters, no text, no numbers, no watermarks. 16:9 landscape. ` +
    `${variation} Title is added later by the UI, never inside the image.`
}
const variations = [
  'Three flat paper panels fan from a single blue rectangle, like one idea becoming three views. Crisp straight edges.',
  'Three paper panels orbit one blue disk, like different views of the same object. Gentle curves, balanced spacing.',
  'A single blue rectangle passes through three offset ink outline frames. Cut-paper geometry, asymmetric placement.',
]

async function main() {
  if (!Number.isInteger(limit) || limit < 1 || limit > (anchor ? 10 : 3)) {
    throw new Error('--limit must be 1–3 for anchors, 1–10 after an explicit --anchor choice')
  }
  const entries = getEntries()
  const jobs = anchor
    ? entries.slice(0, limit).map((item) => ({
      name: item.name, item,
      output: path.join(root, 'skills', item.name, 'assets/cover.png'),
      prompt: promptFor(`${item.entry.title.en}. ${item.entry.summary.en}`, 'Match the reference image style, line weight, shapes and palette.'),
    }))
    : variations.slice(0, limit).map((variation, index) => ({
      name: `anchor-${index + 1}`,
      output: path.join(outputRoot, 'anchors', `anchor-${index + 1}.png`),
      prompt: promptFor('one subject, multiple views', variation),
    }))
  if (jobs.some((job) => job.prompt.length > 1000)) throw new Error('Prompt exceeds the documented 1000-character limit')
  if (dryRun) {
    console.log(JSON.stringify({ mode: anchor ? 'trial' : 'anchors', missingMedia: entries.length, model: MODEL, limit, budgetCny: MAX_CNY, jobs: jobs.map(({ item: _item, ...job }) => job) }, null, 2))
    return
  }
  if (!process.versions.electron) throw new Error('Paid run requires Electron: pnpm exec electron scripts/covers/generate-covers.mjs --limit 3')
  const { app, nativeImage } = require('electron')
  app.setName(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name)
  app.setPath('userData', path.join(app.getPath('appData'), app.getName()))
  await app.whenReady()
  const lock = path.join(outputRoot, '.generation.lock')
  fs.mkdirSync(outputRoot, { recursive: true })
  const lockFd = fs.openSync(lock, 'wx')
  try {
    const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : {
      model: MODEL, budgetCny: MAX_CNY, cnyPerUsdCeiling: CNY_PER_USD_CEILING, jobs: [],
    }
    if (ledger.jobs.some((job) => job.state === 'reserved' || job.state === 'submitted')) {
      throw new Error('Unfinished paid request in receipt; reconcile its task before any new submission')
    }
    if (!anchor && ledger.jobs.some((job) => job.name.startsWith('anchor-'))) throw new Error('Anchors already attempted; choose one before further generation')
    if (anchor && !ledger.jobs.some((job) => job.state === 'completed' && path.resolve(root, job.output) === path.resolve(anchor))) {
      throw new Error('--anchor must point to a completed candidate from this receipt')
    }
    if (jobs.some((job) => fs.existsSync(job.output))) throw new Error('Refusing to overwrite existing media')
    const pricingResponse = await fetch(PRICE_URL, { signal: AbortSignal.timeout(30000) })
    const pricing = (await pricingResponse.json()).data?.models?.find((model) => model.model_name === MODEL)?.pricing
    if (!pricingResponse.ok || pricing?.billing_type !== 'per_generation' || !(pricing.starting_price > 0) || pricing.starting_price > 0.02) {
      throw new Error('Current official per-image price missing or above verified ceiling')
    }
    // Two times the published price is reserved before each submit, including failed attempts.
    const reserveCny = pricing.starting_price * 2 * CNY_PER_USD_CEILING
    const reserved = ledger.jobs.reduce((sum, job) => sum + job.reservedCny, 0)
    if (reserved + reserveCny * jobs.length > MAX_CNY) throw new Error('Session budget exhausted')
    ledger.priceEvidence = { url: PRICE_URL, retrievedAt: new Date().toISOString(), pricing }
    const { readCatalog } = require(path.join(root, 'dist-electron/catalog/catalogStore.js'))
    const { decryptApiKeyRecord } = require(path.join(root, 'dist-electron/catalog/secrets.js'))
    const catalog = readCatalog()
    const vendor = catalog.vendors.find((candidate) => candidate.key === 'apimart')
    const key = vendor && decryptApiKeyRecord(catalog.apiKeysByVendor[vendor.key])
    if (!key) throw new Error('APIMart credential is unavailable in the application catalog')
    const apiJson = async (route, body) => {
      const response = await fetch(`https://api.apimart.ai/v1/${route}`, {
        method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000),
      })
      // Never print upstream response bodies: a provider could echo request credentials.
      if (!response.ok) throw new Error(`APIMart HTTP ${response.status}`)
      return response.json().catch(() => { throw new Error('APIMart invalid JSON response') })
    }
    const usedBalance = async () => {
      const response = await apiJson('balance')
      const data = response.data ?? response
      if (!Number.isFinite(data.used_balance)) throw new Error('Balance evidence unavailable')
      return data.used_balance
    }
    const reference = anchor ? `data:image/png;base64,${fs.readFileSync(path.resolve(anchor)).toString('base64')}` : undefined
    for (const job of jobs) {
      const before = await usedBalance()
      const receipt = { name: job.name, prompt: job.prompt, output: path.relative(root, job.output), reservedCny: reserveCny, state: 'reserved', before, startedAt: new Date().toISOString() }
      ledger.jobs.push(receipt)
      saveLedger(ledger)
      const submitted = await apiJson('images/generations', { model: MODEL, prompt: job.prompt, size: '16:9', n: 1, ...(reference ? { image_urls: [reference] } : {}) })
      const taskId = submitted.data?.[0]?.task_id
      if (!taskId) throw new Error('Submission has no task id; reconcile receipt, do not resubmit')
      receipt.taskId = taskId
      receipt.state = 'submitted'
      saveLedger(ledger)
      let url
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 4000))
        const result = (await apiJson(`tasks/${encodeURIComponent(taskId)}`)).data
        if (result?.status === 'failed') throw new Error(`Image task failed: ${job.name}; no automatic retry`)
        if (result?.status === 'completed') {
          const urls = result.result?.images?.[0]?.url
          url = Array.isArray(urls) ? urls[0] : urls
          break
        }
      }
      if (!url || !url.startsWith('https://')) throw new Error('Image did not complete with an HTTPS artifact')
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('Invalid image artifact')
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length > 20 * 1024 * 1024) throw new Error('Image artifact exceeds 20 MiB')
      fs.mkdirSync(path.dirname(job.output), { recursive: true })
      const decoded = nativeImage.createFromBuffer(bytes)
      if (decoded.isEmpty()) throw new Error('Image artifact could not be decoded')
      fs.writeFileSync(job.output, decoded.toPNG())
      receipt.after = await usedBalance()
      receipt.balanceDelta = Math.max(0, receipt.after - before)
      receipt.state = 'completed'
      receipt.completedAt = new Date().toISOString()
      saveLedger(ledger)
      if (job.item) {
        const yaml = require('js-yaml')
        job.item.front.values.metadata.nomi.library.preview = { path: 'assets/cover.png', type: 'image', provenance: 'illustration' }
        const source = fs.readFileSync(job.item.filename, 'utf8')
        fs.writeFileSync(job.item.filename, `---\n${yaml.dump(job.item.front.values, { lineWidth: 120 })}---\n${source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')}`)
      }
      console.log(`${job.name}: ${receipt.output}; balance delta ${receipt.balanceDelta.toFixed(6)}`)
      if (receipt.balanceDelta * CNY_PER_USD_CEILING > reserveCny) throw new Error('Unexpected charge; stopped before next submission')
    }
    console.log(anchor ? 'Trial complete.' : 'Three-anchor stage complete. Stop here for user selection; no batch generation.')
  } finally {
    fs.closeSync(lockFd)
    fs.unlinkSync(lock)
    app.quit()
  }
}

main().catch((error) => {
  // Local error messages only; no credentials, request bodies or provider response content.
  console.error(error instanceof Error ? error.message : 'Cover generation failed')
  if (process.versions.electron) require('electron').app.exit(1)
  else process.exitCode = 1
})
