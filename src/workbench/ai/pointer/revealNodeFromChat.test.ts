import { describe, expect, it } from 'vitest'
import { agentCoversCanvas } from './revealNodeFromChat'

const stage = { left: 0, top: 0, width: 400, height: 700 }

describe('agentCoversCanvas', () => {
  it('collapses the chat when a narrow window is mostly covered by the floating chat (A4)', () => {
    expect(agentCoversCanvas(stage, { left: 8, top: 280, width: 384, height: 412 })).toBe(true)
  })

  it('keeps the chat open in a wide window where the float only takes a corner (A3)', () => {
    expect(agentCoversCanvas({ left: 0, top: 0, width: 1400, height: 860 }, { left: 1000, top: 344, width: 384, height: 500 })).toBe(false)
  })

  it('collapses when the float leaves only a sliver even if it covers less than half', () => {
    expect(agentCoversCanvas({ left: 0, top: 0, width: 500, height: 700 }, { left: 120, top: 100, width: 260, height: 500 })).toBe(true)
  })

  it('does nothing when there is no floating chat', () => {
    expect(agentCoversCanvas(stage, null)).toBe(false)
  })
})
