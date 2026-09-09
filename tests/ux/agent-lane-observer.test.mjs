import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { laneDiskSnapshot, laneMessages, readLaneTranscripts } from './agent-lane-observer.mjs'

const folders = []
afterEach(() => { for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true }) })
function fixture(records) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-lane-observer-'))
  folders.push(root)
  const folder = path.join(root, '.nomi', 'agent-sessions', '--nomi-lane-main--')
  fs.mkdirSync(folder, { recursive: true })
  const file = path.join(folder, 'session.jsonl')
  fs.writeFileSync(file, [...records.map((record) => JSON.stringify(record)), ''].join('\n'))
  return { root, file }
}
const header = { v: 4, kind: 'header', storageVersion: 1, id: 'session-1', createdAt: 1, cwd: '/nomi-lane/main' }

test('observes committed SDK transactions without changing roles, entries, order or bytes', () => {
  const user = { kind: 'entry', type: 'message', seq: 1, id: 'user-1', message: { role: 'nomi.input', content: 'A real input' } }
  const note = { kind: 'entry', type: 'custom', customType: 'nomi.ui.task', seq: 2, data: { productionRunId: 'run-1' } }
  const reply = { kind: 'entry', type: 'message', seq: 4, id: 'assistant-1', message: { role: 'assistant', content: [{ type: 'text', text: 'Reply' }] } }
  const input = fixture([header, [user, note], { kind: 'value', seq: 3, op: 'set', namespace: 'lane', key: 'tip', value: 'user-1' }, reply])
  const before = fs.readFileSync(input.file, 'utf8')
  const [session] = readLaneTranscripts(input.root)
  expect(session).toMatchObject({ laneName: 'main', sessionId: 'session-1', bytes: before })
  expect(session.entries).toEqual([user, note, reply])
  expect(laneMessages(session)).toEqual([user.message, reply.message])
  expect(laneDiskSnapshot(input.root)).toEqual({ [path.relative(input.root, input.file)]: before })
  expect(fs.readFileSync(input.file, 'utf8')).toBe(before)
});

test('retains complete records when a live append has an incomplete final line', () => {
  const input = fixture([header])
  fs.appendFileSync(input.file, '{"kind":"entry"')
  expect(readLaneTranscripts(input.root)[0].entries).toEqual([])
  expect(readLaneTranscripts(input.root)[0].bytes).toContain('{"kind":"entry"')
});

test('rejects an old format and never treats a legacy Host file as lane evidence', () => {
  const input = fixture([{ type: 'session', version: 3, id: 'legacy' }])
  expect(() => readLaneTranscripts(input.root)).toThrow(/current pi JSONL header/)
  fs.rmSync(path.join(input.root, '.nomi', 'agent-sessions'), { recursive: true })
  fs.writeFileSync(path.join(input.root, '.nomi', 'agent-session.json'), '{"messages":[]}')
  expect(readLaneTranscripts(input.root)).toEqual([])
});
