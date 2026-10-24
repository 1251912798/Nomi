import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { isolatedAppEnv, prepareIsolation } from './isoApp.mjs'

const roots = []

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('eval isolation catalog boundary', () => {
  test('allocates a capability directory and propagates it with the other isolated roots', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-iso-app-'))
    roots.push(root)

    const iso = prepareIsolation(root, { requireCatalog: false })
    const env = isolatedAppEnv(iso, {})

    expect(fs.existsSync(iso.capabilityDir)).toBe(true)
    expect(env.NOMI_CAPABILITY_DIR).toBe(iso.capabilityDir)
    expect(env.NOMI_SETTINGS_DIR).toBe(iso.settingsDir)
  })

  test('isolates the host configs too: every host location variable points at an existing dir under the isolation root', () => {
    // 2026-10-24：只隔离 Nomi 自己的目录时，评测起的 App 读的是本机真实的 ~/.claude.json。
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-iso-app-'))
    roots.push(root)
    const iso = prepareIsolation(root, { requireCatalog: false })
    const env = isolatedAppEnv(iso, { CLAUDE_CONFIG_DIR: '/developer/real/claude', CODEX_HOME: '/developer/real/codex' })
    expect(iso.hostConfigDir).toBe(path.join(root, 'host-config'))
    for (const name of ['CLAUDE_CONFIG_DIR', 'CODEX_HOME']) {
      expect(env[name], name).toBe(path.join(iso.hostConfigDir, name))
      expect(fs.statSync(env[name]).isDirectory(), name).toBe(true)
    }
  })

  test('requireCatalog: false never copies the real profile, even when this machine has one', () => {
    const real = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-iso-real-profile-'))
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-iso-app-'))
    roots.push(real, root)
    fs.writeFileSync(path.join(real, 'model-catalog.json'), JSON.stringify({ version: 1, vendors: [], models: [], apiKeysByVendor: { fixture: { enc: 'safeStorage', value: 'x' } } }))
    const previous = process.env.NOMI_REAL_PROFILE_USER_DATA
    process.env.NOMI_REAL_PROFILE_USER_DATA = real
    try {
      const hermetic = prepareIsolation(path.join(root, 'hermetic'), { requireCatalog: false })
      expect(fs.readdirSync(hermetic.settingsDir)).toEqual([])
      const seeded = prepareIsolation(path.join(root, 'seeded'), { requireCatalog: true })
      expect(fs.existsSync(path.join(seeded.settingsDir, 'model-catalog.json'))).toBe(true)
    } finally {
      if (previous === undefined) delete process.env.NOMI_REAL_PROFILE_USER_DATA
      else process.env.NOMI_REAL_PROFILE_USER_DATA = previous
    }
  })
})
