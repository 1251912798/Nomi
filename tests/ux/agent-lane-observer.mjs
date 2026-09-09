// Read only the JSONL files produced by the app in an isolated walk project.
// Never open a second SDK session or reconstruct a retired Host snapshot.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

export function readLaneTranscripts(projectRoot) {
  const root = path.join(projectRoot, '.nomi', 'agent-sessions')
  if (!fs.existsSync(root)) return []
  const sessions = []
  for (const directory of fs.readdirSync(root, { withFileTypes: true })) {
    if (!directory.isDirectory() || directory.isSymbolicLink()) continue
    const folder = path.join(root, directory.name)
    for (const file of fs.readdirSync(folder, { withFileTypes: true })) {
      if (!file.isFile() || file.isSymbolicLink() || !file.name.endsWith('.jsonl')) continue
      const filePath = path.join(folder, file.name)
      const bytes = fs.readFileSync(filePath, 'utf8')
      // A writer may currently be appending a transaction. Only complete JSONL
      // records are committed observations; the full bytes remain available.
      const lines = bytes.slice(0, bytes.lastIndexOf('\n')).split('\n')
      if (!lines[0]) continue
      const header = JSON.parse(lines[0])
      assert.equal(header.kind, 'header', 'The app must write the current pi JSONL header')
      assert.equal(header.v, 4)
      assert.equal(header.storageVersion, 1)
      assert.equal(typeof header.id, 'string')
      assert.ok(header.cwd.startsWith('/nomi-lane/'), 'Lane identity comes from the actual session header')
      const writes = lines.slice(1).filter(Boolean).flatMap((line) => {
        const transaction = JSON.parse(line)
        return Array.isArray(transaction) ? transaction : [transaction]
      })
      for (let index = 1; index < writes.length; index += 1) {
        assert.ok(writes[index].seq > writes[index - 1].seq, 'Persisted transactions keep their SDK sequence')
      }
      sessions.push({ laneName: header.cwd.slice('/nomi-lane/'.length), sessionId: header.id,
        path: filePath, bytes, header, writes, entries: writes.filter((write) => write.kind === 'entry') })
    }
  }
  return sessions
}

export function laneMessages(session) {
  return session.entries.filter((entry) => entry.type === 'message').map((entry) => entry.message)
}

export function laneMessageText(message) {
  return typeof message.content === 'string' ? message.content : (message.content ?? [])
    .filter((part) => part.type === 'text').map((part) => part.text).join('')
}

/** Full-file equality catches configuration, notes and branches as well as text. */
export function laneDiskSnapshot(projectRoot) {
  return Object.fromEntries(readLaneTranscripts(projectRoot).map((session) => [
    path.relative(projectRoot, session.path), session.bytes,
  ]))
}
