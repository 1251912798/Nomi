import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopCanvasReadRuntime } from '../capabilityCore/canvasReadMainRuntime'
import type { DocumentReadPort, TimelineReadPort } from '../capabilityCore/capabilityExecutorRegistry'
import { createMainCapabilityExecutorRegistry } from '../capabilityCore/capabilityExecutorRegistry'
import { createCanvasReadSurfaceRegistry, createSurfaceOwnerAuthority } from '../capabilityCore/canvasReadSurfaceRegistry'
import { createProjectAgentProposalReceiptService } from '../capabilityCore/projectAgentProposalReceiptStore'
import { formatCanvasForAgent } from '../shared/agentCapabilities/canvasReadCompact'
import { projectCanvasRead } from '../shared/agentCapabilities/canvasRead'
import type { TimelineReadInput } from '../shared/agentCapabilities/timelineRead'
import { createDesktopLaneTools } from './laneDesktopTools'
import { SurfacePortWireError } from '../shared/surfacePortBinding'
import { openLane } from './laneHost.mjs'
import { createHttpFixture } from '../../tests/agent-runtime/httpFixture.mjs'

const desktopRuntime = vi.hoisted(() => ({ registry: undefined as unknown }))
vi.mock('../capabilityCore/canvasReadSurfaceRuntime', () => ({ canvasReadSurfaceRuntime: desktopRuntime }))
vi.mock('../productionRun/productionRunRuntime', () => ({ getProductionRunService: () => ({}) }))
const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

const canvasSource = { nodes: [{ id: 'shot-a', kind: 'image', title: 'Opening shot', prompt: 'Fixture prompt',
  position: { x: 0, y: 0 }, status: 'success', result: { id: 'result-a', url: 'https://private.invalid/image.png',
    raw: { credential: 'private-fixture-value' } } }], edges: [], groups: [], selectedNodeIds: ['shot-a'] }

