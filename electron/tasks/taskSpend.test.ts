import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSpendGrantsForTests, mintSpendGrant } from '../spendGrant'
import { quoteSpendLine } from '../spendQuote'
import { requestRenderer } from '../capabilityCore/rendererBridge'
import { consumeTaskSpend } from './taskSpend'

vi.mock('../spendQuote', () => ({ quoteSpendLine: vi.fn() }))
vi.mock('../capabilityCore/rendererBridge', () => ({ requestRenderer: vi.fn() }))

beforeEach(() => { __resetSpendGrantsForTests(); vi.clearAllMocks() })
describe('shared paid vendor submission boundary', () => {
  it('rechecks the current catalog quote and stops a batch overrun when declined', async () => {
    const line = { vendorKey: 'relay', modelKey: 'image', amount: 1 }
    const grantId = mintSpendGrant({ nodeIds: ['first', 'second'], quote: { lines: [line, line], amount: 2 } })
    vi.mocked(quoteSpendLine).mockReturnValueOnce(line).mockReturnValueOnce({ ...line, amount: 2 })
    vi.mocked(requestRenderer).mockResolvedValue({ confirmed: false })
    await consumeTaskSpend({ ...line, grantId, nodeId: 'first' })
    expect(requestRenderer).not.toHaveBeenCalled()
    await expect(consumeTaskSpend({ ...line, grantId, nodeId: 'second' })).rejects.toThrow()
    expect(requestRenderer).toHaveBeenCalledWith('spend.confirm', expect.objectContaining({ quote: { ...line, amount: 2 } }), 65_000)
  })
  it('serializes concurrent requests against the same confirmed amount', async () => {
    const line = { vendorKey: 'relay', modelKey: 'image', amount: 1 }
    const grantId = mintSpendGrant({ nodeIds: ['first', 'second'], quote: { lines: [line], amount: 1 } })
    vi.mocked(quoteSpendLine).mockReturnValue(line)
    vi.mocked(requestRenderer).mockResolvedValue({ confirmed: false })
    const results = await Promise.allSettled(['first', 'second'].map(nodeId => consumeTaskSpend({ ...line, grantId, nodeId })))
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected'])
    expect(requestRenderer).toHaveBeenCalledOnce()
  })
  it('local ComfyUI keeps its existing authorization without a false money prompt', async () => {
    const grantId = mintSpendGrant({ nodeIds: ['local'] })
    await consumeTaskSpend({ grantId, nodeId: 'local', vendorKey: 'comfyui-local-studio', modelKey: 'workflow' })
    expect(requestRenderer).not.toHaveBeenCalled()
    expect(quoteSpendLine).not.toHaveBeenCalled()
  })
})
