import { afterEach, expect, it, vi } from 'vitest'
import { notifyBatchFinished } from './taskCenterSettings'
import * as bridge from '../../desktop/bridge'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('foreground keeps the existing in-app feedback', () => {
  vi.stubGlobal('document', { hasFocus: () => true })
  expect(notifyBatchFinished({ title: 'done', body: '' })).toBe('none')
})
it('passes event intent to the desktop owner without cached sound preferences', () => {
  vi.stubGlobal('document', { hasFocus: () => false })
  const show = vi.fn().mockResolvedValue({ ok: true })
  vi.spyOn(bridge, 'getDesktopBridge').mockReturnValue({ notifications: { show } } as unknown as ReturnType<typeof bridge.getDesktopBridge>)
  notifyBatchFinished({ title: 'failed', body: 'retry', event: 'decision' })
  expect(show).toHaveBeenCalledWith({ title: 'failed', body: 'retry', event: 'decision' })
})
it('missing desktop bridge never synthesizes a second sound', () => {
  vi.stubGlobal('document', { hasFocus: () => false })
  vi.spyOn(bridge, 'getDesktopBridge').mockReturnValue(null)
  expect(notifyBatchFinished({ title: 'done', body: '' })).toBe('none')
})
