// 零花费量具：生产的 look_at_canvas 文本投影，数「模型收到的文本里到底有几个选中节点的 id、有没有明说总数、
// 顺着提示翻页能不能读全」。修前修后各跑一次，对照同一份 N 档；这不是模型分数（模型分数由 App 走查负责）。
//
//   pnpm exec tsx docs/evidence/2026-10-22-look-at-canvas-selection-truncation/census.mts [--module <canvasReadCompact 路径>] [--out <file.json>]
//
// 修前那一列：把 origin/main 的 canvasReadCompact.ts 复制成同目录的临时文件，用 --module 指过去（见 README.md）。
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { projectCanvasRead } from '../../../electron/shared/agentCapabilities/canvasRead'

const COUNTS = [1, 31, 32, 40, 256]
const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined }
const compact = await import(resolve(arg('--module') ?? 'electron/shared/agentCapabilities/canvasReadCompact.ts')) as {
  formatCanvasForAgent: (result: unknown, options?: { selectedFrom?: number }) => string
}

const nodeId = (i: number) => `gen-v2-image-${(1_760_000_000_000 + i * 7919).toString(36)}-${(i + 1_679_616).toString(36).slice(0, 4)}`

/** 「当前选中」那一行。节点清单里每个节点也有 id，但那不是选区，不能算进来。 */
const selectionLineOf = (text: string) => text.split('\n').find((line) => line.startsWith('当前选中')) ?? ''

const rows = COUNTS.map((count) => {
  const nodes = Array.from({ length: count }, (_, i) => ({ id: nodeId(i), kind: 'image', title: `镜头标题${i + 1}`, prompt: '', position: { x: i, y: 0 } }))
  const result = projectCanvasRead({ nodes, edges: [], groups: [], selectedNodeIds: nodes.map((node) => node.id) })
  const text = compact.formatCanvasForAgent(result)
  const line = selectionLineOf(text)
  const idsInSelectionLine = nodes.filter((node) => line.includes(node.id)).length
  const statesTotal = line.includes(`当前选中 ${count} 个`)

  // 顺着提示翻页：每页读 selectedFrom = 已读个数，直到读全或推进不了。修前没有这个参数，第二页还是第一页，推进不了。
  const seen = new Set<string>()
  let from = 0
  let pages = 0
  while (seen.size < count && pages <= count) {
    pages += 1
    const pageLine = selectionLineOf(compact.formatCanvasForAgent(result, { selectedFrom: from }))
    const before = seen.size
    nodes.filter((node) => pageLine.includes(node.id)).forEach((node) => seen.add(node.id))
    if (seen.size === before) break
    from = seen.size
  }
  return {
    selected: count,
    idsInSelectionLine,
    statesTotal,
    silentlyMissing: count - idsInSelectionLine > 0 && !statesTotal ? count - idsInSelectionLine : 0,
    reachableByPaging: seen.size,
    pagesNeeded: seen.size === count ? pages : null,
    chars: text.length,
  }
})
console.log(JSON.stringify(rows, null, 2))
const out = arg('--out')
if (out) { await mkdir(dirname(out), { recursive: true }); await writeFile(out, `${JSON.stringify(rows, null, 2)}\n`) }
