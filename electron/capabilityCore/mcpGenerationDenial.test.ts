// C-4（MCP 真宿主实测 10-16）：用户在确认卡上点了「拒绝 / 忽略」，工具结果必须是一个明确的终态，
// 不能还写「请确认这次生成」——否则 Agent 分不清「用户拒绝了」和「还没确认」，会反复催问。
import { describe, expect, it, vi } from 'vitest'

import { createGenerationGateConfirmation, type GenerationGateChallengeProjection } from './mcpGateConfirmation'
import { handleSemanticGenerationGate } from './mcpSemanticGenerationFlow'
import { handleTrustDowngrade } from './mcpTrustDowngrade'

const challenge: GenerationGateChallengeProjection = {
  challengeId: 'challenge-1', model: 'fixture-model', costScope: 'single-shot', maximumCost: null, unknownShotCount: 1,
  currency: 'CNY', expiresAt: '2099-01-01T00:00:00.000Z', handoff: { contractHash: 'digest-1', clientAttestation: true },
}

function gate(options: {
  elicit?: { supported: boolean; confirmed?: boolean; action?: 'accept' | 'decline' | 'cancel' | 'timeout' }
  nomi?: boolean | { confirmed: boolean; declined?: boolean }
}) {
  return createGenerationGateConfirmation({
    transport: {
      isAppOpen: () => true,
      getAuthenticatedClient: () => (options.elicit ? 'codex' : null),
      ...(options.nomi === undefined ? {} : { confirmGenerationInNomi: vi.fn(async () => options.nomi as never) }),
    },
    clientSupportsElicitation: () => options.elicit !== undefined,
    elicitBooleanConfirm: vi.fn(async () => options.elicit ?? { supported: false }),
  }).requestGenerationConfirmation
}

describe('确认被拒绝是一个终态，且与「还没确认」可区分', () => {
  it('客户端表单点了拒绝 / 取消 → denial=declined；超时 → denial=timeout', async () => {
    expect(await gate({ elicit: { supported: true, confirmed: false, action: 'decline' } })(challenge)).toMatchObject({ confirmed: false, denial: 'declined' })
    expect(await gate({ elicit: { supported: true, confirmed: false, action: 'cancel' } })(challenge)).toMatchObject({ confirmed: false, denial: 'declined' })
    expect(await gate({ elicit: { supported: true, confirmed: false, action: 'timeout' } })(challenge)).toMatchObject({ confirmed: false, denial: 'timeout' })
  })

  it('Nomi 兜底卡点了「忽略」→ declined；卡根本没弹出来（渲染端不可用）→ 没有 denial', async () => {
    expect(await gate({ nomi: { confirmed: false, declined: true } })(challenge)).toMatchObject({ confirmed: false, denial: 'declined' })
    const unanswered = await gate({ nomi: { confirmed: false } })(challenge)
    expect(unanswered.confirmed).toBe(false)
    expect(unanswered.denial).toBeUndefined()
  })
})

describe('拒绝后的工具结果不再要求确认', () => {
  const baseDeps = (denial: 'declined' | 'timeout') => {
    const reply = vi.fn()
    return {
      reply,
      deps: {
        invoke: vi.fn(async () => challenge),
        requestConfirmation: vi.fn(async () => ({ challengeId: 'challenge-1', confirmed: false, surface: 'nomi' as const, nextAction: 'wait_for_reconciliation' as const, denial })),
        buildResult: vi.fn(),
        reply,
        locale: () => 'zh-CN' as const,
      },
    }
  }

  it('生成门：declined → nomiOutcome.denied 且 reason=declined，下一步是「停下等用户」，不再有 human_approval_required / confirm', async () => {
    const { deps, reply } = baseDeps('declined')
    await handleSemanticGenerationGate('call-1', 'nomi_operation_gate', { phase: 'request' }, { operationId: 'op-1' }, deps)
    const result = reply.mock.calls[0]![1] as { content: Array<{ text: string }>; structuredContent: { nomiOutcome: Record<string, unknown> } }
    expect(result.structuredContent.nomiOutcome).toMatchObject({ denied: true, applied: false, reason: 'declined', nextAction: 'stop' })
    expect(result.structuredContent.nomiOutcome.errorCode).not.toBe('human_approval_required')
    expect(result.content[0]!.text).not.toMatch(/请在当前客户端确认/)
    expect(result.content[0]!.text).toMatch(/拒绝/)
  })

  it('生成门：超时 → reason=timeout，下一步是「先问用户」', async () => {
    const { deps, reply } = baseDeps('timeout')
    await handleSemanticGenerationGate('call-2', 'nomi_operation_gate', { phase: 'request' }, { operationId: 'op-1' }, deps)
    const result = reply.mock.calls[0]![1] as { structuredContent: { nomiOutcome: Record<string, unknown> } }
    expect(result.structuredContent.nomiOutcome).toMatchObject({ denied: true, reason: 'timeout', nextAction: 'ask_user' })
  })

  it('同类入口：降到「不再逐镜问」被拒绝，同样是明确终态', async () => {
    const reply = vi.fn()
    await handleTrustDowngrade(
      { id: 'c', toolName: 'nomi_run_control', args: { action: 'set_trust', trustLevel: 'budget_only' }, built: { projectId: 'p', runId: 'r' }, routedMethod: 'production.control' },
      {
        invokeForRequest: vi.fn(async () => challenge),
        requestGenerationConfirmation: vi.fn(async () => ({ challengeId: 'challenge-1', confirmed: false, surface: 'client' as const, nextAction: 'wait_for_reconciliation' as const, denial: 'declined' as const })),
        reply,
        buildToolResultPayload: vi.fn(),
        locale: () => 'zh-CN',
      },
    )
    const result = reply.mock.calls[0]![1] as { structuredContent?: { nomiOutcome?: Record<string, unknown> } }
    expect(result.structuredContent?.nomiOutcome).toMatchObject({ denied: true, reason: 'declined', nextAction: 'stop' })
  })
})
