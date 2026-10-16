// canvas-scale-bench 的诊断腿（--diag-out <目录>）：在被测那一段窗口里同时抓
//   · 渲染进程 CDP trace（devtools.timeline + 采样器，DevTools 能直接打开）与 CPU profile；
//   · 主进程 CPU profile（进程内 node:inspector，经 app.evaluate 起停）；
//   · 主进程 IPC 计时（ipcProbe.cjs：每个频道几次、多久；sendSync 堵渲染线程的那部分就在这里）；
//   · 画布 store 每次写改了什么（哪张卡、哪些字段 / meta 键）；
//   · 合成层（LayerTree：层数、按合成原因分组）与各进程内存（app.getAppMetrics，GPU 进程那一行）。
// 诊断会拖慢被测对象，所以诊断腿的数字不进基线；它回答的是「卡在哪」，不是「卡多久」。
// 不自写剖析器：全是 Chrome / Node 自带的 CDP 域，本模块只负责起停和落盘。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const IPC_PROBE_MODULE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ipcProbe.cjs')

// 不开 cc / viz / timeline.layers / timeline.paint：那几类每帧都带整棵层树和绘制快照，2 秒的手势能写出几百 MB
// （2026-10-16 实测把 C 盘写满）。合成层改由 LayerTree 域单独取（layerSnapshot），不靠 trace。
const TRACE_CATEGORIES = [
  'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
  'v8.execute', 'disabled-by-default-v8.cpu_profiler', 'blink.user_timing', 'toplevel', 'gpu',
].join(',')

async function readStream(cdp, handle) {
  let data = ''
  for (;;) {
    const chunk = await cdp.send('IO.read', { handle })
    data += chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString('utf8') : chunk.data
    if (chunk.eof) break
  }
  await cdp.send('IO.close', { handle }).catch(() => {})
  return data
}

async function layerSnapshot(cdp) {
  const layers = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 3000)
    cdp.once('LayerTree.layerTreeDidChange', (event) => { clearTimeout(timer); resolve(event.layers ?? null) })
    cdp.send('LayerTree.enable').catch(() => resolve(null))
  })
  if (!layers) { await cdp.send('LayerTree.disable').catch(() => {}); return null }
  const reasons = {}
  let drawn = 0
  let area = 0
  for (const layer of layers) {
    if (layer.drawsContent) drawn += 1
    area += Math.round((layer.width || 0) * (layer.height || 0))
    const reply = await cdp.send('LayerTree.compositingReasons', { layerId: layer.layerId }).catch(() => null)
    for (const reason of reply?.compositingReasonIds ?? reply?.compositingReasons ?? []) reasons[reason] = (reasons[reason] || 0) + 1
  }
  await cdp.send('LayerTree.disable').catch(() => {})
  return { layers: layers.length, drawsContent: drawn, layerAreaMpx: Math.round(area / 1e5) / 10, reasons: Object.fromEntries(Object.entries(reasons).sort((a, b) => b[1] - a[1])) }
}

async function processMemory(app) {
  return app.evaluate(({ app: electronApp }) => electronApp.getAppMetrics().map((metric) => ({
    type: metric.type, pid: metric.pid, workingSetMB: Math.round((metric.memory?.workingSetSize ?? 0) / 1024), privateMB: Math.round((metric.memory?.privateBytes ?? 0) / 1024),
  }))).catch(() => null)
}

