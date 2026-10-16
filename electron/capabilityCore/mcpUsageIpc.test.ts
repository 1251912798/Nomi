import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, BrowserWindow: { getAllWindows: () => [] } }))

import { createTrailingThrottle } from './mcpUsageIpc'

describe('usage push throttle', () => {
  it('pushes the first change immediately and folds a burst into one trailing push', () => {
    vi.useFakeTimers()
    try {
      const send = vi.fn()
      const throttle = createTrailingThrottle(send, 1000)
      throttle.notify()
      expect(send).toHaveBeenCalledTimes(1)
      for (let i = 0; i < 50; i += 1) throttle.notify()
      expect(send).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(1000)
      expect(send).toHaveBeenCalledTimes(2)
      vi.advanceTimersByTime(5000)
      expect(send).toHaveBeenCalledTimes(2)
    } finally { vi.useRealTimers() }
  })

  it('sends nothing at all while nothing changes', () => {
    vi.useFakeTimers()
    try {
      const send = vi.fn()
      createTrailingThrottle(send, 1000)
      vi.advanceTimersByTime(60_000)
      expect(send).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })
})
