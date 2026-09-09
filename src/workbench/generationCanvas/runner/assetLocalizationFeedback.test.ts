import { expect, it, vi } from 'vitest'
import { withAssetLocalizationFeedback } from './assetLocalizationFeedback'

it.each([false, true])('scopes localization to the active project/node and detaches on rejection=%s', async (reject) => {
  let listener!: (event: { projectId: string; nodeId: string }) => void
  const detach = vi.fn()
  const subscribe = vi.fn((callback: typeof listener) => { listener = callback; return detach })
  const report = vi.fn()
  const run = async () => {
    listener({ projectId: 'other', nodeId: 'n1' })
    listener({ projectId: 'p1', nodeId: 'other' })
    expect(report).not.toHaveBeenCalled()
    listener({ projectId: 'p1', nodeId: 'n1' })
    expect(report).toHaveBeenCalledOnce()
    if (reject) throw new Error('import failed')
    return 'saved'
  }
  const pending = withAssetLocalizationFeedback({ projectId: 'p1', nodeId: 'n1', subscribe, report }, run)
  if (reject) await expect(pending).rejects.toThrow('import failed')
  else await expect(pending).resolves.toBe('saved')
  expect(detach).toHaveBeenCalledOnce()
})
