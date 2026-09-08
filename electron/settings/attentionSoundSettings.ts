import path from 'node:path'
import { readJsonFile, writeJsonFileAtomic } from '../jsonFile'
import { getSettingsRoot } from './settingsRoot'
import { automationPolicySettingsPath } from './automationPolicySettings'
import { normalizeAttentionSound, type AttentionSoundSettings } from '../shared/contracts/attentionSound'

const settingsPath = (): string => path.join(getSettingsRoot(), 'attention-sound.json')
export const customAttentionSoundPath = (): string => path.join(getSettingsRoot(), 'sounds', 'attention.wav')
function legacyEnabled(): unknown {
  try { return (readJsonFile(automationPolicySettingsPath()) as { notificationSound?: unknown })?.notificationSound } catch { return undefined }
}
export function readAttentionSoundSettings(): AttentionSoundSettings {
  try {
    const stored = readJsonFile(settingsPath())
    return normalizeAttentionSound(stored ?? { enabled: legacyEnabled() })
  } catch { return normalizeAttentionSound({ enabled: legacyEnabled() }) }
}
export function writeAttentionSoundSettings(value: unknown): AttentionSoundSettings {
  const next = normalizeAttentionSound(value)
  writeJsonFileAtomic(settingsPath(), next)
  return next
}

/** One-time migration before automation settings can discard the retired sound field. */
export function migrateAttentionSoundSettings(): void {
  try { if (readJsonFile(settingsPath())) return } catch { /* no new settings yet */ }
  writeAttentionSoundSettings({ enabled: legacyEnabled() })
}
