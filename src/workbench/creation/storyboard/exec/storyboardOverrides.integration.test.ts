import { useWorkbenchStore } from '../../../workbenchStore'
import { resolveStoryboardOverride } from './storyboardOverrideActions'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGenerationCanvasStore } from '../../../generationCanvas/store/generationCanvasStore'
import { applyCanvasToolCall } from '../../../generationCanvas/agent/applyCanvasToolCall'
import { generateShotRow, materializeShotRow } from './storyboardRowActions'
import { effectiveShotValue } from '../shotRow/shotRowModel'
import type { PlanShot, StoryboardPlan } from '../../../generationCanvas/agent/storyboardPlan'

vi.mock('../../../generationCanvas/agent/availableModels', () => ({
  buildAgentModelEntries: () => [],
  listAvailableModelsForAgent: async () => [],
  resolveStoryboardImageDefault: async () => ({}),
  resolveStoryboardVideoDefault: async () => ({}),
}))
const submitted = vi.hoisted(() => ({ prompts: [] as string[] }))
vi.mock('../../../generationCanvas/runner/generationRunController', () => ({
  confirmAndRunNode: async (nodeId: string) => {
    submitted.prompts.push(useGenerationCanvasStore.getState().nodes.find(node => node.id === nodeId)?.prompt ?? '')
  },
  confirmAndRunNodeVariants: vi.fn(),
  regenerateNodeInPlace: vi.fn(),
}))
const shot: PlanShot = { index: 3, shotId: 's3', prompt: '傍晚', durationSec: 5, anchorIds: [] }
const plan: StoryboardPlan = { title: '故事', anchors: [], shots: [shot] }
const ctx = { documentId: 'doc', designId: 'design', plan }
function node() { return useGenerationCanvasStore.getState().nodes[0] }
beforeEach(() => {
  submitted.prompts = []
  useWorkbenchStore.getState().hydrateWorkbenchDocuments([{ id: 'doc', version: 1, title: '故事', contentJson: { type: 'doc', content: [] }, updatedAt: 1 }], 'doc')
  useWorkbenchStore.getState().hydrateStoryboardDesigns({ doc: [{ id: 'design', documentId: 'doc', title: plan.title, plan, committed: false, status: 'draft', sourceDocumentUpdatedAt: 1, createdAt: 1, updatedAt: 1 }] })
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [{ id: 'n3', kind: 'video', title: '第三镜', position: { x: 0, y: 0 }, prompt: '傍晚', meta: { shotId: 's3', storyboardDesignId: 'design' } }], edges: [], groups: [], selectedNodeIds: [] })
})
describe('plan truth and canvas overrides', () => {
  it('Agent edit then generate keeps night instead of silently restoring dusk', async () => {
    await applyCanvasToolCall('set_node_prompt', { nodeId: 'n3', prompt: '夜景' })
    expect(node().meta?.overriddenFields).toEqual(['prompt'])
    await generateShotRow(ctx, shot, null)
    expect(submitted.prompts).toEqual(['夜景'])
    expect(node().prompt).toBe('夜景')
    expect(effectiveShotValue(shot, node(), 'prompt')).toBe('夜景')
  })
  it('manual edits use the same boundary; variants and clamped duration do not override', () => {
    useGenerationCanvasStore.getState().updateNode('n3', { prompt: '夜景' })
    expect(node().meta?.overriddenFields).toEqual(['prompt'])
    useGenerationCanvasStore.getState().updateNode('n3', { meta: { ...node().meta, duration: 4 } })
    expect(node().meta?.overriddenFields).toEqual(['prompt'])
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [{ ...node(), id: 'variant', regeneratedFrom: 'n3', meta: { shotId: 's3', storyboardDesignId: 'design' } }], edges: [], groups: [], selectedNodeIds: [] })
    useGenerationCanvasStore.getState().updateNode('variant', { prompt: '晴天' })
    expect(node().meta?.overriddenFields).toBeUndefined()
  })
  it('an unmarked node is a projection even if its previous prompt differs', async () => {
    expect(effectiveShotValue(shot, node(), 'prompt')).toBe('傍晚')
    await materializeShotRow(ctx, { ...shot, prompt: '清晨' }, null)
    expect(node().prompt).toContain('清晨')
    expect(node().meta?.overriddenFields ?? []).toEqual([])
  })
})

it('plan edits project immediately except marked fields; discard is undoable and adopt clears one field', () => {
  const store = useWorkbenchStore.getState()
  store.setStoryboardPlan({ ...plan, shots: [{ ...shot, prompt: '清晨' }] }, 'doc', 'design')
  expect(node().prompt).toContain('清晨')
  useGenerationCanvasStore.getState().updateNode('n3', { prompt: '夜景' })
  store.setStoryboardPlan(plan, 'doc', 'design')
  expect(node().prompt).toBe('夜景')
  resolveStoryboardOverride('n3', 'prompt', 'discard')
  expect(node().prompt).toContain('傍晚')
  expect(node().meta?.overriddenFields).toEqual([])
  useGenerationCanvasStore.getState().undo()
  expect(node().prompt).toBe('夜景')
  expect(node().meta?.overriddenFields).toEqual(['prompt'])
  resolveStoryboardOverride('n3', 'prompt', 'adopt')
  expect(useWorkbenchStore.getState().storyboardDesignsByDocumentId.doc[0].plan.shots[0].prompt).toBe('夜景')
  expect(node().meta?.overriddenFields).toEqual([])
})
