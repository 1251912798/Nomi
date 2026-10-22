// look_at_canvas 选区翻页的真模型量具（R13.3）：画布上选中 N 个节点，让 Agent 用 look_at_canvas 读取并把选中的每个 id 都说出来，
// 数它说对几个、调了几次 look_at_canvas、有没有翻页。
//
// 走的是产品同一条链：生产的 `createCanvasLaneTools`（真 look_at_canvas 说明书 + 真排版）→ 真 `openLane`（pi 循环）→ 真实 OpenAI 兼容端点。
// 画布读口是假的（返回一份 N 个节点的 canonical 画布），其余一律生产代码。风格抄 evals/director/agentLoop/run.mts 的 record 模式。
//
//   零花费自检（脚本化模型，只证明量具接线，不是模型分数）：
//   pnpm exec tsx docs/evidence/2026-10-22-look-at-canvas-selection-truncation/probe.mts --selftest --count 40
//
//   真模型（会花文本额度）：
//   NOMI_EVAL_AGENT_SPEND_OK=1 NOMI_EVAL_AGENT_BASE_URL=… NOMI_EVAL_AGENT_MODEL=… NOMI_EVAL_AGENT_API_KEY=… \
//   pnpm exec tsx docs/evidence/2026-10-22-look-at-canvas-selection-truncation/probe.mts --count 40 --trials 3 --out <file.json>
//
// 密钥只从进程环境读，不写进输出。
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { openLane } from '../../../electron/agentLane/laneHost.mjs'
import { createCanvasLaneTools } from '../../../electron/agentLane/laneCanvasTools'
import { projectCanvasRead } from '../../../electron/shared/agentCapabilities/canvasRead'
import { buildLanguageRule, NOMI_AGENT_IDENTITY } from '../../../electron/harness/context/agentContext'
import { createHttpFixture } from '../../../tests/agent-runtime/httpFixture.mjs'
import type { NomiModelConfig } from '../../../electron/agentLane/laneRuntimePort'

const PROMPT = '我在画布上选中了一批节点。请调用 look_at_canvas 读取画布，然后把我当前选中的每个节点的 id 一行一个全部列出来，一个都不能少，不要补充别的。'

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined }
const need = (name: string) => { const v = process.env[name]?.trim(); if (!v) throw new Error(`needs ${name}`); return v }

const nodeIdOf = (i: number) => `gen-v2-image-${(1_760_000_000_000 + i * 7919).toString(36)}-${(i + 1_679_616).toString(36).slice(0, 4)}`

async function once(count: number, model: NomiModelConfig, fetchImpl: typeof globalThis.fetch) {
  const ids = Array.from({ length: count }, (_, i) => nodeIdOf(i))
  const canvas = projectCanvasRead({
    nodes: ids.map((id, i) => ({ id, kind: 'image', title: `镜头标题${i + 1}`, prompt: '', position: { x: i, y: 0 } })),
    edges: [], groups: [], selectedNodeIds: ids,
  })
  const tools = createCanvasLaneTools({
    read: async () => canvas,
    write: async () => { throw new Error('probe: read-only') },
  }).filter((tool) => tool.name === 'look_at_canvas')
  const projectDir = await mkdtemp(join(tmpdir(), 'nomi-lookat-probe-'))
  process.env.NOMI_SETTINGS_DIR = join(projectDir, 'settings')
  process.env.NOMI_PROJECTS_DIR = join(projectDir, 'projects')
  let answer = ''
  let error: string | undefined
  let calls: Array<Record<string, unknown>> = []
  const lane = await openLane({
    fetch: fetchImpl, projectDir, model, tools,
    systemPrompt: [buildLanguageRule(), NOMI_AGENT_IDENTITY].filter(Boolean).join('\n\n'),
    systemPromptClosing: buildLanguageRule,
    approval: { hasUserInterface: false, policy: () => ({ mode: 'request' }) },
  } as never)
  try {
    await lane.execute({ kind: 'prompt', text: PROMPT })
    const parts = lane.projection().parts as Array<{ kind: string; text?: string; toolName?: string; args?: unknown }>
    answer = parts.filter((part) => part.kind === 'assistant-text').map((part) => part.text ?? '').join('\n')
    calls = parts.filter((part) => part.kind === 'tool-call').map((part) => ({ name: part.toolName, arguments: part.args }))
    const failed = parts.filter((part) => part.kind === 'error').map((part) => part.text ?? '')
    if (!answer && failed.length) error = failed.join(' | ').slice(0, 500)
    if (!answer && !failed.length) error = `no assistant text; part kinds: ${parts.map((part) => part.kind).join(',')}`
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  } finally {
    await lane.close().catch(() => undefined)
    await rm(projectDir, { recursive: true, force: true }).catch(() => undefined)
  }
  const correct = ids.filter((id) => answer.includes(id)).length
  const pagedCalls = calls.filter((call) => JSON.stringify(call.arguments ?? {}).includes('selectedFrom')).length
  return { count, correct, lookAtCanvasCalls: calls.length, pagedCalls, calls, error, answer }
}

async function main() {
  const count = Number(arg('--count') ?? 40)
  const trials = Number(arg('--trials') ?? 3)
  const selftest = process.argv.includes('--selftest')
  let fetchImpl: typeof globalThis.fetch = globalThis.fetch
  let model: NomiModelConfig
  let closeFixture: (() => Promise<unknown>) | undefined
  if (selftest) {
    // 脚本化的"模型"：先读一页，再按提示翻第二页，最后把全部 id 抄出来。只用来证明量具接线、翻页参数过得了真校验。
    const ids = Array.from({ length: count }, (_, i) => nodeIdOf(i))
    const http = await createHttpFixture([
      { type: 'tool', calls: [{ id: 'read-1', name: 'look_at_canvas', arguments: {} }] },
      { type: 'tool', calls: [{ id: 'read-2', name: 'look_at_canvas', arguments: { selectedFrom: 32 } }] },
      { type: 'text', text: ids.join('\n') },
    ])
    closeFixture = http.close
    model = { kind: 'openai-compatible', providerId: 'nomi-eval', modelId: 'selftest', baseURL: http.baseURL, authType: 'api-key', apiKey: 'fixture-key' } as NomiModelConfig
  } else {
    if (process.env.NOMI_EVAL_AGENT_SPEND_OK !== '1') throw new Error('this probe calls a real model; set NOMI_EVAL_AGENT_SPEND_OK=1 to confirm')
    model = {
      kind: 'openai-compatible', providerId: 'nomi-eval', modelId: need('NOMI_EVAL_AGENT_MODEL'),
      baseURL: need('NOMI_EVAL_AGENT_BASE_URL'), authType: 'api-key', apiKey: need(arg('--key-env') ?? 'NOMI_EVAL_AGENT_API_KEY'),
    } as NomiModelConfig
  }
  const results = []
  for (let i = 0; i < (selftest ? 1 : trials); i += 1) results.push(await once(count, model, fetchImpl))
  await closeFixture?.()
  const summary = {
    mode: selftest ? 'selftest (scripted model, NOT a model score)' : 'real model', modelId: model.modelId, count, trials: results.length,
    correct: results.map((r) => r.correct), lookAtCanvasCalls: results.map((r) => r.lookAtCanvasCalls), pagedCalls: results.map((r) => r.pagedCalls),
    errors: results.filter((r) => r.error).length,
  }
  console.log(JSON.stringify(summary))
  const out = arg('--out')
  if (out) { await mkdir(dirname(out), { recursive: true }); await writeFile(out, JSON.stringify({ summary, results }, null, 2)) }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1) })
