import { describe, expect, it, vi } from 'vitest'
import { MCP_CALL_IDLE_RELEASE_MS, createMcpUsageRegistry } from './mcpUsageRegistry'

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
  describe('in-flight call identity survives the dedupe history cap (D1)', () => {
    const churn = (registry: ReturnType<typeof fixture>['registry'], client: string, count: number, prefix = 'o') => {
      for (let i = 0; i < count; i += 1) registry.callStarted(client, { tool: 'nomi_read', id: `${prefix}${i}` })()
    }

    it('does not count a long call twice when more than 256 other calls finish meanwhile', () => {
      const { registry } = fixture()
      const longEnd = registry.callStarted('claude', { tool: 'nomi_generate', id: 'long' })
      churn(registry, 'claude', 300)
      const secondHop = registry.callStarted('claude', { tool: 'nomi_generate', id: 'long' })
      expect(registry.snapshot().claude.callCount).toBe(301)
      secondHop()
      longEnd()
      expect(registry.snapshot().claude).toMatchObject({ callCount: 301, inFlight: 0 })
    })

    it('protects several parallel long calls at once', () => {
      const { registry } = fixture()
      const ends = ['l1', 'l2', 'l3'].map((id) => registry.callStarted('claude', { tool: 'nomi_generate', id }))
      churn(registry, 'claude', 600)
      for (const id of ['l1', 'l2', 'l3']) registry.callStarted('claude', { tool: 'nomi_generate', id })()
      expect(registry.snapshot().claude.callCount).toBe(603)
      ends.forEach((end) => end())
    })

    it('is exact on the 256 boundary: 255, 256 and 257 other calls all keep a count of others + 1', () => {
      for (const others of [255, 256, 257]) {
        const { registry } = fixture()
        const end = registry.callStarted('claude', { tool: 'nomi_generate', id: 'long' })
        churn(registry, 'claude', others)
        registry.callStarted('claude', { tool: 'nomi_generate', id: 'long' })()
        expect(registry.snapshot().claude.callCount).toBe(others + 1)
        end()
      }
    })

    it('keeps protecting across cancel and double-close', () => {
      const { registry } = fixture()
      const end = registry.callStarted('claude', { tool: 'nomi_generate', id: 'long' })
      churn(registry, 'claude', 300)
      end()
      end()
      expect(registry.snapshot().claude).toMatchObject({ callCount: 301, inFlight: 0 })
      registry.callStarted('claude', { tool: 'nomi_generate', id: 'long' })()
      expect(registry.snapshot().claude.callCount).toBe(301)
    })

    it('never lets one identity in-flight call shield or evict another identity history', () => {
      const { registry } = fixture()
      const claudeEnd = registry.callStarted('claude', { tool: 'nomi_generate', id: 'long' })
      churn(registry, 'cursor', 300)
      churn(registry, 'claude', 300)
      registry.callStarted('cursor', { tool: 'nomi_read', id: 'long' })()
      registry.callStarted('claude', { tool: 'nomi_generate', id: 'long' })()
      expect(registry.snapshot().claude.callCount).toBe(301)
      expect(registry.snapshot().cursor.callCount).toBe(301)
      claudeEnd()
    })
  })

  describe('one tool call lives across hops, including the gap between them (R1)', () => {
    const churn = (registry: ReturnType<typeof fixture>['registry'], client: string, count: number, prefix = 'o') => {
      for (let i = 0; i < count; i += 1) registry.callStarted(client, { tool: 'nomi_read', id: `${prefix}${i}` })()
    }

    it('counts once when hop 1 is closed, 300 other calls pass, then hop 2 arrives', () => {
      const { registry } = fixture()
      registry.callStarted('claude', { tool: 'nomi_operation_gate', id: 'gate' })() // challenge 一跳，已关闭
      churn(registry, 'claude', 300)
      registry.callStarted('claude', { tool: 'nomi_operation_gate', id: 'gate' })() // 等真人确认后的 decide/start 一跳
      expect(registry.snapshot().claude).toMatchObject({ callCount: 301, inFlight: 0 })
    })

    it('holds across a long human wait, however many other calls pass, as long as the wait is under the release time', () => {
      const { registry, advance } = fixture()
      registry.callStarted('claude', { tool: 'nomi_operation_gate', id: 'gate' })()
      for (let round = 0; round < 5; round += 1) {
        advance(MCP_CALL_IDLE_RELEASE_MS / 6)
        churn(registry, 'claude', 100, `r${round}-`)
      }
      registry.callStarted('claude', { tool: 'nomi_operation_gate', id: 'gate' })()
      expect(registry.snapshot().claude.callCount).toBe(501)
    })

    it('lets go of an ended call after the idle release time, so memory is bounded by time (and a hop still open is never let go)', () => {
      const { registry, advance } = fixture()
      registry.callStarted('claude', { tool: 'nomi_read', id: 'done' })()
      const open = registry.callStarted('claude', { tool: 'nomi_generate', id: 'open' })
      advance(MCP_CALL_IDLE_RELEASE_MS * 3)
      churn(registry, 'claude', 1, 'tick') // 触发清理
      registry.callStarted('claude', { tool: 'nomi_generate', id: 'open' })()
      expect(registry.snapshot().claude.callCount).toBe(3) // done、open、tick0；open 第二跳不重复记
      registry.callStarted('claude', { tool: 'nomi_read', id: 'done' })() // 已释放：号是每次调用现生成的，真来了就是新调用
      expect(registry.snapshot().claude.callCount).toBe(4)
      open()
    })
  })
})
