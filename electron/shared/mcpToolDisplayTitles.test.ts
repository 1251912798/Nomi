import { describe, expect, it } from 'vitest'
import { MCP_TOOL_NAMES } from '../capabilityCore/mcpProtocol'
import { MCP_TOOL_DISPLAY_TOOL_NAMES, mcpToolDisplayTitle } from './mcpToolDisplayTitles'

describe('MCP tool display titles on the assistant card', () => {
  it('covers every tool the catalog exposes, in both languages, with no cost wording', () => {
    expect([...MCP_TOOL_NAMES].filter((name) => !MCP_TOOL_DISPLAY_TOOL_NAMES.includes(name))).toEqual([])
    for (const name of MCP_TOOL_NAMES) {
      for (const locale of ['zh-CN', 'en'] as const) {
        const title = mcpToolDisplayTitle(name, locale)
        expect(title).not.toBe(name)
        expect(title).not.toMatch(/价格|预算|花钱|price|budget|cost/i)
      }
    }
  })

  it('falls back to the internal tool name for a tool nobody has titled yet', () => {
    expect(mcpToolDisplayTitle('nomi_future_tool', 'en')).toBe('nomi_future_tool')
  })
})
