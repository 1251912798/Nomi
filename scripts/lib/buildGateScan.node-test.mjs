import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { BUILD_LAUNCHER, NON_BUILD_SPAWNERS, findUngatedBuildConsumers } from './buildGateScan.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('bypass: a test file that spawns Electron without the build-stamp check is flagged', () => {
  const bypass = `const { spawn } = require('node:child_process')
spawn(require('electron'), ['.'])
`
  assert.equal(findUngatedBuildConsumers([{ rel: 'tests/ux/new-walk.mjs', source: bypass }]).length, 1)
  const playwright = `import { _electron } from 'playwright'
await _electron['launch']({})
`
  assert.equal(findUngatedBuildConsumers([{ rel: 'tests/ux/other.mjs', source: playwright }]).length, 1)
})

test('gated: the stamp check, the shared launcher, or a registered non-build spawner passes', () => {
  const gated = `assertFreshBuild(repoRoot)
spawn(require('electron'), ['.'])
`
  const viaLauncher = `import { launchNomiApp } from './_launchApp.mjs'
const c = process.env.X ? require('electron') : null
await launchNomiApp({})
`
  const inElectron = `const { app } = require('electron')
app.exit(0)
`
  const commentOnly = `// spawn(require('electron'), ['.'])
`
  for (const source of [gated, viaLauncher, inElectron, commentOnly]) {
    assert.deepEqual(findUngatedBuildConsumers([{ rel: 'tests/ux/ok.mjs', source }]), [])
  }
  const [rel] = Object.keys(NON_BUILD_SPAWNERS)
  assert.deepEqual(findUngatedBuildConsumers([{ rel, source: "spawnSync(require('electron'), ['x.cjs'])" }]), [])
})

test('the launcher itself must call assertFreshBuild', () => {
  assert.equal(findUngatedBuildConsumers([{ rel: BUILD_LAUNCHER, source: `electron['launch']({})` }]).length, 1)
  assert.deepEqual(findUngatedBuildConsumers([{ rel: BUILD_LAUNCHER, source: "assertFreshBuild(repoRoot)\nelectron['launch']({})" }]), [])
})

test('the real tests/ tree has no ungated build consumer', () => {
  const files = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/.(mjs|js|ts|cjs)$/.test(entry.name)) files.push({ rel: path.relative(repoRoot, full).split(path.sep).join('/'), source: fs.readFileSync(full, 'utf8') })
    }
  }
  walk(path.join(repoRoot, 'tests'))
  assert.deepEqual(findUngatedBuildConsumers(files), [])
})
