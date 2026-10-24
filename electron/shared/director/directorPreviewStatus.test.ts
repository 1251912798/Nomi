import { describe, expect, it } from 'vitest'
import { DIRECTOR_PREVIEW_SPEND_BLOCK_REASONS, parseDirectorPreviewBlockReply } from './directorPreviewStatus'

// 主进程单镜 Run 准入只经这一个解析认渲染端的回包（appIntegration.ts）。以前那里把原因白名单过滤成
// rendering / failed：渲染端判出的新原因（过期）会被静默过滤成「不挡」，钱照样花出去。
describe('director preview block reply (main-process admission)', () => {
  it('passes every reason of the shared vocabulary through, including stale', () => {
    for (const reason of DIRECTOR_PREVIEW_SPEND_BLOCK_REASONS) expect(parseDirectorPreviewBlockReply({ blocks: [{ nodeId: 'n', reason }] })).toBe(reason)
    expect(parseDirectorPreviewBlockReply({ blocks: [{ nodeId: 'n', reason: 'not_attached' }] })).toBe('not_attached')
    expect(parseDirectorPreviewBlockReply({ blocks: [{ nodeId: 'n', reason: 'stale' }] })).toBe('stale')
  })

  it('a reason it does not know still blocks (fail-closed), it never turns into "go ahead"', () => {
    expect(parseDirectorPreviewBlockReply({ blocks: [{ nodeId: 'n', reason: 'asset_missing' }] })).toBe('unrecognized')
    expect(parseDirectorPreviewBlockReply({ blocks: [{ nodeId: 'n' }] })).toBe('unrecognized')
  })

  it('no block in the reply = nothing blocks this shot', () => {
    expect(parseDirectorPreviewBlockReply({ blocks: [] })).toBeNull()
    expect(parseDirectorPreviewBlockReply(null)).toBeNull()
  })
})