async function fixture(toolName: string, args: Record<string, unknown>, stale = false,
  readDocument: DocumentReadPort['read'] = async ({ scope }) => ({ text: `${scope} fixture text` }), source: typeof canvasSource = canvasSource) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nomi-desktop-lane-reads-'))
  cleanups.push(() => fs.rm(root, { recursive: true, force: true }))
  const binding = { projectId: 'reads-fixture', immutableProjectUuid: '11111111-1111-4111-8111-111111111111', projectGeneration: 1 }
  const ownerAuthority = createSurfaceOwnerAuthority()
  const owner = ownerAuthority.capture({ contents: {}, frame: {}, webContentsId: 1, processId: 2, frameRoutingId: 3,
    origin: 'file://', isLive: () => true })
  const registry = createCanvasReadSurfaceRegistry({ ownerAuthority, resolveProjectIdentity: async () => ({ ...binding,
    canonicalRootPath: root, canonicalRootDigest: 'reads-fixture-root' }) })
  const suspension = registry.suspend(owner, { surfaceInstanceId: 'reads-surface' })
  const committed = await registry.commitCanvasRead(owner, { projectId: binding.projectId, suspension })
  const session = registry.openProjectSession(owner, committed.binding)
  desktopRuntime.registry = registry
  const canvasRead = vi.fn(async () => source)
  const documentRead = vi.fn<DocumentReadPort['read']>(readDocument)
  const timelineRead = vi.fn<TimelineReadPort['read']>(async ({ input: raw }) => {
    const input = raw as TimelineReadInput
    if (input.operation === 'inspect_timeline_range') return { ...input, revision: 'deadbeef', tracks: [], textClips: [] }
    return { operation: 'read_timeline', revision: 'deadbeef', fps: 30, scale: 1, playheadFrame: 0,
      durationFrames: 0, valid: true, tracks: [], textClips: [], transitions: [] }
  })
  const executor = createMainCapabilityExecutorRegistry({ resolveCanvasReadPort: async () => ({ read: canvasRead }),
    resolveDocumentReadPort: async () => ({ read: documentRead }), resolveTimelineReadPort: async () => ({ read: timelineRead }) })
  const surface = { executor, surfaceCapture: {},
    surfacePortRuntime: { createCanvasWritePort: () => ({}) } } as unknown as DesktopCanvasReadRuntime
  const assembly = createDesktopLaneTools({ session, binding, surface,
    receipts: createProjectAgentProposalReceiptService({ projectRoot: root, binding }),
    context: () => ({ documentId: 'fixture-document', approvalPolicy: { mode: 'request' } }),
    // 档位和工具审批读**同一份**快照（生产里两者都来自 `composer.approvalPolicy`）。
    approvalPolicy: () => ({ mode: 'request' }),
    generationFactory: () => undefined, onTaskCreated: async () => undefined,
    spendCard: { whenCardCloses: () => ({ closed: Promise.resolve(), dispose: () => undefined }) } })
  cleanups.push(async () => assembly.dispose())
  if (stale) registry.suspend(owner, { surfaceInstanceId: 'another-surface' })
  const http = await createHttpFixture([{ type: 'tool', calls: [{ id: 'read-call', name: toolName, arguments: args }] },
    { type: 'text', text: 'Read complete.' }])
  cleanups.push(http.close)
  const lane = await openLane({ fetch: globalThis.fetch, projectDir: root, model: { kind: 'openai-compatible', providerId: 'fixture', modelId: 'fixture',
    baseURL: http.baseURL, authType: 'api-key', apiKey: 'fixture' }, tools: assembly.tools, toolLifecycle: assembly.toolLifecycle,
    systemPrompt: 'Use the current verified surface.', approval: { hasUserInterface: true,
      policy: () => ({ mode: 'request' }) } })
  cleanups.push(() => lane.close())
  await lane.execute({ kind: 'prompt', text: 'Read the current surface.' })
  const result = lane.projection().parts.find(part => part.kind === 'tool-result')
  if (!result || result.kind !== 'tool-result') throw new Error('Missing actual lane tool result')
  return { result, lane, timelineRead, canvasRead, documentRead }
}

