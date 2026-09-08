// 旧运行核的端口。**阶段 4 的切换 PR 会连着 `electron/harness/runtime/` 整个目录删掉它。**
//
// 所以这里只剩两批东西：
//   ① 上面的 re-export——`NomiModelConfig` 与那八个传输契约已经搬到
//      `electron/shared/agentLane/laneModelConfig.ts` 与
//      `electron/shared/agentCapabilities/transportContracts.ts`，因为它们的消费者
//      （capabilityCore / projectAgentHost / skills / agentLane）全都活过切换。
//      本文件对它们**只 re-export、不再定义**，好让本目录里的旧代码一行都不用改（P1）。
//   ② 下面的 `RuntimeTurn*` / `RuntimeSnapshot*`——这批是「旧运行核一轮怎么跑」的形状，
//      依赖 `harness/context/promptPipe`，且**没有一个消费者活过切换 PR**
//      （全在 `harness/`、`ai/agentChatV2*` 与旧的 `tests/agent-runtime/` 里）。
//      把它们硬搬进 `electron/shared/` 只会造一条 shared → harness 的新反向边，
//      比留在这里随目录一起死更糟。
import type { CompiledPrompt, PromptCacheTelemetry } from '../context/promptPipe'
import type {
  RuntimeActivityEvent, RuntimeErrorFacts, RuntimeFinishReason, RuntimeToolCall,
  RuntimeToolCallRecord, RuntimeToolDecision, RuntimeToolDescriptor, RuntimeUsage,
} from '../../shared/agentCapabilities/transportContracts'
import type { NomiModelConfig } from '../../shared/agentLane/laneModelConfig'

export type { NomiModelConfig } from '../../shared/agentLane/laneModelConfig'
export type {
  RuntimeActivityEvent, RuntimeErrorFacts, RuntimeFinishReason, RuntimeToolCall,
  RuntimeToolCallRecord, RuntimeToolDecision, RuntimeToolDescriptor, RuntimeUsage,
} from '../../shared/agentCapabilities/transportContracts'

export interface RuntimeTurnRequest {
  cwd: string
  agentDir: string
  tempRoot: string
  model: NomiModelConfig
  systemPrompt: string
  user: {
    durableText: string
    currentContextText?: string
    images?: ReadonlyArray<{ mimeType: string; data: Uint8Array }>
    pdfs?: ReadonlyArray<{ fileName: string; data: Uint8Array }>
  }
  tools: readonly RuntimeToolDescriptor[]
  capability: { singleShot: true; maxSteps: 1 } | { singleShot?: false; maxSteps: 8 | 24 }
  /** Opaque, versioned working history; the caller owns thread binding/publication. */
  snapshot?: string
  compaction: { enabled: boolean; reserveTokens?: number; keepRecentTokens?: number }
  /** Hash-only prompt receipt; contents stay in the request's actual prompt slots. */
  promptReceipt?: Pick<CompiledPrompt, 'compileHash' | 'stablePrefixHash' | 'estimatedTokens' | 'byteLength' | 'warnings' | 'budgetWarning' | 'provenance' | 'taintedSourceRefs'>
}

export interface RuntimeTurnHooks {
  /** Synchronous activity delivery; do not await persistence inside SDK listeners. */
  emit(event: RuntimeActivityEvent): void
  /** The host already executes an approved action. The runtime never executes it again. */
  awaitToolConfirmation(call: RuntimeToolCall, signal: AbortSignal): Promise<RuntimeToolDecision>
  signal?: AbortSignal
  /** Main-process transport; never accepted from renderer DTOs. */
  fetch?: typeof globalThis.fetch
  /** Existing Nomi model-profile adjustment, not provider classification in this layer. */
  onPayload?(payload: Record<string, unknown>): Record<string, unknown> | void | Promise<Record<string, unknown> | void>
}

export interface RuntimeContextMetadata {
  normalRequests: number
  summaryRequests: number
  compactions: number
  retainedMessages: number
}

export interface RuntimeTurnResult {
  status: 'finished' | 'cancelled' | 'error'
  text: string
  finishReason: RuntimeFinishReason
  usage: RuntimeUsage
  toolCalls: RuntimeToolCallRecord[]
  /** Present only when the actual history could be exported after stable settlement. */
  snapshot?: string
  context?: RuntimeContextMetadata
  error?: RuntimeErrorFacts
  promptCache?: PromptCacheTelemetry
}

export type RunAgentTurn = (request: RuntimeTurnRequest, hooks: RuntimeTurnHooks) => Promise<RuntimeTurnResult>

/** Text reconstructed from an explicitly identified old UI thread, not SDK messages. */
export interface RuntimeLegacyTextTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface RuntimeSnapshotOptions {
  cwd: string
  tempRoot: string
}

export interface RuntimeSnapshotMetadata {
  retainedMessages: number
}

/** No sessions, model selection, tool execution or storage policy cross this codec seam. */
export interface RuntimeSnapshotCodec {
  importLegacy(turns: readonly RuntimeLegacyTextTurn[], options: RuntimeSnapshotOptions): Promise<string>
  inspect(snapshot: string, options: RuntimeSnapshotOptions): Promise<RuntimeSnapshotMetadata>
}
