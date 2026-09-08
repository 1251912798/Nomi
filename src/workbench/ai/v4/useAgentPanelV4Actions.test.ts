import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentPanelV4Actions, type AgentPanelV4Actions } from './useAgentPanelV4Actions'
import type { AgentPanelV4Data } from './useAgentPanelV4Data'
import type { ProjectAgentCommittedProposalRecord } from '../../../../electron/shared/projectAgentProposalReceipt'
import type { LanePart } from '../../../../electron/shared/agentLane/laneContracts'
import { LANE_RECEIPT_AUTHORITY_NOTE } from '../../../../electron/shared/agentLane/laneReceiptAuthority'
import { buildAgentModelEntries } from '../../generationCanvas/agent/availableModels'
import type { ComposerAttachment } from '../composer/composerAttachmentTypes'

const fixture = vi.hoisted(() => {
  const state = {
    projectAgentDraft: '', projectAgentAttachments: [] as ComposerAttachment[],
    activeDocumentId: 'doc-1', workbenchDocuments: [{ id: 'doc-1', title: 'Current document' }],
    creationDocumentTools: null, persistRevision: 1, creationActiveSkill: null,
    projectAgentApprovalPolicy: { mode: 'safe-auto', spend: 'confirm' },
    setProjectAgentDraft(text: string) { state.projectAgentDraft = text },
    setProjectAgentAttachments(update: (current: ComposerAttachment[]) => ComposerAttachment[]) {
      state.projectAgentAttachments = update(state.projectAgentAttachments)
    },
    setProjectAgentApprovalPolicy: vi.fn(),
  }
  return { state, owner: { subscriptionId: 'workspace-a' } as object | null, say: vi.fn(), models: vi.fn(),
    record: null as ProjectAgentCommittedProposalRecord | null, undo: vi.fn(), projection: { lane: 'main', parts: [] as LanePart[] } }
})
vi.mock('../../generationCanvas/agent/availableModels', async importOriginal => ({
  ...await importOriginal<typeof import('../../generationCanvas/agent/availableModels')>(), listAvailableModelsForAgent: fixture.models,
}))
vi.mock('react-i18next', async importOriginal => ({
  ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('../lane/laneClient', () => ({ laneClient: { context: () => fixture.owner, say: fixture.say, projection: () => fixture.projection } }))
vi.mock('../../workbenchStore', () => ({ useWorkbenchStore: Object.assign(
  (selector: (state: typeof fixture.state) => unknown) => selector(fixture.state), { getState: () => fixture.state },
) }))
vi.mock('../../generationCanvas/store/generationCanvasStore', () => ({ useGenerationCanvasStore: {
  getState: () => ({ persistRevision: 1, nodes: [], selectedNodeIds: [] }),
} }))
vi.mock('../../generationCanvas/agent/proposalUndo', () => ({ getCommittedProposal: () => fixture.record, runProposalUndo: fixture.undo }))
vi.mock('../../generationCanvas/agent/canvasSystemPrompt', () => ({ buildStaticAgentSystemPrompt: () => 'generation domain prompt' }))

function mountActions() {
  let actions!: AgentPanelV4Actions
  function Consumer() {
    actions = useAgentPanelV4Actions('generation', { snapshot: { active: { lane: 'main' } } } as AgentPanelV4Data)
    return null
  }
  renderToStaticMarkup(React.createElement(Consumer))
  return actions
}
function deferred() {
  let resolve!: (result: { ok: true }) => void
  const promise = new Promise<{ ok: true }>(done => { resolve = done })
  return { promise, resolve }
}
beforeEach(() => {
  fixture.owner = { subscriptionId: 'workspace-a' }
  fixture.state.projectAgentDraft = 'keep this draft'
  fixture.state.projectAgentAttachments = []
  fixture.say.mockReset()
  fixture.models.mockReset().mockResolvedValue([])
  fixture.record = null
  fixture.projection = { lane: 'main', parts: [] }
  fixture.undo.mockReset().mockResolvedValue(undefined)
})

describe('composer sends commit local cleanup only after current admission', () => {
  it('captures the current catalog projection on every send', async () => {
    const entries = buildAgentModelEntries([{ value: 'MiniMax-H3', label: 'MiniMax H3', kind: 'video', vendor: 'apimart' }])
    expect(entries).toHaveLength(1)
    fixture.models.mockResolvedValueOnce(entries).mockResolvedValueOnce([])
    fixture.say.mockResolvedValue({ ok: true })
    const actions = mountActions()
    expect(await actions.send('first')).toBe(true)
    expect(fixture.say.mock.calls[0][2].availableModels).toEqual(entries)
    expect(await actions.send('second')).toBe(true)
    expect(fixture.say.mock.calls[1][2].availableModels).toEqual([])
    expect(fixture.models).toHaveBeenCalledTimes(2)
  })

  it('preserves the draft and sends nothing when catalog capture fails', async () => {
    fixture.models.mockRejectedValue(new Error('catalog unavailable'))
    expect(await mountActions().send('keep this draft')).toBe(false)
    expect(fixture.say).not.toHaveBeenCalled()
    expect(fixture.state.projectAgentDraft).toBe('keep this draft')
  })

  it.each(['negative-ack', 'exception'])('returns false and keeps the draft on %s', async kind => {
    if (kind === 'exception') fixture.say.mockRejectedValue(new Error('missing skill'))
    else fixture.say.mockResolvedValue({ ok: false, message: 'missing skill' })
    expect(await mountActions().send('keep this draft')).toBe(false)
    expect(fixture.state.projectAgentDraft).toBe('keep this draft')
  })

  it('retains a pending draft then returns true and clears it on ACK', async () => {
    const ack = deferred()
    fixture.say.mockReturnValue(ack.promise)
    const sent = mountActions().send('keep this draft')
    expect(fixture.state.projectAgentDraft).toBe('keep this draft')
    ack.resolve({ ok: true })
    expect(await sent).toBe(true)
    expect(fixture.state.projectAgentDraft).toBe('')
  })

  it('does not clear text the user edited while admission was pending', async () => {
    const ack = deferred()
    fixture.say.mockReturnValue(ack.promise)
    const sent = mountActions().send('keep this draft')
    fixture.state.projectAgentDraft = 'next unsent thought'
    ack.resolve({ ok: true })
    expect(await sent).toBe(true)
    expect(fixture.state.projectAgentDraft).toBe('next unsent thought')
  })

  it('does not acknowledge a late old-workspace send or clear the new workspace draft', async () => {
    const ack = deferred()
    fixture.say.mockReturnValue(ack.promise)
    const sent = mountActions().send('keep this draft')
    fixture.owner = { subscriptionId: 'workspace-b' }
    ack.resolve({ ok: true })
    expect(await sent).toBe(false)
    expect(fixture.state.projectAgentDraft).toBe('keep this draft')
  })

  it('returns false before sending empty text or uploading attachments', async () => {
    expect(await mountActions().send('  ')).toBe(false)
    fixture.state.projectAgentAttachments = [{ id: 'pending', status: 'uploading' } as ComposerAttachment]
    expect(await mountActions().send('keep this draft')).toBe(false)
    expect(fixture.say).not.toHaveBeenCalled()
    expect(fixture.state.projectAgentDraft).toBe('keep this draft')
  })

  it('sends an explicit interrupted-entry reference without changing the user instruction', async () => {
    fixture.say.mockResolvedValue({ ok: true })
    expect(await mountActions().send('继续', { continueFromEntryId: 'stopped-entry' })).toBe(true)
    expect(fixture.say).toHaveBeenCalledWith('继续', 'primary', expect.objectContaining({ continueFromEntryId: 'stopped-entry' }))
    fixture.say.mockClear()
    expect(await mountActions().send('继续')).toBe(true)
    expect(fixture.say.mock.calls[0][2]).not.toHaveProperty('continueFromEntryId')
  })
})


describe('exact receipt undo admission', () => {
  function ready() {
    fixture.record = { proposalId: 'receipt-1', hostApprovalId: 'approval-1', hostActionHash: 'a'.repeat(64),
      summary: 'Created', stepLabels: ['Created'], compensation: [{ kind: 'delete-nodes', nodeIds: ['n1'] }],
      watchNodes: [], reconciliationOk: true }
    fixture.projection.parts = [
      { kind: 'host-note', noteType: LANE_RECEIPT_AUTHORITY_NOTE, data: { receiptProposalId: 'receipt-1',
        approvalId: 'approval-1', actionHash: 'a'.repeat(64), toolCallId: 'call-1' }, sequence: 0, entrySeq: 1, contentIndex: 0 },
      { kind: 'tool-call', toolCallId: 'call-1', toolName: 'nomi_canvas_write', args: {}, running: false, sequence: 1, entrySeq: 2, contentIndex: 0 },
      { kind: 'tool-result', toolCallId: 'call-1', toolName: 'nomi_canvas_write', text: 'Created', isError: false, sequence: 2, entrySeq: 3, contentIndex: 0 },
    ]
    return mountActions()
  }
  it('hands the current exact record to the existing compensating transaction', () => {
    ready().undoTool('call-1')
    expect(fixture.undo).toHaveBeenCalledExactlyOnceWith(fixture.record)
  })
  it.each(['wrong-call', 'new-receipt', 'cleared', 'new-lane', 'new-workspace'])('cannot undo from stale %s', kind => {
    const actions = ready()
    if (kind === 'new-receipt') fixture.record = { ...fixture.record!, proposalId: 'receipt-2' }
    if (kind === 'cleared') fixture.record = null
    if (kind === 'new-lane') fixture.projection.lane = 'other'
    if (kind === 'new-workspace') fixture.owner = { subscriptionId: 'workspace-b' }
    actions.undoTool(kind === 'wrong-call' ? 'other-call' : 'call-1')
    expect(fixture.undo).not.toHaveBeenCalled()
  })
})
