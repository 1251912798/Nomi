import { isComfyuiVendor } from '../catalog/types'
import { assertAndConsumeSpendGrant, assertAndConsumeQuotedSpend } from '../spendGrant'
import { quoteSpendLine } from '../spendQuote'
import { requestRenderer } from '../capabilityCore/rendererBridge'
import type { SpendQuoteInput } from '../shared/contracts/spendQuote'

/** Last paid-submit boundary, shared by mapped, custom, audio and fallback runners. */
export async function consumeTaskSpend(input: SpendQuoteInput & {
  grantId?: string
  nodeId?: string
  projectId?: string
}): Promise<void> {
  if (isComfyuiVendor({ key: input.vendorKey })) {
    assertAndConsumeSpendGrant(input.grantId, input.nodeId)
    return
  }
  const charge = quoteSpendLine(input)
  await assertAndConsumeQuotedSpend(input.grantId, input.nodeId, charge, async (quote) => {
    const reply = await requestRenderer('spend.confirm', {
      projectId: input.projectId,
      nodeId: input.nodeId,
      vendor: input.vendorKey,
      modelKey: input.modelKey,
      quote,
      intent: 'generation',
    }, 65_000) as { confirmed?: boolean } | null
    return reply?.confirmed === true
  })
}
