/** One persisted owner for sound preferences; paths never cross the settings bridge. */
export type AttentionSoundEvent = 'decision' | 'completed' | 'slow'
export type AttentionSoundSettings = {
  schemaVersion: 1
  enabled: boolean
  events: Record<AttentionSoundEvent, boolean>
  custom: { name: string; durationSeconds: number } | null
}
export const ATTENTION_SOUND_LIMITS = { bytes: 2 * 1024 * 1024, seconds: 10, previewMs: 2000 } as const
export const DEFAULT_ATTENTION_SOUND: AttentionSoundSettings = {
  schemaVersion: 1, enabled: true, events: { decision: true, completed: false, slow: false }, custom: null,
}
export function normalizeAttentionSound(value: unknown): AttentionSoundSettings {
  const raw = value && typeof value === 'object' ? value as Partial<AttentionSoundSettings> : {}
  const defaults = DEFAULT_ATTENTION_SOUND
  const flag = (v: unknown, fallback: boolean): boolean => typeof v === 'boolean' ? v : fallback
  const custom = raw.custom
  return {
    schemaVersion: 1,
    enabled: flag(raw.enabled, defaults.enabled),
    events: {
      decision: flag(raw.events?.decision, defaults.events.decision),
      completed: flag(raw.events?.completed, defaults.events.completed),
      slow: flag(raw.events?.slow, defaults.events.slow),
    },
    custom: custom && typeof custom.name === 'string' && custom.name.length <= 255
      && Number.isFinite(custom.durationSeconds) && custom.durationSeconds > 0 && custom.durationSeconds <= ATTENTION_SOUND_LIMITS.seconds
      ? { name: custom.name, durationSeconds: custom.durationSeconds } : null,
  }
}
export type AttentionSoundImportResult =
  | { ok: true; settings: AttentionSoundSettings }
  | { ok: false; reason: 'canceled' | 'invalid' | 'save-failed' }
export type AttentionSoundBridge = {
  get: () => Promise<AttentionSoundSettings>
  set: (value: unknown) => Promise<AttentionSoundSettings>
  pick: () => Promise<AttentionSoundImportResult>
  reset: () => Promise<AttentionSoundSettings>
  preview: () => Promise<{ ok: boolean }>
  stop: () => Promise<void>
}
