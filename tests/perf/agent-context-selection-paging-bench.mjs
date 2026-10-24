#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

import { projectAgentContextSnapshot, readAgentContextSnapshotPage } from '../../electron/shared/agentContextSnapshot.ts'

const args = process.argv.slice(2)
const valueOf = (name, fallback) => {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}
const runs = Number(valueOf('--runs', '5'))
const label = valueOf('--label', 'agent-context-selection-paging')
const ids = Array.from({ length: 5000 }, (_, index) => `node-${index}`)
const handles = Array.from({ length: 5000 }, (_, index) => ({
  id: `canvas-node:${index}`,
  kind: 'canvasNode',
  targetId: `node-${index}`,
  revision: '8',
  locator: { type: 'canvasSelection', nodeIds: ids },
  display: { title: `镜头 ${index} ${'长标题'.repeat(8)}`, subtitle: 'video' },
  intentRole: 'subject',
}))
const snapshot = Object.freeze({ version: 1, handles: Object.freeze(handles) })

const samples = []
for (let run = 0; run < runs; run += 1) {
  const started = performance.now()
  const projection = projectAgentContextSnapshot(snapshot)
  const page = readAgentContextSnapshotPage(snapshot)
  const totalMs = performance.now() - started
  if (projection.total !== 5000 || projection.listed !== 0 || page.total !== 5000 || !page.nextCursor) throw new Error('agent context paging benchmark invariant failed')
  samples.push({ totalMs, projectionChars: projection.text.length, pageChars: JSON.stringify(page).length, pageRows: page.handles.length })
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const output = path.join(root, 'tests/perf/results', `agent-context-selection-paging-${label}.json`)
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify({ id: 'agent-context-selection-paging-5000', scale: '5000 handles', samples }, null, 2))
console.log(JSON.stringify({ id: 'agent-context-selection-paging-5000', output, samples }))
