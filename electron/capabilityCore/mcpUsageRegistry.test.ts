import { describe, expect, it, vi } from 'vitest'
import { createMcpUsageRegistry } from './mcpUsageRegistry'

function fixture() {
  let clock = 1_000
  const onChange = vi.fn()
  const registry = createMcpUsageRegistry({ now: () => clock, onChange })
  return { registry, onChange, advance: (ms: number) => { clock += ms } }
}

describe('mcp usage registry', () => {
  it('has nothing for an assistant that never showed up', () => {
    expect(fixture().registry.snapshot()).toEqual({})
  })

  it('records one call: tool, time, count, and in-flight until it ends', () => {
    const { registry, advance } = fixture()
    const end = registry.callStarted('claude', { tool: 'nomi_read', id: 'a' })
    expect(registry.snapshot().claude).toEqual({ reportedName: null, lastSeenAt: 1_000, lastCall: { tool: 'nomi_read', at: 1_000 }, callCount: 1, inFlight: 1 })
    advance(500)
    end()
    expect(registry.snapshot().claude).toMatchObject({ callCount: 1, inFlight: 0, lastSeenAt: 1_500, lastCall: { at: 1_000 } })
  })

  it('counts a tool call once even when it makes several requests inside Nomi', () => {
    const { registry } = fixture()
    const first = registry.callStarted('codex', { tool: 'nomi_operation_plan', id: 'same' })
    const second = registry.callStarted('codex', { tool: 'nomi_operation_plan', id: 'same' })
    expect(registry.snapshot().codex).toMatchObject({ callCount: 1, inFlight: 1 })
    first()
    expect(registry.snapshot().codex.inFlight).toBe(1)
    second()
    expect(registry.snapshot().codex.inFlight).toBe(0)
  })

  it('keeps concurrent calls apart and never lets an end fire twice', () => {
    const { registry } = fixture()
    const a = registry.callStarted('claude', { tool: 'nomi_read', id: 'a' })
    const b = registry.callStarted('claude', { tool: 'nomi_canvas_edit', id: 'b' })
    expect(registry.snapshot().claude).toMatchObject({ callCount: 2, inFlight: 2, lastCall: { tool: 'nomi_canvas_edit' } })
    a(); a(); a()
    expect(registry.snapshot().claude.inFlight).toBe(1)
    b()
    expect(registry.snapshot().claude.inFlight).toBe(0)
  })

  it('keeps assistants separate', () => {
    const { registry } = fixture()
    registry.callStarted('claude', { tool: 'nomi_read', id: 'a' })()
    registry.connected('cursor', 'cursor-vscode')
    expect(registry.snapshot().claude.callCount).toBe(1)
    expect(registry.snapshot().cursor).toMatchObject({ callCount: 0, reportedName: 'cursor-vscode', lastCall: null })
  })

  it('survives a reconnect: counts carry on, the new connection only refreshes last-seen and the shown name', () => {
    const { registry, advance } = fixture()
    registry.connected('claude', 'claude-code')
    registry.callStarted('claude', { tool: 'nomi_read', id: 'a' })()
    advance(60_000)
    registry.connected('claude', 'claude-code-2')
    expect(registry.snapshot().claude).toMatchObject({ callCount: 1, inFlight: 0, lastSeenAt: 61_000, reportedName: 'claude-code-2' })
  })

  it('a disconnect in the middle of a call still ends it (the end hook is the response closing)', () => {
    const { registry } = fixture()
    const end = registry.callStarted('claude', { tool: 'nomi_run_start', id: 'a' })
    end()
    expect(registry.snapshot().claude).toMatchObject({ callCount: 1, inFlight: 0 })
  })

  it('bounds the memory used for de-duplication', () => {
    const { registry } = fixture()
    for (let i = 0; i < 1000; i += 1) registry.callStarted('claude', { tool: 'nomi_read', id: `c${i}` })()
    expect(registry.snapshot().claude.callCount).toBe(1000)
  })

  it('tells listeners about every change', () => {
    const { registry, onChange } = fixture()
    registry.connected('claude')
    const end = registry.callStarted('claude', { tool: 'nomi_read', id: 'a' })
    end()
    expect(onChange).toHaveBeenCalledTimes(3)
  })
})
