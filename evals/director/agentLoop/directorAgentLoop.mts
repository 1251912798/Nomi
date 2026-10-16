// 3D-BOX 门槛 ① 的量具：**Agent 在环**评测（方案 docs/plan/2026-10-04-director-3dbox-phase3.md §1 第 10 条 ①）。
//
// 和 `evals/director/run.ts` 的 s1 方案不同：那条是「规划器直连模型」，模型只看见一段规划提示词、只输出一份计划。
// 这里走的是用户真实用到的那条链——pi lane（`openLane`，真的循环、真的工具校验）+ 真的工具面（`createCanvasLaneTools`，
// 开关开时 `stage_shot` = `director.write`，参数先过模型面 schema 与 `prepareArguments`）+ 真的渲染端执行体
// （`applyProposalBatch` → `applyDirectorWrite`：编译、覆盖层、实测 cut、问题清单），模型读到的工具结果与产品里一字不差，
// 可以按问题清单自修几轮。最后一份落地的计划交给现有尺子（`adaptS1Plan` + `scoreCard`）打分。
//
// 和产品的差异（如实列出，不冒充）：
//   · 身份提示词只拼 `buildLanguageRule` + `NOMI_AGENT_IDENTITY`，没有项目记忆；
//   · 工具面只有画布那一族（look_at_canvas / stage_shot / arrange_canvas…），没有生成、分镜、任务那几族——
//     非导演的画布写被拒（领域失败，模型读得懂），出片环节不在本量具里；
//   · 预演渲染（离屏录制）不跑：结果里预演恒为「渲染中」，与产品里 Agent 刚交完计划那一刻一致。
//
// 模型端点三种（都只走 `OpenLaneOptions.fetch` 这一个口子，lane 本身一行不改）：
//   · synthetic-oracle：本机 HTTP 夹具，第一次请求回一次 stage_shot（题库 oracle 计划），第二次回一句话。零花费，
//     只证明量具这条链通、分数和 s1-oracle-plan 对得上，**不是模型分数**；
//   · record：真实 OpenAI 兼容端点（地址 / 模型 / 密钥只从进程环境读），每次请求的原始响应原样录下；
//   · replay：按录音逐条回放（零花费、可复现），请求体哈希对不上就判这张卡「录音过期」，不硬放。
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openLane } from '../../../electron/agentLane/laneHost.mjs'
import { createCanvasLaneTools } from '../../../electron/agentLane/laneCanvasTools.js'
import type { NomiModelConfig } from '../../../electron/agentLane/laneRuntimePort.js'
import { makeChangeId } from '../../../electron/shared/agentCapabilities/changeId.js'
import { directorWriteResultSchema, type DirectorWriteInput, type DirectorWriteResult } from '../../../electron/shared/agentCapabilities/directorWrite.js'
import { buildLanguageRule, NOMI_AGENT_IDENTITY } from '../../../electron/harness/context/agentContext.js'
import { applyProposalBatch } from '../../../src/workbench/generationCanvas/agent/proposalTxn'
import { captureCanvasReadResult } from '../../../src/workbench/generationCanvas/agent/canvasReadResultSeal'
import { readCanvasReadSource } from '../../../src/workbench/generationCanvas/agent/generationCanvasTools'
import { useGenerationCanvasStore } from '../../../src/workbench/generationCanvas/store/generationCanvasStore'
import type { DirectorPlan } from '../../../electron/shared/director/directorPlanSchema'
import type { DirectorCard } from '../cardSchema'
import { adaptS1Plan } from '../s1Adapter'
import { scoreCard, type CardScore } from '../scorer'

import { requestBodyText, type RecordedExchange } from './replayFetch.mts'
export { recordingFetch, replayFetch, type RecordedExchange } from './replayFetch.mts'

/** 一张卡的模型端点：怎么造 fetch、用哪个模型配置；`finish` 拿到这张卡全部往返（录音模式据此落盘）。 */
export type CardEndpoint = Readonly<{
  model: NomiModelConfig
  fetch: typeof globalThis.fetch
  finish: () => Promise<{ exchanges: readonly RecordedExchange[]; replayStale?: string }>
}>

export type StageShotCall = Readonly<{ input: DirectorWriteInput; result: DirectorWriteResult }>

export type AgentLoopCardResult = Readonly<{
  cardId: string
  /** 模型发出的 stage_shot 调用次数（含没过参数校验、根本没到执行体的那些）。 */
  stageShotAttempts: number
  /** 到达执行体的调用（过了模型面 schema 与参数整理）。 */
  stageShotCalls: readonly StageShotCall[]
  /** 第一次 stage_shot 就落地（参数合法、编译通过）。 */
  firstAttemptApplied: boolean
  /** 至少有一份计划落地 = 「计划合格」。 */
  planAccepted: boolean
  finalPlan: DirectorPlan | null
  modelRequests: number
  score: CardScore
  replayStale?: string
  error?: string
}>

function resetCanvas(): void {
  const state = useGenerationCanvasStore.getState()
  for (const node of [...state.nodes]) state.deleteNode(node.id)
}

/** 与产品渲染端执行体同一条映射（`canvasWriteTarget.ts` 的 director 分支）：领域结果 + 提议身份 → 契约结果。 */
async function writeDirector(input: DirectorWriteInput, toolCallId: string): Promise<DirectorWriteResult> {
  const outcome = await applyProposalBatch([{ toolCallId, toolName: input.operation, effectiveArgs: input as unknown as Record<string, unknown> }])
  if (outcome.status !== 'committed') throw new Error(`director write aborted: ${String((outcome as { reason?: unknown }).reason ?? outcome.status)}`)
  const domain = (outcome.results[0] ?? null) as Record<string, unknown> | null
  if (!domain) throw new Error('director write returned no result')
  return directorWriteResultSchema.parse(domain.applied === true
    ? { ...domain, proposalId: outcome.proposalId, changeId: makeChangeId('canvas', outcome.proposalId), operation: input.operation }
    : { ...domain, proposalId: outcome.proposalId, operation: input.operation })
}

