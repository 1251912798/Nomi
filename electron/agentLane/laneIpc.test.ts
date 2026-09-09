import { describe, expect, it, vi } from 'vitest'
import { LANE_IPC_CHANNELS, type LaneWorkspaceHandle } from '../shared/agentLane/laneContracts'

const ipc = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>() }))
vi.mock('electron', () => ({ ipcMain: {
  handle: (channel: string, handler: (...args: unknown[]) => unknown) => ipc.handlers.set(channel, handler),
  removeHandler: (channel: string) => ipc.handlers.delete(channel),
} }))
vi.mock('../ipcSenderGuard', () => ({ assertTrustedSender: vi.fn() }))

import { registerAgentLaneIpc } from './laneIpc'

describe('desktop lane lifecycle', () => {
  it('opens and publishes history before the first command, then rebinds subscriptions on project change', async () => {
    const sender = { id: 1, send: vi.fn(), isDestroyed: () => false, once: vi.fn(), removeListener: vi.fn() }
    const event = { sender }
    const projection = (lane: string) => ({ lanes: [], active: { lane, parts: [] } })
    const makeWorkspace = (lane: string) => {
      const unsubscribe = vi.fn()
      return { projection: () => projection(lane), subscribe: vi.fn(() => unsubscribe),
        close: vi.fn(), execute: vi.fn(async () => ({})), unsubscribe }
    }
    const first = makeWorkspace('first')
    const second = makeWorkspace('second')
    const openWorkspace = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const registration = registerAgentLaneIpc({
      openWorkspace,
      validate: vi.fn(), configure: vi.fn(), receipt: vi.fn(), singleShot: vi.fn(), updatePolicy: vi.fn(), restoreInput: vi.fn(),
    })
    const send = (wire: unknown) => ipc.handlers.get(LANE_IPC_CHANNELS.command)!(event, wire)
    try {
      expect(await send({ kind: 'workspace-open', binding: { projectId: 'one' } })).toMatchObject({ ok: true })
      expect(openWorkspace).toHaveBeenCalledTimes(1)
      expect(sender.send).toHaveBeenLastCalledWith(LANE_IPC_CHANNELS.projection, projection('first'))
      expect(await send({ kind: 'workspace-open', binding: { projectId: 'two' } })).toMatchObject({ ok: true })
      expect(first.unsubscribe).toHaveBeenCalledOnce()
      expect(first.close).toHaveBeenCalledOnce()
      expect(second.subscribe).toHaveBeenCalledOnce()
      expect(sender.send).toHaveBeenLastCalledWith(LANE_IPC_CHANNELS.projection, projection('second'))
    } finally { await registration.dispose() }
  })

  it('never sends one renderer commands into a workspace opened by another renderer', async () => {
    const owner = { id: 1, send: vi.fn(), isDestroyed: () => false, once: vi.fn(), removeListener: vi.fn() }
    const stranger = { id: 2, send: vi.fn(), isDestroyed: () => false, once: vi.fn(), removeListener: vi.fn() }
    const execute = vi.fn(async () => ({}))
    const workspace = { projection: () => ({ lanes: [], active: { lane: 'private', parts: [] } }),
      subscribe: () => () => {}, close: vi.fn(), execute } as unknown as LaneWorkspaceHandle
    const registration = registerAgentLaneIpc({ openWorkspace: async () => workspace, validate: vi.fn(), configure: vi.fn(), receipt: vi.fn(), singleShot: vi.fn(), updatePolicy: vi.fn(), restoreInput: vi.fn() })
    const send = (sender: typeof owner, wire: unknown) => ipc.handlers.get(LANE_IPC_CHANNELS.command)!({ sender }, wire)
    try {
      await send(owner, { kind: 'workspace-open', binding: { projectId: 'one' } })
      expect(await send(stranger, { kind: 'prompt', text: 'change another project' })).toMatchObject({ ok: false })
      expect(execute).not.toHaveBeenCalled()
      expect(stranger.send).not.toHaveBeenCalled()
    } finally { await registration.dispose() }
  })
  it('closes the owned workspace after its committed Surface has already been released', async () => {
    const sender = { id: 1, send: vi.fn(), isDestroyed: () => false, once: vi.fn(), removeListener: vi.fn() }
    const close = vi.fn()
    const workspace = { projection: () => ({ lanes: [], active: { lane: 'main', parts: [] } }),
      subscribe: () => () => {}, close, execute: vi.fn() } as unknown as LaneWorkspaceHandle
    const validate = vi.fn(() => { throw new Error('surface_port_suspended') })
    const registration = registerAgentLaneIpc({ openWorkspace: async () => workspace, validate, configure: vi.fn(), receipt: vi.fn(), singleShot: vi.fn(), updatePolicy: vi.fn(), restoreInput: vi.fn() })
    const send = (wire: unknown) => ipc.handlers.get(LANE_IPC_CHANNELS.command)!({ sender }, wire)
    try {
      const opened = await send({ kind: 'workspace-open', binding: { projectId: 'one' } }) as { workspaceId: string }
      expect(await send({ kind: 'workspace-close', workspaceId: opened.workspaceId })).toMatchObject({ ok: true })
      expect(close).toHaveBeenCalledOnce()
      expect(validate).not.toHaveBeenCalled()
    } finally { await registration.dispose() }
  })

  it('captures composer input atomically without holding approvals behind a running prompt', async () => {
    const sender = { id: 1, send: vi.fn(), isDestroyed: () => false, once: vi.fn(), removeListener: vi.fn() }
    let finishConfigure!: () => void
    let configured!: () => void
    const entered = new Promise<void>((resolve) => { configured = resolve })
    const blocked = new Promise<void>((resolve) => { finishConfigure = resolve })
    let finishPrompt!: () => void
    const prompt = new Promise<void>((resolve) => { finishPrompt = resolve })
    const seen: string[] = []
    let context = ''
    const workspace = { projection: () => ({ lanes: [], active: { lane: 'main', parts: [] } }),
      subscribe: () => () => {}, close: vi.fn(), execute: vi.fn(async (command) => {
        if (command.kind === 'prompt') { seen.push(`${command.text}:${context}`); await prompt }
        else seen.push(command.kind)
        return {}
      }) } as unknown as LaneWorkspaceHandle
    const configure = vi.fn(async (_event, wire) => {
      if (wire.context === 'A') { configured(); await blocked }
      context = wire.context
    })
    const registration = registerAgentLaneIpc({ openWorkspace: async () => workspace, validate: vi.fn(), configure, receipt: vi.fn(), singleShot: vi.fn(), updatePolicy: vi.fn(), restoreInput: vi.fn() })
    const send = (wire: unknown) => ipc.handlers.get(LANE_IPC_CHANNELS.command)!({ sender }, wire)
    try {
      const opened = await send({ kind: 'workspace-open' }) as { workspaceId: string }
      const common = { workspaceId: opened.workspaceId, expectedLane: 'main' }
      const first = send({ ...common, kind: 'prompt', text: 'one', context: 'A' })
      await entered
      const second = send({ ...common, kind: 'steer', text: 'two', context: 'B' })
      finishConfigure()
      await second
      expect(seen).toEqual(['one:A', 'steer'])
      expect(await send({ ...common, kind: 'approval', toolCallId: 'tool', action: 'allow-once' })).toMatchObject({ ok: true })
      expect(seen).toEqual(['one:A', 'steer', 'approval'])
      finishPrompt()
      expect(await first).toMatchObject({ ok: true })
    } finally { finishConfigure(); finishPrompt(); await registration.dispose() }
  })

  it('rejects a send whose project changed while configuration was opening its lane', async () => {
    const sender = { id: 1, send: vi.fn(), isDestroyed: () => false, once: vi.fn(), removeListener: vi.fn() }
    let release!: () => void
    let entered!: () => void
    const blocked = new Promise<void>((resolve) => { release = resolve })
    const configuring = new Promise<void>((resolve) => { entered = resolve })
    const make = () => ({ projection: () => ({ lanes: [], active: { lane: 'main', parts: [] } }),
      subscribe: () => () => {}, close: vi.fn(), execute: vi.fn(async () => ({})) })
    const first = make(), second = make()
    const registration = registerAgentLaneIpc({ openWorkspace: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second),
      validate: vi.fn(), configure: async () => { entered(); await blocked }, receipt: vi.fn(), singleShot: vi.fn(), updatePolicy: vi.fn(), restoreInput: vi.fn() })
    const send = (wire: unknown) => ipc.handlers.get(LANE_IPC_CHANNELS.command)!({ sender }, wire)
    try {
      const opened = await send({ kind: 'workspace-open' }) as { workspaceId: string }
      const pending = send({ kind: 'prompt', text: 'belongs to first', context: {}, expectedLane: 'main', workspaceId: opened.workspaceId })
      await configuring
      await send({ kind: 'workspace-open' })
      release()
      expect(await pending).toMatchObject({ ok: false })
      expect(first.execute).not.toHaveBeenCalled()
      expect(second.execute).not.toHaveBeenCalled()
    } finally { release(); await registration.dispose() }
  })

})
