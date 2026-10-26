import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { AssetImportCancelledError, createImportRequestRegistry } from './importRequests'

class FakeSender extends EventEmitter {
  destroyed = false
  constructor(readonly id: number) { super() }
  isDestroyed(): boolean { return this.destroyed }
  destroy(): void { this.destroyed = true; this.emit('destroyed') }
}

describe('导入请求生命周期', () => {
  it('窗口销毁会中止同一个 signal，并以取消结束，不留在途请求', async () => {
    const registry = createImportRequestRegistry()
    const sender = new FakeSender(1)
    let signal: AbortSignal | undefined
    const pending = registry.run(sender, undefined, (requestSignal) => new Promise((_resolve, reject) => {
      signal = requestSignal
      requestSignal.addEventListener('abort', () => reject(new Error('stopped')), { once: true })
    }))
    sender.destroy()
    await expect(pending).rejects.toBeInstanceOf(AssetImportCancelledError)
    expect(signal?.aborted).toBe(true)
    expect(registry.inflightCount()).toBe(0)
  })

  it('项目绑定失效轮询会取消，取消不是普通失败', async () => {
    const registry = createImportRequestRegistry({ pollMs: 5 })
    const sender = new FakeSender(2)
    let current = true
    const pending = registry.run(sender, () => { if (!current) throw new Error('project_binding_stale') }, (signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('stopped')), { once: true })
    }))
    current = false
    await expect(pending).rejects.toBeInstanceOf(AssetImportCancelledError)
  })

  it('应用退出 drain 可一次中止全部导入', async () => {
    const registry = createImportRequestRegistry()
    const sender = new FakeSender(3)
    const pending = registry.run(sender, undefined, (signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('stopped')), { once: true })
    }))
    expect(registry.abortAll()).toBe(1)
    await expect(pending).rejects.toBeInstanceOf(AssetImportCancelledError)
    expect(registry.inflightCount()).toBe(0)
  })
})
