import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' }).trim()
for (const file of ['tests/ux/feel-baseline.json', 'tests/ux/feel-exemptions.json']) {
  const current = read(file)
  let previous
  const exists = execFileSync('git', ['ls-tree', '--name-only', base, '--', file], { encoding: 'utf8' }).trim()
  if (exists) previous = JSON.parse(execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' }))
  const keys = new Set()
  for (const entry of current.entries) {
    const key = `${entry.label}:${entry.rule || 'exemption'}`
    if (keys.has(key)) throw new Error(`Duplicate feel entry: ${key}`)
    keys.add(key)
    if (!entry.owner || !entry.label) throw new Error(`Missing feel owner/label: ${key}`)
    if (file.includes('exemptions') && !entry.reason) throw new Error(`Missing exemption reason: ${key}`)
    if (file.includes('baseline') && (!Number.isInteger(entry.count) || entry.count < 1)) throw new Error(`Invalid count: ${key}`)
    if (previous) {
      const old = previous.entries.find((item) => item.label === entry.label && item.rule === entry.rule)
      if (!old || (entry.count || 1) > (old.count || 1)) throw new Error(`Feel ratchet may only decrease: ${key}`)
    }
  }
  if (file.includes('exemptions') && !previous && current.entries.length) throw new Error('Initial exemptions must be empty')
}
const scanner = fs.readFileSync('tests/ux/_feel.mjs', 'utf8')
if (/^import\s/m.test(scanner) || /data-testid|react-flow|nomi|agent-panel/i.test(scanner)) {
  throw new Error('Feel scanner must be independent of product imports/selectors')
}
const catalog = read('tests/ux/journeys/catalog.json')
for (const journey of catalog.journeys) {
  if (!journey.id || !journey.states.length) throw new Error('Invalid feel journey')
  for (const state of journey.states) if (!state.id || !state.html || !state.owner) throw new Error('Invalid feel state')
}
console.log('Feel generic boundary and baseline/exemption ratchets passed')
