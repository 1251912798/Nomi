import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { copyTranscripts, saveReport } from './sweep-evidence.mjs'
test('legacy native entries export without reconstructing messages; checksum and provenance retained', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-native-'))
  try {
    const source = path.join(temp, 'profile/project/.nomi'), output = path.join(temp, 'out')
    fs.mkdirSync(source, { recursive: true })
    const data = { header: { type: 'session', version: 3, id: 'session' }, leafId: 'two', entries: [
      { id: 'one', parentId: null, type: 'message', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'native thought' }, { type: 'toolCall', id: 'call', name: 'read', arguments: { path: 'file' } }] } },
      { id: 'two', parentId: 'one', type: 'message', message: { role: 'toolResult', toolCallId: 'call', toolName: 'read', content: [{ type: 'text', text: 'result' }], isError: false } },
    ] }
    const snapshot = { format: 'nomi.pi-work-context', data, sha256: createHash('sha256').update(JSON.stringify(data)).digest('hex') }
    const file = path.join(source, 'agent-thread-context-v1.json')
    const write = () => fs.writeFileSync(file, JSON.stringify({ records: { thread: { source: 'native', snapshot: JSON.stringify(snapshot) } } }))
    write()
    const files = copyTranscripts(path.join(temp, 'profile'), output)
    const entries = fs.readFileSync(files[0], 'utf8').trim().split('\n').map(JSON.parse)
    assert.deepEqual(entries, [data.header, ...data.entries])
    assert.equal(JSON.parse(fs.readFileSync(`${files[0]}.source.json`)).leafId, 'two')
    const tools = JSON.parse(fs.readFileSync(path.join(output, 'tools.json')))
    assert.equal(tools[0].name, 'read'); assert.equal(tools[0].ok, true)
    snapshot.sha256 = 'invalid'; write()
    assert.throws(() => copyTranscripts(path.join(temp, 'profile'), output), /checksum/)
  } finally { fs.rmSync(temp, { recursive: true, force: true }) }
})
test('ledger lists every deviation and repaired failures separately', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-report-'))
  try {
    saveReport(temp, [{ id: 'case', surface: 'storyboard', costCny: 0, stations: [{ id: 'first' }, { id: 'later', surface: 'export', status: 'unreachable' }], deviations: [
      { station: 'first', surface: 'storyboard', phenomenon: 'a|b\nnext', layer: '契约', repaired: true, repairedBy: 'fixture' },
      { station: 'later', surface: 'export', phenomenon: 'blocked', layer: '测试装配', repaired: false },
    ] }], [{ id: 'future', status: 'needs-stage-4', reason: 'not reachable' }], 3)
    const report = fs.readFileSync(path.join(temp, 'report.md'), 'utf8')
    assert.match(report, /a\\\|b next/)
    assert.match(report, /case\/first：fixture/)
    assert.match(report, /\| storyboard \| 1 \| 1 \| 1 \| 1 \| 0 \|/)
    assert.match(report, /\| export \| 1 \| 0 \| 0 \| 1 \| 0 \|/)
    assert.match(report, /needs-stage-4/)
  } finally { fs.rmSync(temp, { recursive: true, force: true }) }
})
