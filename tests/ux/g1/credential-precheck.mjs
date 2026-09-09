import { hasCredential } from './credential-main.mjs'
// Node owns the deadline: Electron's synchronous Keychain call cannot run its own timer.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

export function screenEvidence() {
  if (process.platform !== 'darwin') return { state: 'unknown', source: 'unsupported-platform' }
  try {
    const output = execFileSync('/usr/sbin/ioreg', ['-n', 'Root', '-d1'], { encoding: 'utf8', timeout: 500, stdio: ['ignore', 'pipe', 'ignore'] })
    const match = output.match(/"CGSSessionScreenIsLocked"\s*=\s*(Yes|No|true|false)/)
    return { state: match ? /Yes|true/.test(match[1]) ? 'locked' : 'unlocked' : 'unknown',
      source: 'ioreg Root CGSSessionScreenIsLocked', observed: match?.[0] ?? 'field-absent' }
  } catch { return { state: 'unknown', source: 'ioreg', observed: 'probe-unavailable-or-timeout' } }
}
export function blockedError(directory, reason, screen = screenEvidence()) {
  const receipt = { status: 'blocked', reason, screen, at: new Date().toISOString(), paidCalls: 0 }
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'credential-precheck.json'), JSON.stringify(receipt, null, 2))
  return Object.assign(Error('CREDENTIAL_BLOCKED'), { code: 'CREDENTIAL_BLOCKED', receipt })
}
export function requireCredential(file, directory) {
  let record
  try { record = JSON.parse(fs.readFileSync(file, 'utf8')).apiKeysByVendor?.apimart } catch { /* no raw settings in evidence */ }
  if (!hasCredential(record))
    throw blockedError(directory, 'no-key')
}
export async function watchCredential({ directory, run, kill, timeoutMs = 9000, screen = screenEvidence() }) {
  if (!(timeoutMs > 0 && timeoutMs <= 9000)) throw Error('Invalid credential deadline')
  const marker = path.join(directory, 'credential-ready.json')
  fs.rmSync(marker, { force: true })
  const began = performance.now()
  let timer, watcher, rejectBlocked, settled = false
  const blocked = new Promise((_, reject) => { rejectBlocked = reject })
  const stop = () => { clearTimeout(timer); watcher?.close() }
  const fail = reason => {
    if (settled) return
    settled = true
    stop()
    const error = blockedError(directory, reason, screen)
    error.receipt.elapsedMs = Math.round(performance.now() - began)
    error.receipt.deadlineMs = timeoutMs
    try { kill() } catch { error.receipt.termination = 'unavailable' }
    fs.writeFileSync(path.join(directory, 'credential-precheck.json'), JSON.stringify(error.receipt, null, 2))
    rejectBlocked(error)
  }
  const inspect = () => {
    let result
    try { result = JSON.parse(fs.readFileSync(marker, 'utf8')) } catch { return }
    if (result.status === 'ready') {
      settled = true
      stop()
      fs.writeFileSync(path.join(directory, 'credential-precheck.json'), JSON.stringify({ status: 'ready', screen, at: new Date().toISOString() }))
    } else if (result.status === 'blocked') fail(result.reason === 'no-key' ? 'no-key' : screen.state === 'locked' ? 'locked-screen' : 'keychain-denied')
  }
  watcher = fs.watch(directory, inspect)
  timer = setTimeout(() => { inspect(); if (!settled) fail(screen.state === 'locked' ? 'locked-screen' : 'keychain-denied') }, timeoutMs)
  try {
    const task = Promise.resolve().then(() => run(marker)).then(value => {
      inspect()
      if (!settled) fail(screen.state === 'locked' ? 'locked-screen' : 'keychain-denied')
      return value
    }, error => { inspect(); throw error })
    return await Promise.race([blocked, task])
  } finally { stop(); fs.rmSync(marker, { force: true }) }
}
export function recordBlocked(directory, report, receipt, later) {
  report.result = 'blocked'
  report.credentialPrecheck = receipt
  report.stations ??= []
  report.deviations ??= []
  report.stations.push({ id: 'credential-precheck', status: 'blocked', reason: receipt.reason },
    ...later.map(id => ({ id, status: 'unreachable', reason: 'credential-precheck blocked' })))
  fs.writeFileSync(path.join(directory, 'stations.json'), JSON.stringify(report.stations, null, 2))
  fs.writeFileSync(path.join(directory, 'deviations.json'), JSON.stringify(report.deviations, null, 2))
}
