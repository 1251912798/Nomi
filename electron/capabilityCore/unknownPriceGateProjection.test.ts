// C-3（MCP 真宿主实测 10-16）：价格目录没报价时，Nomi 自己的生成确认卡不许印 ¥0。
// 挑战里的 reservationPreview.maximum 对「全未知」存的是占位 0（只说已知部分），
// 所以凡是把它投给界面或 MCP 客户端的地方，都必须走同一把判据：unknownJobCount>0 且已知部分为 0 ⇒ null。
import { beforeEach, describe, expect, it, vi } from 'vitest'

const decisions: Array<Record<string, unknown>> = []
let previewForChallenge: { currency: string; maximum: number; unknownJobCount?: number } = { currency: 'CNY', maximum: 0, unknownJobCount: 1 }

vi.mock('./rendererBridge', () => ({
  requestRendererDecision: vi.fn(async (_channel: string, payload: Record<string, unknown>) => {
    decisions.push(payload)
    return { confirmed: false }
  }),
  rendererTargetIdentity: () => ({ webContentsId: 1 }),
}))
vi.mock('./approvalReceiptRuntime', () => ({
  currentProjectRevision: () => 1,
  getApprovalReceiptAuthority: () => ({
    verifyChallenge: () => ({
      challengeId: 'c-1',
      expiresAt: '2026-10-17T00:00:00.000Z',
      display: { projectName: '短片', shotSummary: '一镜', model: 'm-x', referenceCount: 0 },
      reservationPreview: previewForChallenge,
    }),
  }),
}))
vi.mock('./projectSessionRuntime', () => ({ createProductionProjectSessionRuntime: () => ({}) }))
vi.mock('./canvasReadSurfaceRuntime', () => ({ canvasReadSurfaceRuntime: { getCommittedProjectSelection: () => null } }))

import { createDefaultAuthorities } from './appIntegrationAuthorities'
import { reservationMaximumForDisplay } from './approvalReceipt'

beforeEach(() => {
  decisions.length = 0
})

describe('未知价不许在 Nomi 确认卡变成 0', () => {
  it('全未知：发给渲染端的 maximumCost 是 null，不是占位 0', async () => {
    previewForChallenge = { currency: 'CNY', maximum: 0, unknownJobCount: 1 }
    await createDefaultAuthorities().confirmGenerationInNomi({ challengeToken: 't' })
    expect(decisions).toHaveLength(1)
    expect(decisions[0]!.maximumCost).toBeNull()
    expect(decisions[0]!.unknownShotCount).toBe(1)
  })

  it('已知价照常发出（含已知 0 元也是 0）', async () => {
    previewForChallenge = { currency: 'CNY', maximum: 5 }
    await createDefaultAuthorities().confirmGenerationInNomi({ challengeToken: 't' })
    expect(decisions[0]!.maximumCost).toBe(5)
    decisions.length = 0
    previewForChallenge = { currency: 'CNY', maximum: 0 }
    await createDefaultAuthorities().confirmGenerationInNomi({ challengeToken: 't' })
    expect(decisions[0]!.maximumCost).toBe(0)
  })

  it('类判据：部分已知保留已知小计，全未知才是 null', () => {
    expect(reservationMaximumForDisplay({ currency: 'CNY', maximum: 0, unknownJobCount: 2 })).toBeNull()
    expect(reservationMaximumForDisplay({ currency: 'CNY', maximum: 3, unknownJobCount: 1 })).toBe(3)
    expect(reservationMaximumForDisplay({ currency: 'CNY', maximum: 0 })).toBe(0)
  })
})
