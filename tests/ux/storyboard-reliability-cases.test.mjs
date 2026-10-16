import { describe, test, expect } from 'vitest'
import { toCatalogModelOptions } from '../../src/config/modelOptionMappers'
import { buildAgentModelEntries } from '../../src/workbench/generationCanvas/agent/availableModels'
import { argsFor, cases } from '../../docs/fixes/storyboard-reliability/cases.mjs'

// 真实目录投影（同 agent-runtime-fixture 的 projectAgentRuntimeModels 用的那两个函数）直接由 vitest 的转译缓存加载。
// 原先每家供应商各起一个 vite 开发服务（createServer 做依赖预构建 + 冷加载整条模块链，两次合计近 30s，贴着 30s 超时）。
describe('storyboard reliability uses the real catalog projection', () => {
  test('both tiers use canonical parameters for two supplier identities', () => {
    for (const vendorKey of ['apimart', 'kie']) {
      const entries = buildAgentModelEntries(toCatalogModelOptions([{
        vendorKey, modelKey: 'gpt-image-2', kind: 'image', enabled: true,
        labelZh: 'GPT Image 2', meta: { archetypeId: 'gpt-image-2' },
      }]))
      for (const [id, tier] of [[4, '1K'], [9, '2K']]) {
        const shot = argsFor(cases.find(c => c.id === id), entries).shots[0]
        expect(shot.params).toEqual({ resolution: tier })
        expect(shot.modelVendor).toBe(vendorKey)
        expect(shot.modeId).toBe('t2i')
      }
    }
  })
  test('missing catalog or unsupported tier fails before submitting a fabricated write', () => {
    expect(() => argsFor(cases[3], [])).toThrow()
    expect(() => argsFor(cases[8], [{ modelKey: 'gpt-image-2', defaultModeId: 't2i', modes: [{ modeId: 't2i', params: [] }] }])).toThrow()
  })
})
