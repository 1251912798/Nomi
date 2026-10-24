import { beforeEach, describe, expect, it, vi } from 'vitest'

// 拆解的钱的闸（用户 2026-10-18 拍板「短片不弹，长片才弹」）：一共不超过 30 次调用，点「拆解」那一下就是确认、不弹卡；
// 超过才弹报价卡。两种情况令牌都照铸、上限都等于报价的行数——跳过的只是问人那一步。

const renderer = vi.hoisted(() => ({ requestRendererDecision: vi.fn() }))
vi.mock('../capabilityCore/rendererBridge', () => renderer)
vi.mock('../projects/repository', () => ({ readProject: () => ({ name: '雨夜' }) }))
const grants = vi.hoisted(() => ({ mintSpendGrant: vi.fn(() => 'grant-1') }))
vi.mock('../spendGrant', () => grants)

import { authorizeDeconstructSpend } from './deconstructSpend'
import { DECONSTRUCT_ASK_ABOVE_CALLS } from '../shared/canvas/shotTable'

const vision = { vendorKey: 'apimart', modelKey: 'gemini-3.5-flash' }
const plan = (shots: number, transcribe = false) => ({
  projectId: 'p', nodeId: 'table-1', shotCount: shots, vision,
  transcribe: transcribe ? { vendorKey: 'local-speech', modelKey: 'whisper-large-v3-turbo' } : null,
  lines: [...Array.from({ length: shots }, () => ({ ...vision })), ...(transcribe ? [{ vendorKey: 'local-speech', modelKey: 'whisper-large-v3-turbo' }] : [])],
})

beforeEach(() => {
  renderer.requestRendererDecision.mockReset()
  grants.mintSpendGrant.mockClear()
})

describe('拆解：短片不弹卡，长片才弹', () => {
  it(`一共 ≤${DECONSTRUCT_ASK_ABOVE_CALLS} 次调用：不问人，直接铸一颗只覆盖这一批的令牌`, async () => {
    await expect(authorizeDeconstructSpend(plan(DECONSTRUCT_ASK_ABOVE_CALLS - 1, true))).resolves.toBe('grant-1')
    expect(renderer.requestRendererDecision).not.toHaveBeenCalled()
    expect(grants.mintSpendGrant).toHaveBeenCalledWith(expect.objectContaining({ nodeIds: ['table-1'], maxAttemptsPerNode: DECONSTRUCT_ASK_ABOVE_CALLS }))
  })

  it(`超过 ${DECONSTRUCT_ASK_ABOVE_CALLS} 次：弹报价卡，卡上写调用次数；点确认才铸令牌`, async () => {
    renderer.requestRendererDecision.mockResolvedValue({ confirmed: true })
    await expect(authorizeDeconstructSpend(plan(DECONSTRUCT_ASK_ABOVE_CALLS + 1))).resolves.toBe('grant-1')
    expect(renderer.requestRendererDecision).toHaveBeenCalledWith('spend.confirm', expect.objectContaining({ intent: 'deconstruct', callCount: DECONSTRUCT_ASK_ABOVE_CALLS + 1 }))
    expect(grants.mintSpendGrant).toHaveBeenCalledWith(expect.objectContaining({ maxAttemptsPerNode: DECONSTRUCT_ASK_ABOVE_CALLS + 1 }))
  })

  it('长片在卡上点取消：不铸令牌、一次都不发', async () => {
    renderer.requestRendererDecision.mockResolvedValue({ confirmed: false })
    await expect(authorizeDeconstructSpend(plan(DECONSTRUCT_ASK_ABOVE_CALLS + 5))).resolves.toBeNull()
    expect(grants.mintSpendGrant).not.toHaveBeenCalled()
  })
})
