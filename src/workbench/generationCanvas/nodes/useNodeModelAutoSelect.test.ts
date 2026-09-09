import { beforeEach, expect, it, vi } from 'vitest'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import type { ModelOption } from '../../../config/models'
import { useNodeModelAutoSelect } from './useNodeModelAutoSelect'

const mocks = vi.hoisted(() => ({ effects: [] as Array<() => unknown>, push: vi.fn(), nodes: [] as GenerationCanvasNode[] }))
vi.mock('react', () => ({ default: {
  useRef: (current: unknown) => ({ current }),
  useCallback: (callback: unknown) => callback,
  useSyncExternalStore: () => false,
  useEffect: (effect: () => unknown) => { mocks.effects.push(effect) },
} }))
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, values: unknown) => key + JSON.stringify(values) }),
}))
vi.mock('../store/generationCanvasStore', () => ({ useGenerationCanvasStore: { getState: () => ({ nodes: mocks.nodes, edges: [] }) } }))
vi.mock('../../../ui/toast', () => ({ useToastStore: { getState: () => ({ push: mocks.push }) } }))
vi.mock('../model/generationModelDefaults', () => ({
  generationModelDefaultsLoaded: () => false, getGenerationModelDefaults: () => ({}),
  loadGenerationModelDefaults: async () => {}, subscribeGenerationModelDefaults: () => () => {},
}))

beforeEach(() => { mocks.effects = []; mocks.push.mockReset() })
it('401 preserves the chosen vendor and offers a switch that requires a click', () => {
  const node = { id: 'image', kind: 'image', title: 'Image', position: { x: 0, y: 0 }, status: 'error', error: '401 Unauthorized — invalid api key',
    meta: { modelKey: 'gpt-image-2', modelAlias: 'gpt-image-2', modelVendor: 'apimart', vendor: 'apimart' },
  } as GenerationCanvasNode
  mocks.nodes = [node]
  const current = { value: 'gpt-image-2', modelKey: 'gpt-image-2', vendor: 'apimart', label: 'GPT Image 2' } as ModelOption
  const alternative = { ...current, vendor: 'kie' }
  const updateNode = vi.fn()
  useNodeModelAutoSelect({ node, modelOptions: [current, alternative], selectedModelValue: 'gpt-image-2',
    selectedModelOption: current, archetype: null, isGenerationNode: true, isImageLike: true, isVideoLike: false, updateNode })
  for (const effect of mocks.effects) effect()
  expect(updateNode).not.toHaveBeenCalled()
  expect(node.meta?.modelVendor).toBe('apimart')
  expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({ actionLabel: expect.stringContaining('kie'), onAction: expect.any(Function) }))
  mocks.push.mock.calls[0][0].onAction()
  expect(updateNode).toHaveBeenCalledWith('image', expect.objectContaining({ meta: expect.objectContaining({ modelVendor: 'kie' }) }))
})
