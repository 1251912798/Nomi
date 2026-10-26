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

  it('应用退出 drain：一次中止全部导入，并等它们连收尾都做完才返回', async () => {
    const registry = createImportRequestRegistry()
    const cleaned: number[] = []
    const startImport = (id: number) => registry.run(new FakeSender(id), undefined, async (signal) => {
      try {
        await new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('stopped')), { once: true }) })
      } finally {
        // 收尾本身也要时间（删半成品、删临时目录都是异步 I/O）。
        await new Promise((resolve) => setImmediate(resolve))
        cleaned.push(id)
      }
    })
    const pending = [startImport(3), startImport(4)].map((request) => request.catch((error: unknown) => error))
    expect(await registry.drain()).toBe(2)
    expect(cleaned.sort()).toEqual([3, 4])
    expect(registry.inflightCount()).toBe(0)
    for (const outcome of await Promise.all(pending)) expect(outcome).toBeInstanceOf(AssetImportCancelledError)
  })

  it('drain 之后不再接新的导入（退出开始后起的转码没人收）', async () => {
    const registry = createImportRequestRegistry()
    expect(await registry.drain()).toBe(0)
    let started = false
    await expect(registry.run(new FakeSender(5), undefined, async () => { started = true })).rejects.toBeInstanceOf(AssetImportCancelledError)
    expect(started).toBe(false)
  })
})
