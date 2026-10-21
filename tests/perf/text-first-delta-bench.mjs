#!/usr/bin/env node
// 文本任务「点下去 → 第一段字」的主进程时延（设计卡 docs/plan/2026-10-21-text-tasks-to-pi-ai.md ★7）。
//
// 量什么：主进程从接到一次文本任务，到交出第一段正文（`onDelta` 第一次被调）为止的耗时。
// 上游是本机假服务、立刻回第一段字，所以量到的全是**我们这一侧**的开销（模块装载、请求装配、SDK 解析）。
//   · warm：同一进程里第 2 次起的调用（用户连着点第二下）；
//   · cold：全新进程、运行时模块已在（应用启动后它就在）、文本执行器还没装过的第一次调用——
//     生产上 textStreamIpc 第一次收到请求时才 import 文本执行器（`loadTextTaskRunner`），这一下的装载算进时延。
// 量的是编译产物（dist-electron），不是 tsx 现编的源码：现编的转译时间不是用户会付的钱。先 `pnpm build:electron`。
//
// 用法：node tests/perf/text-first-delta-bench.mjs --mode warm|cold --runs 5 --label <label>
// 结果：tests/perf/results/text-first-delta-<label>.json（{ results: [{ samples: [{ responseMs }] }] }，给 perf:scenarios 读）。
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dist = path.join(repoRoot, 'dist-electron')
const argv = process.argv.slice(2)
const arg = (name, fallback) => { const index = argv.indexOf(`--${name}`); return index >= 0 ? argv[index + 1] : fallback }

/** 立刻回话的 OpenAI 兼容假上游：响应头 + 第一段字马上发，随后收尾。 */
function startUpstream() {
  const server = http.createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const chunk = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id: 'bench', object: 'chat.completion.chunk', created: 1, model: 'bench-model', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
      chunk({ role: 'assistant', content: '' })
      chunk({ content: '第一段' })
      chunk({}, 'stop')
      res.end('data: [DONE]\n\n')
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

/** 子进程：在一个进程里跑 `count` 次调用，按顺序返回每次「调用 → 第一段字」的毫秒数（第一次 = 冷）。 */
async function child(baseURL, count) {
  const require = createRequire(import.meta.url)
  require(path.join(dist, 'runtime.js'))
  const samples = []
  for (let index = 0; index < count; index += 1) {
    const started = performance.now()
    let first = null
    const { executeTextTask } = require(path.join(dist, 'textTaskRunner.js'))
    await executeTextTask({
      vendor: { key: 'bench', baseUrlHint: baseURL, providerKind: 'openai-compatible', authType: 'bearer' },
      model: { modelKey: 'bench-model', vendorKey: 'bench', kind: 'text' },
      apiKey: 'sk-bench', kind: 'chat', request: { kind: 'chat', prompt: '写一句话', extras: {} }, taskId: `bench-${index}`,
      onDelta: () => { if (first === null) first = performance.now() - started },
      abortSignal: new AbortController().signal,
    })
    if (first === null) throw new Error('no delta arrived')
    samples.push(Math.round(first * 10) / 10)
  }
  process.stdout.write(`${JSON.stringify(samples)}\n`)
}

async function main() {
  if (argv.includes('--child')) return child(arg('base-url'), Number(arg('count', '1')))
  if (!fs.existsSync(path.join(dist, 'textTaskRunner.js'))) throw new Error('dist-electron 不在：先跑 pnpm build:electron')
  const mode = arg('mode', 'warm')
  const runs = Number(arg('runs', '5'))
  const label = arg('label', `text-first-delta-${mode}`)
  const upstream = await startDetachedUpstream()
  try {
    const url = `http://127.0.0.1:${upstream.port}/v1`
    const spawnAt = (count) => {
      const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', '--base-url', url, '--count', String(count)],
        { cwd: repoRoot, encoding: 'utf8' })
      if (result.status !== 0) throw new Error(`child failed: ${result.stderr}`)
      return JSON.parse(result.stdout.trim().split('\n').at(-1))
    }
    const samples = mode === 'cold'
      ? Array.from({ length: runs }, () => spawnAt(1)[0])
      : spawnAt(runs + 1).slice(1)
    const out = path.join(repoRoot, 'tests/perf/results', `text-first-delta-${label}.json`)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, `${JSON.stringify({ mode, results: [{ samples: samples.map((responseMs) => ({ responseMs })) }] }, null, 2)}\n`)
    console.log(`${mode}: ${samples.join(', ')} ms → ${path.relative(repoRoot, out)}`)
  } finally {
    upstream.stop()
  }
}

/** 假上游放进一个常驻子进程（spawnSync 会挡住本进程的事件循环，上游不能和它同进程）。 */
async function startDetachedUpstream() {
  const { spawn } = await import('node:child_process')
  const proc = spawn(process.execPath, [fileURLToPath(import.meta.url), '--upstream'], { stdio: ['ignore', 'pipe', 'inherit'] })
  const port = await new Promise((resolve, reject) => {
    proc.stdout.once('data', (data) => resolve(Number(String(data).trim())))
    proc.once('exit', (code) => reject(new Error(`upstream exited ${code}`)))
  })
  return { port, stop: () => proc.kill() }
}

if (argv.includes('--upstream')) {
  const server = await startUpstream()
  process.stdout.write(`${server.address().port}\n`)
} else {
  await main()
}
