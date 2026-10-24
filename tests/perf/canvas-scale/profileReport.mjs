#!/usr/bin/env node
// 诊断腿产物的读法（canvas-scale-bench --diag-out 落的 *.cpuprofile / *.trace.json）：
//   node tests/perf/canvas-scale/profileReport.mjs <x.cpuprofile> [--top 25]
//     → 按「源文件」和「源文件 · 函数」汇总自身耗时与包含耗时（经 source map 还原到 src/ / electron/ 的原文件；
//       渲染层要先用带 source map 的构建：npx vite build --mode production --sourcemap，运行时代码与正式构建一致，只多了 .map）。
//   node tests/perf/canvas-scale/profileReport.mjs <x.trace.json>
//     → 渲染主线程 / 合成线程 / GPU 线程上各类事件（脚本、样式、布局、绘制、合成、光栅、GC）的总耗时与最长一次。
// 只读产物、不起 App；source map 用 postcss 依赖里那份 source-map-js（不新增依赖）。
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { SourceMapConsumer } = createRequire(require.resolve('postcss'))('source-map-js')

const args = process.argv.slice(2)
const file = args.find((arg) => !arg.startsWith('--'))
const top = Number(args[args.indexOf('--top') + 1]) || 25
if (!file) { console.error('用法：node tests/perf/canvas-scale/profileReport.mjs <x.cpuprofile|x.trace.json> [--top 25]'); process.exit(2) }

const round = (value) => Math.round(value * 10) / 10

// ——— CPU profile ———————————————————————————————————————————————
const consumers = new Map()
function consumerFor(url) {
  if (consumers.has(url)) return consumers.get(url)
  let consumer = null
  try {
    const local = url.startsWith('file://') ? fileURLToPath(url) : null
    if (local && fs.existsSync(`${local}.map`)) consumer = new SourceMapConsumer(JSON.parse(fs.readFileSync(`${local}.map`, 'utf8')))
  } catch { consumer = null }
  consumers.set(url, consumer)
  return consumer
}
function originalOf(frame) {
  const url = frame.url || ''
  const consumer = url ? consumerFor(url) : null
  if (consumer) {
    const position = consumer.originalPositionFor({ line: frame.lineNumber + 1, column: Math.max(0, frame.columnNumber) })
    if (position.source) {
      const source = position.source.replace(/^.*?(?=(src|electron|node_modules)\/)/, '').replace(/^\.\.\//g, '')
      return { file: source, fn: position.name || frame.functionName || '(anonymous)' }
    }
  }
  if (!url) return { file: `(${frame.functionName || 'program'})`, fn: frame.functionName || '(program)' }
  return { file: url.replace(/^.*\/(dist(?:-electron)?\/)/, '$1').replace(/^node:/, 'node:'), fn: frame.functionName || '(anonymous)' }
}
function moduleOf(source) {
  const nm = /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/.exec(source)
  return nm ? `npm:${nm[1]}` : source
}

function reportProfile(profile) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]))
  const parent = new Map()
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id)
  const resolved = new Map(profile.nodes.map((node) => [node.id, originalOf(node.callFrame)]))
  const self = new Map()
  const selfFn = new Map()
  const inclusive = new Map()
  const inclusiveFn = new Map()
  const deltas = profile.timeDeltas ?? []
  let total = 0
  profile.samples.forEach((id, index) => {
    const ms = (deltas[index + 1] ?? deltas[index] ?? 0) / 1000
    total += ms
    const where = resolved.get(id)
    const file = moduleOf(where.file)
    self.set(file, (self.get(file) || 0) + ms)
    const fnKey = `${file} · ${where.fn}`
    selfFn.set(fnKey, (selfFn.get(fnKey) || 0) + ms)
    const seen = new Set()
    const seenFn = new Set()
    for (let cursor = id; cursor !== undefined; cursor = parent.get(cursor)) {
      const owner = moduleOf(resolved.get(cursor).file)
      const fnOwner = `${owner} · ${resolved.get(cursor).fn}`
      if (!seenFn.has(fnOwner)) { seenFn.add(fnOwner); inclusiveFn.set(fnOwner, (inclusiveFn.get(fnOwner) || 0) + ms) }
      if (seen.has(owner)) continue
      seen.add(owner)
      inclusive.set(owner, (inclusive.get(owner) || 0) + ms)
    }
    void byId
  })
  const table = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([key, ms]) => ({ key, ms: round(ms), share: round((ms / Math.max(total, 1e-9)) * 100) }))
  return { totalMs: round(total), selfByFile: table(self), selfByFunction: table(selfFn), inclusiveByFile: table(inclusive), inclusiveByFunction: table(inclusiveFn) }
}

// ——— trace ————————————————————————————————————————————————————
const EVENT_GROUPS = {
  script: ['FunctionCall', 'EvaluateScript', 'v8.compile', 'TimerFire', 'EventDispatch', 'FireAnimationFrame', 'RunMicrotasks', 'v8.callFunction'],
  style: ['UpdateLayoutTree', 'RecalculateStyles', 'ParseAuthorStyleSheet'],
  layout: ['Layout', 'UpdateLayerTree', 'PrePaint'],
  paint: ['Paint', 'PaintImage', 'Decode Image', 'ImageDecodeTask', 'Decode LazyPixelRef'],
  composite: ['CompositeLayers', 'Commit', 'Layerize', 'ActivateLayerTree', 'DrawFrame'],
  raster: ['RasterTask', 'GPUTask', 'Rasterize'],
  gc: ['MinorGC', 'MajorGC', 'V8.GC_SCAVENGER', 'V8.GC_MARK_COMPACTOR', 'BlinkGC.AtomicPhase'],
}
function reportTrace(events) {
  const threadNames = new Map()
  for (const event of events) if (event.ph === 'M' && event.name === 'thread_name') threadNames.set(`${event.pid}:${event.tid}`, event.args?.name)
  const groups = {}
  const longTasks = []
  for (const event of events) {
    if (event.ph !== 'X' || typeof event.dur !== 'number') continue
    const thread = threadNames.get(`${event.pid}:${event.tid}`) || 'unknown'
    const group = Object.entries(EVENT_GROUPS).find(([, names]) => names.includes(event.name))?.[0]
    if (thread === 'CrRendererMain' && event.name === 'RunTask' && event.dur > 50_000) longTasks.push(round(event.dur / 1000))
    if (!group) continue
    const key = `${thread} · ${group}`
    const entry = groups[key] || { ms: 0, count: 0, maxMs: 0 }
    entry.ms += event.dur / 1000
    entry.count += 1
    entry.maxMs = Math.max(entry.maxMs, event.dur / 1000)
    groups[key] = entry
  }
  const rows = Object.entries(groups).map(([key, entry]) => ({ key, ms: round(entry.ms), count: entry.count, maxMs: round(entry.maxMs) })).sort((a, b) => b.ms - a.ms)
  return { groups: rows.slice(0, top), longTasksMs: longTasks.sort((a, b) => b - a).slice(0, 20) }
}

const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
const report = file.endsWith('.cpuprofile') ? reportProfile(raw) : reportTrace(Array.isArray(raw) ? raw : raw.traceEvents ?? [])
const out = `${file.replace(/\.(cpuprofile|json)$/, '')}.report.json`
fs.writeFileSync(out, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 1).slice(0, 6000))
console.log(`\n→ ${path.relative(process.cwd(), out)}`)
