import { app } from 'electron'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { ATTENTION_SOUND_LIMITS } from './shared/contracts/attentionSound'
import { customAttentionSoundPath, readAttentionSoundSettings } from './settings/attentionSoundSettings'

export function defaultAttentionSoundPath(): string {
  return path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'assets', 'sound', 'nomi-attention.wav')
}
let active: ChildProcess | undefined
let deadline: ReturnType<typeof setTimeout> | undefined
let playbackEpoch = 0
export function stopAttentionSound(): void {
  playbackEpoch += 1
  clearTimeout(deadline)
  active?.kill()
  active = undefined
}
/** No shell interpolation. At most one voice, with a hard stop even if an OS player hangs. */
export async function playAttentionSound(preview = false): Promise<boolean> {
  if (active && !preview) return false
  stopAttentionSound()
  const epoch = playbackEpoch
  const settings = readAttentionSoundSettings()
  const file = settings.custom ? customAttentionSoundPath() : defaultAttentionSoundPath()
  const commands: [string, string[]][] = process.platform === 'darwin' ? [['afplay', [file]]]
    : process.platform === 'win32' ? [['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$p = New-Object System.Media.SoundPlayer; $p.SoundLocation = $env:NOMI_ATTENTION_FILE; try { $p.PlaySync() } finally { $p.Dispose() }']]]
      : [['paplay', [file]], ['aplay', [file]]]
  for (const [command, args] of commands) {
    if (epoch !== playbackEpoch) return false
    const started = await new Promise<boolean>((resolve) => {
      const child = spawn(command, args, { windowsHide: true, stdio: 'ignore', env: { ...process.env, NOMI_ATTENTION_FILE: file } })
      active = child
      child.once('error', () => { if (active === child) { clearTimeout(deadline); active = undefined }; resolve(false) })
      child.once('spawn', () => { if (active !== child) { child.kill(); resolve(false) } else resolve(true) })
      child.once('exit', () => { if (active === child) { clearTimeout(deadline); active = undefined } })
    })
    if (started) {
      deadline = setTimeout(stopAttentionSound, preview ? ATTENTION_SOUND_LIMITS.previewMs : (ATTENTION_SOUND_LIMITS.seconds + 1) * 1000)
      deadline.unref()
      return true
    }
  }
  return false
}