describe('desktop lane read adapter contracts', () => {
  it.each([
    ['read_timeline', {}],
    ['read_timeline', { startFrame: 12, endFrame: 24 }],
  ] as const)('%s binds alias operation once and returns a usable revision', async (toolName, args) => {
    const f = await fixture(toolName, args)
    expect(f.result).toMatchObject({ isError: false })
    const range = 'startFrame' in args ? args : undefined
    const operation = range ? 'inspect_timeline_range' : 'read_timeline'
    expect(JSON.parse(f.result.text)).toMatchObject({ operation, revision: 'deadbeef', ...(range ?? {}) })
    expect(f.timelineRead).toHaveBeenCalledExactlyOnceWith({ input: { operation, ...(range ?? {}) },
      target: { kind: 'timeline', clipIds: [] }, preconditions: {}, signal: expect.any(AbortSignal) })
    expect(f.lane.projection().pending).toBeUndefined()
  })

  it('returns the shared safe compact canvas projection without parsing presentation text as domain data', async () => {
    const f = await fixture('look_at_canvas', {})
    expect(f.result).toMatchObject({ isError: false, text: formatCanvasForAgent(projectCanvasRead(canvasSource)) })
    expect(f.canvasRead).toHaveBeenCalledOnce()
    expect(f.result.text).toContain('shot-a')
    expect(f.result.text).toContain('result-a')
    expect(f.result.text).not.toContain('private.invalid')
    expect(f.result.text).not.toContain('private-fixture-value')
  })

  // 2026-10-21：选 40 个节点，look_at_canvas 过去只列 ~31 个 id、没有总数、也不能翻页。模型照 #1263 的提示来补读，读到的还是同样的 31 个。
  // 这里走真 lane：模型传 selectedFrom 翻页，结果是同一份选区的下一段。
  describe('look_at_canvas pages a long selection through the real lane', () => {
    const many = (count: number) => ({
      nodes: Array.from({ length: count }, (_, index) => ({ id: `gen-v2-image-lw9x${(index + 100).toString(36)}-ab${(index + 10).toString(36)}`, kind: 'image', title: `Shot ${index + 1}`, prompt: '',
        position: { x: index, y: 0 }, status: 'idle' })), edges: [], groups: [],
      selectedNodeIds: Array.from({ length: count }, (_, index) => `gen-v2-image-lw9x${(index + 100).toString(36)}-ab${(index + 10).toString(36)}`),
    })

    it('says how many are selected and which selectedFrom reads the rest', async () => {
      const f = await fixture('look_at_canvas', {}, false, undefined, many(40) as never)
      expect(f.result).toMatchObject({ isError: false })
      expect(f.result.text).toMatch(/当前选中 40 个，本次列出第 1–\d+ 个，未列 \d+ 个/)
      expect(f.result.text).toMatch(/selectedFrom: \d+/)
    })

    it('reads the next page when the model passes selectedFrom, and the canvas is still read once', async () => {
      const first = await fixture('look_at_canvas', {}, false, undefined, many(40) as never)
      const next = Number(/selectedFrom: (\d+)/.exec(first.result.text)![1])
      const f = await fixture('look_at_canvas', { selectedFrom: next }, false, undefined, many(40) as never)
      expect(f.result).toMatchObject({ isError: false })
      expect(f.result.text).toContain(`本次列出第 ${next + 1}–40 个`)
      expect(f.result.text).not.toContain('selectedFrom:')
      expect(f.canvasRead).toHaveBeenCalledOnce()
    })

    it('refuses a negative or fractional page before any domain read', async () => {
      for (const selectedFrom of [-1, 1.5]) {
        const f = await fixture('look_at_canvas', { selectedFrom }, false, undefined, many(40) as never)
        expect(f.result).toMatchObject({ isError: true })
        expect(f.canvasRead).not.toHaveBeenCalled()
      }
    })
  })

  it.each([['read_script', 'full'], ['read_script', 'selection']] as const)(
    '%s keeps the verified document scope with its no-argument alias', async (toolName, scope) => {
      const f = await fixture(toolName, { scope })
      expect(f.result).toMatchObject({ isError: false, text: `${scope} fixture text` })
      expect(f.documentRead).toHaveBeenCalledExactlyOnceWith({ scope, signal: expect.any(AbortSignal) })
    })

  it.each(['read_timeline', 'look_at_canvas', 'read_script'])(
    '%s refuses a rotated surface before domain execution', async toolName => {
      const f = await fixture(toolName, toolName === 'read_script' ? { scope: 'full' } : {}, true)
      expect(f.result).toMatchObject({ isError: true })
      expect(f.timelineRead).not.toHaveBeenCalled()
      expect(f.canvasRead).not.toHaveBeenCalled()
      expect(f.documentRead).not.toHaveBeenCalled()
    })

  // NF-1001-0001（应用内反馈 NF-1001-0001）：用户不在创作页，模型按「这个」去读文稿选区。
  // 失败必须带着「没有位置」这个码到达模型和面板，且下一步是读整篇 / 读当前页，而不是一句泛泛的「做不了」。
  it('read_script selection off the creation page fails as document_position_unavailable with a next step the model can take', async () => {
    const f = await fixture('read_script', { scope: 'selection' }, false, async () => { throw new SurfacePortWireError('document_position_unavailable') })
    expect(f.result).toMatchObject({ isError: true })
    expect(f.result.failure?.code).toBe('document_position_unavailable')
    expect(f.result.text).toContain('read_script without scope')
    expect(f.result.text).not.toContain('(capability_unsupported)')
  })
})