/**
 * 从最后一次请求回传的整轮历史里，按顺序数出模型发出的每一次 stage_shot 与它的工具结果
 * （最后一次请求带着这一轮全部助手消息与工具结果）。成功回执的固定写法是「revision dplan-…」（`directorReceiptText`）。
 */
function stageShotHistory(lastRequestBody: string): { attempts: number; firstApplied: boolean } {
  if (!lastRequestBody) return { attempts: 0, firstApplied: false }
  try {
    type Message = { role?: string; content?: unknown; tool_call_id?: string; tool_calls?: Array<{ id?: string; function?: { name?: string } }> }
    const messages = (JSON.parse(lastRequestBody) as { messages?: Message[] }).messages ?? []
    const ids = messages.filter((message) => message.role === 'assistant').flatMap((message) => message.tool_calls ?? [])
      .filter((call) => call.function?.name === 'stage_shot').map((call) => call.id)
    const first = ids[0]
    const reply = first ? messages.find((message) => message.role === 'tool' && message.tool_call_id === first) : undefined
    const text = typeof reply?.content === 'string' ? reply.content : JSON.stringify(reply?.content ?? '')
    return { attempts: ids.length, firstApplied: /revision dplan-/.test(text) }
  } catch {
    return { attempts: 0, firstApplied: false }
  }
}

function errorScore(card: DirectorCard, reason: string): CardScore {
  return {
    cardId: card.id, tier: card.tier, status: 'adapter_error',
    scores: { L0: 0, L1: 0, L2: 0, L3: 0, L4: 0, P: null, L5: 'unverified' },
    total: 0, reasons: [reason],
    measurements: { fps: 30, duration: card.duration?.total ?? 0, frames: [], cuts: [] },
    correspondenceRate: 0,
  }
}

export async function runAgentLoopCard(card: DirectorCard, endpoint: CardEndpoint): Promise<AgentLoopCardResult> {
  resetCanvas()
  const bodies: string[] = []
  const fetch: typeof globalThis.fetch = (input, init) => {
    bodies.push(requestBodyText(init))
    return endpoint.fetch(input, init)
  }
  const projectDir = await mkdtemp(join(tmpdir(), 'nomi-director-agentloop-'))
  const calls: StageShotCall[] = []
  let sequence = 0
  let lane: Awaited<ReturnType<typeof openLane>> | undefined
  let error: string | undefined
  try {
    const tools = createCanvasLaneTools({
      read: async () => captureCanvasReadResult({ ...readCanvasReadSource(), selectedNodeIds: [] }),
      write: async () => { throw new Error('This evaluation host only builds 3D-BOX previews; other canvas edits are not available here.') },
      writeDirector: async (input) => {
        sequence += 1
        const result = await writeDirector(input, `agentloop-${card.id}-${sequence}`)
        calls.push({ input, result })
        return result
      },
    })
    lane = await openLane({
      fetch, projectDir, model: endpoint.model, tools,
      systemPrompt: [buildLanguageRule(), NOMI_AGENT_IDENTITY].filter(Boolean).join('\n\n'),
      systemPromptClosing: buildLanguageRule,
    })
    await lane.execute({ kind: 'prompt', text: card.prompt })
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  } finally {
    await lane?.close().catch(() => undefined)
    await rm(projectDir, { recursive: true, force: true }).catch(() => undefined)
  }
  const { replayStale } = await endpoint.finish()
  const history = stageShotHistory(bodies.at(-1) ?? '')
  const applied = calls.filter((call) => call.result.applied)
  const last = applied.at(-1)
  const finalPlan = last && last.result.applied ? (last.result.plan as DirectorPlan) : null
  let score: CardScore
  if (!finalPlan) score = errorScore(card, error ? `agent_loop_error: ${error}` : 'no_plan: the agent never landed a director plan')
  else {
    const adapted = adaptS1Plan(finalPlan)
    score = 'errors' in adapted ? errorScore(card, `compile_failed: ${adapted.errors.join('; ')}`)
      : scoreCard(card, adapted.project, adapted.actorMap, adapted.anchors, adapted.spatial)
  }
  return {
    cardId: card.id,
    stageShotAttempts: Math.max(history.attempts, calls.length),
    stageShotCalls: calls,
    firstAttemptApplied: history.attempts > 0 ? history.firstApplied : calls[0]?.result.applied === true,
    planAccepted: Boolean(finalPlan),
    finalPlan,
    modelRequests: bodies.length,
    score,
    ...(replayStale ? { replayStale } : {}),
    ...(error ? { error } : {}),
  }
}

export type AgentLoopSummary = Readonly<{
  cards: number
  averageTotal: number
  /** 计划合格率：至少一份计划落地的卡占比（门槛 ① 写的 ≥ 95%）。 */
  planAcceptedRate: number
  /** 首发即合格率：第一次 stage_shot 就落地的卡占比（看提示词 / 工具说明写得清不清）。 */
  firstAttemptRate: number
  replayStale: number
}>

export function summarize(results: readonly AgentLoopCardResult[]): AgentLoopSummary {
  const n = Math.max(1, results.length)
  return {
    cards: results.length,
    averageTotal: results.reduce((sum, result) => sum + result.score.total, 0) / n,
    planAcceptedRate: results.filter((result) => result.planAccepted).length / n,
    firstAttemptRate: results.filter((result) => result.firstAttemptApplied).length / n,
    replayStale: results.filter((result) => result.replayStale).length,
  }
}
