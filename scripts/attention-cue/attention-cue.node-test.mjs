import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { compose, scores } from './compose.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const official = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/standard-formats/claude-notification/input.json'), 'utf8'))
const settings = JSON.parse(readFileSync(path.join(root, '.claude/settings.json'), 'utf8'))
const registration = settings.hooks.Notification.find(entry => entry.hooks.some(hook => hook.command.includes('/attention-cue.sh')))

function fixture(t, platform = 'Darwin', players = ['afplay', 'osascript']) {
  const dir = mkdtempSync(path.join(tmpdir(), 'nomi attention '))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const bin = path.join(dir, 'bin')
  mkdirSync(bin)
  const log = path.join(dir, 'calls')
  const script = (name, body) => writeFileSync(path.join(bin, name), '#!/bin/bash\n' + body, { mode: 0o755 })
  script('uname', `echo '${platform}'\n`)
  symlinkSync('/bin/bash', path.join(bin, 'bash'))
  symlinkSync('/bin/sh', path.join(bin, 'sh'))
  symlinkSync(process.execPath, path.join(bin, 'node'))
  for (const name of players) script(name, `printf '%s\\n' '${name}' "$@" >> "$CUE_TEST_LOG"\n`)
  const env = { ...process.env, PATH: bin, CLAUDE_PROJECT_DIR: root, CUE_TEST_LOG: log }
  const calls = () => { try { return readFileSync(log, 'utf8') } catch { return '' } }
  return { dir, env, calls, script }
}

test('three committed WAVs are deterministic PCM16, bounded, audible and unclipped', () => {
  for (const [name, score] of Object.entries(scores)) {
    const wav = readFileSync(path.join(root, (name === "b" ? "assets/sound/nomi-attention.wav" : `scripts/attention-cue/candidates/${name}.wav`)))
    assert.deepEqual(wav, compose(score))
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
    assert.equal(wav.readUInt32LE(4), wav.length - 8)
    assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ')
    assert.equal(wav.readUInt16LE(20), 1)
    assert.equal(wav.readUInt16LE(22), 1)
    assert.equal(wav.readUInt32LE(24), 48000)
    assert.equal(wav.readUInt16LE(34), 16)
    assert.ok(wav.length <= 300000)
    const duration = wav.readUInt32LE(40) / wav.readUInt32LE(28)
    assert.ok(duration >= 1.5 && duration <= 2.5)
    let peak = 0
    for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)))
    assert.ok(peak > 3000 && peak < 32767)
    assert.equal(wav.readInt16LE(44), 0)
    assert.equal(wav.readInt16LE(wav.length - 2), 0)
  }
})

test('official Notification input reaches play.sh via actual registered command, safely', (t) => {
  const f = fixture(t)
  const reason = '要花钱 ¥33 "quote"\n$(touch /tmp/nomi-cue-should-not-run)'
  const run = spawnSync('/bin/sh', ['-c', registration.hooks[0].command], { env: f.env, input: JSON.stringify({ ...official, message: reason }), encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.equal(run.stdout, '')
  assert.match(f.calls(), /afplay\n.*\/assets\/sound\/nomi-attention.wav/)
  assert.ok(f.calls().includes(reason))
  assert.ok(f.calls().includes('Nomi 需要你'))
})

test('only human-attention types match; malformed/other events remain silent', (t) => {
  const f = fixture(t)
  const matcher = new RegExp(registration.matcher)
  for (const type of ['permission_prompt', 'idle_prompt', 'elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input']) assert.ok(matcher.test(type))
  for (const type of ['auth_success', 'agent_completed', 'elicitation_complete', 'elicitation_response']) {
    assert.equal(matcher.test(type), false)
    const run = spawnSync('/bin/sh', ['-c', registration.hooks[0].command], { env: f.env, input: JSON.stringify({ ...official, notification_type: type }), encoding: 'utf8' })
    assert.equal(run.status, 0)
  }
  for (const input of ['{', JSON.stringify({ ...official, hook_event_name: 'PostToolUse' })]) {
    assert.equal(spawnSync('/bin/sh', ['-c', registration.hooks[0].command], { env: f.env, input }).status, 0)
  }
  assert.equal(f.calls(), '')
})

test('missing afplay is silent, successful, and still sends the native notification', (t) => {
  const f = fixture(t, 'Darwin', ['osascript'])
  const run = spawnSync('/bin/bash', [path.join(root, 'scripts/play-attention-cue.sh'), '--reason', '需要决定'], { env: f.env, encoding: 'utf8' })
  assert.equal(run.status, 0)
  assert.equal(run.stderr, '')
  assert.equal(run.stdout, '')
  assert.match(f.calls(), /osascript/)
})

for (const [platform, players, expected] of [
  ['Linux', ['paplay', 'aplay'], 'paplay'],
  ['Linux', ['aplay'], 'aplay'],
  ['MINGW64_NT', ['powershell.exe'], 'powershell.exe'],
  ['Darwin', [], ''],
]) {
  test(`${platform} native player selection: ${expected || 'silent without players'}`, (t) => {
    const f = fixture(t, platform, players)
    const run = spawnSync('/bin/bash', [path.join(root, 'scripts/play-attention-cue.sh'), '--candidate', 'b'], { env: f.env, encoding: 'utf8' })
    assert.equal(run.status, 0)
    assert.equal(run.stderr, '')
    if (expected) assert.ok(f.calls().startsWith(expected + '\n'))
    else assert.equal(f.calls(), '')
  })
}
