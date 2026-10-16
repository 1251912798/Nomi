import { describe, expect, it } from 'vitest'
import { normalizeVolatileIds, recordingFetch, replayFetch, type RecordedExchange } from './replayFetch.mts'

const json = (body: string) => ({ method: 'POST', body } satisfies RequestInit)

async function record(requests: readonly string[], replies: readonly string[]): Promise<RecordedExchange[]> {
  const exchanges: RecordedExchange[] = []
  let n = 0
  const real: typeof globalThis.fetch = async () => new Response(replies[n++], { status: 200, headers: { 'content-type': 'text/event-stream' } })
  const fetch = recordingFetch(real, exchanges)
  for (const body of requests) await (await fetch('http://model.invalid/v1/chat/completions', json(body))).text()
  return exchanges
}

describe('agent-loop recording / replay', () => {
  it('treats per-run ids (proposal, canvas node) as positions, not content', () => {
    const a = 'Applied (changeId canvas:v1:prop_570dfb60-2). 3D-BOX node gen-v2-director-mvb68gaz-mfw3, again gen-v2-director-mvb68gaz-mfw3'
    const b = 'Applied (changeId canvas:v1:prop_cb900038-a). 3D-BOX node gen-v2-director-mvb68t98-r07g, again gen-v2-director-mvb68t98-r07g'
    expect(normalizeVolatileIds(a)).toBe(normalizeVolatileIds(b))
    expect(normalizeVolatileIds(a)).not.toBe(normalizeVolatileIds(a.replace('again', 'once more')))
  })

  it('replays the recorded replies in order and points recorded ids at the ids of this run', async () => {
    const recorded = await record(
      ['{"messages":[]}', '{"messages":["node gen-v2-director-old1-aaaa"]}'],
      ['call stage_shot', 'patch gen-v2-director-old1-aaaa'],
    )
    const stale: string[] = []
    const used: RecordedExchange[] = []
    const fetch = replayFetch(recorded, (why) => stale.push(why), used)
    expect(await (await fetch('x', json('{"messages":[]}'))).text()).toBe('call stage_shot')
    expect(await (await fetch('x', json('{"messages":["node gen-v2-director-new2-bbbb"]}'))).text()).toBe('patch gen-v2-director-new2-bbbb')
    expect(stale).toEqual([])
    expect(used).toHaveLength(2)
  })

  it('reports a stale recording when the prompt or tool face changed, and when it runs out', async () => {
    const recorded = await record(['{"system":"v1"}'], ['hello'])
    const stale: string[] = []
    const fetch = replayFetch(recorded, (why) => stale.push(why), [])
    await fetch('x', json('{"system":"v2"}'))
    const exhausted = await fetch('x', json('{"system":"v2"}'))
    expect(exhausted.status).toBe(500)
    expect(stale).toEqual(['request #1 differs from the recording', 'request #2 has no recording'])
  })
})
