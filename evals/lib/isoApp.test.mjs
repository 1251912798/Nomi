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
