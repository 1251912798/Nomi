import { describe, expect, it, vi } from 'vitest'
import { probeWeeklyModels } from './model-liveness'
import { APIMART_VENDOR_SEED } from '../electron/catalog/apimartVendor'

describe('weekly vendor-declared liveness', () => {
  it('renders each model into the declared cheapest request and isolates failures without leaking secrets', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'Hi' } }] })))
      .mockResolvedValueOnce(new Response('echo SENTINEL', { status: 400 }))
    const receipts = await probeWeeklyModels({ vendors: [APIMART_VENDOR_SEED], modelIds: () => ['one', 'two'], apiKey: () => 'SENTINEL', previous: [], now: '2026-09-08T00:00:00Z', fetcher })
    expect(receipts.map((row) => row.ok)).toEqual([true, false])
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ model: 'one', max_tokens: 1, stream: false })
    expect(fetcher.mock.calls[0][0]).toBe('https://api.apimart.ai/api/v1/chat/completions')
    expect(JSON.stringify(receipts)).not.toContain('SENTINEL')
    await probeWeeklyModels({ vendors: [APIMART_VENDOR_SEED], modelIds: () => ['one', 'two'], apiKey: () => 'SENTINEL', previous: receipts, now: '2026-09-09T00:00:00Z', fetcher })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('missing credentials are explicit and do not establish a weekly freshness stamp', async () => {
    const fetcher = vi.fn()
    const receipts = await probeWeeklyModels({ vendors: [APIMART_VENDOR_SEED], modelIds: () => ['one'], apiKey: () => '', previous: [], now: '2026-09-08T00:00:00Z', fetcher })
    expect(receipts[0]).toMatchObject({ ok: false, reason: 'credential-missing' })
    expect(receipts[0].checkedAt).toBeUndefined()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
