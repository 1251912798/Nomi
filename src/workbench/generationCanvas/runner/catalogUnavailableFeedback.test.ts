import { describe, expect, it } from 'vitest'
import { resolveExecutableNodeFromCatalog } from './catalogTaskResolve'
import { classifyGenerationError } from '../../observability/classifyError'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

describe('unavailable catalog model feedback', () => {
  it.each(['供应商已断开', 'Provider disconnected', 'Fournisseur déconnecté'])('machine code survives translated wording: %s', message => {
    expect(classifyGenerationError(`NOMI_ERR::model-config:: ${message}`).kind).toBe('model-config')
  })
  it('does not classify an arbitrary message quoting a fragment of an old error', () => {
    expect(classifyGenerationError('日志引用：已断开，且该节点未记录模型。不是原始错误').kind).not.toBe('model-config')
  })
  it.each(['image', 'video'] as const)('%s unavailable source directs to model settings', async kind => {
    const node: GenerationCanvasNode = { id: 'test', title: 'Test', position: { x: 0, y: 0 }, kind, meta: { modelVendor: 'disconnected', modelKey: 'unavailable' } }
    const error = await resolveExecutableNodeFromCatalog(node, { listCatalogVendors: async () => [], listCatalogModels: async () => [] }).catch(e => e)
    expect(error).toBeInstanceOf(Error)
    expect(classifyGenerationError(error.message).kind).toBe('model-config')
  })
  it('missing recorded model directs to settings too', async () => {
    const node: GenerationCanvasNode = { id: 'test', title: 'Test', position: { x: 0, y: 0 }, kind: 'image', meta: { modelVendor: 'disconnected' } }
    const error = await resolveExecutableNodeFromCatalog(node, { listCatalogVendors: async () => [] }).catch(e => e)
    expect(classifyGenerationError(error.message).kind).toBe('model-config')
  })
  it.each([
    '当前没有已连接的供应商提供「Example」模型。请重新连接原供应商，或在该节点上改选一个已连接供应商的模型。',
    '供应商「example」已断开，且该节点未记录模型。请重新连接，或在该节点上改选已连接供应商的模型。',
  ])('persisted pre-signature failure keeps the same recovery: %s', message => {
    expect(classifyGenerationError(message).kind).toBe('model-config')
  })
})