const STORE_WATCH_SOURCE = `(() => {
  const store = window.__nomiCanvasStore
  if (!store) return 'no-store'
  window.__nomiStoreWrites = []
  let previous = store.getState()
  window.__nomiStoreUnwatch?.()
  window.__nomiStoreUnwatch = store.subscribe((next) => {
    const changedKeys = Object.keys(next).filter((key) => next[key] !== previous[key] && typeof next[key] !== 'function')
    const nodes = []
    if (next.nodes !== previous.nodes) {
      const before = new Map(previous.nodes.map((node) => [node.id, node]))
      for (const node of next.nodes) {
        const old = before.get(node.id)
        if (old === node) continue
        if (!old) { nodes.push({ id: node.id, added: true }); continue }
        const fields = Object.keys(node).filter((key) => node[key] !== old[key])
        const metaKeys = node.meta !== old.meta ? Object.keys({ ...(old.meta || {}), ...(node.meta || {}) }).filter((key) => (node.meta || {})[key] !== (old.meta || {})[key]) : []
        nodes.push({ id: node.id, fields, metaKeys })
      }
    }
    window.__nomiStoreWrites.push({ t: Math.round(performance.now()), changedKeys, nodes: nodes.slice(0, 6), nodesChanged: nodes.length })
    previous = next
  })
  return 'watching'
})()`

/** 起：在被测窗口开始前调用。返回 stop()，在窗口结束后调用，落盘并返回摘要。 */
export async function startDiagnostics({ page, app, cdp, outDir, label }) {
  fs.mkdirSync(outDir, { recursive: true })
  const memoryBefore = await processMemory(app)
  const layersBefore = await layerSnapshot(cdp)
  await page.evaluate(STORE_WATCH_SOURCE).catch(() => null)
  await app.evaluate(() => globalThis.__nomiIpcProbe?.arm()).catch(() => null)
  await app.evaluate(async () => {
    const inspector = process.mainModule.require('node:inspector')
    const session = new inspector.Session()
    session.connect()
    const post = (method, params) => new Promise((resolve, reject) => session.post(method, params, (error, result) => (error ? reject(error) : resolve(result))))
    await post('Profiler.enable')
    await post('Profiler.setSamplingInterval', { interval: 250 })
    await post('Profiler.start')
    globalThis.__nomiMainProfiler = { session, post }
  }).catch((error) => console.log(`    [diag] 主进程 profiler 没起来：${error.message}`))
  await cdp.send('Profiler.enable').catch(() => {})
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 }).catch(() => {})
  await cdp.send('Tracing.start', { categories: TRACE_CATEGORIES, transferMode: 'ReturnAsStream' }).catch((error) => console.log(`    [diag] trace 没起来：${error.message}`))
  await cdp.send('Profiler.start').catch(() => {})
  return async function stopDiagnostics() {
    const rendererProfile = await cdp.send('Profiler.stop').catch(() => null)
    const traceDone = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve))
    await cdp.send('Tracing.end').catch(() => {})
    const complete = await Promise.race([traceDone, new Promise((resolve) => setTimeout(() => resolve(null), 30_000))])
    const trace = complete?.stream ? await readStream(cdp, complete.stream) : null
    const mainProfile = await app.evaluate(async () => {
      const profiler = globalThis.__nomiMainProfiler
      if (!profiler) return null
      const { profile } = await profiler.post('Profiler.stop')
      profiler.session.disconnect()
      globalThis.__nomiMainProfiler = null
      return JSON.stringify(profile)
    }).catch(() => null)
    const ipc = await app.evaluate(() => globalThis.__nomiIpcProbe?.take() ?? null).catch(() => null)
    const storeWrites = await page.evaluate(() => { window.__nomiStoreUnwatch?.(); return window.__nomiStoreWrites ?? null }).catch(() => null)
    const layersAfter = await layerSnapshot(cdp)
    const memoryAfter = await processMemory(app)
    const base = path.join(outDir, label)
    if (trace) fs.writeFileSync(`${base}.trace.json`, trace)
    if (rendererProfile?.profile) fs.writeFileSync(`${base}.renderer.cpuprofile`, JSON.stringify(rendererProfile.profile))
    if (mainProfile) fs.writeFileSync(`${base}.main.cpuprofile`, mainProfile)
    const summary = { label, ipc, storeWrites, layersBefore, layersAfter, memoryBefore, memoryAfter }
    fs.writeFileSync(`${base}.diag.json`, JSON.stringify(summary, null, 2))
    return summary
  }
}
