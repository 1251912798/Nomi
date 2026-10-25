import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../pointer/NodePointer', () => ({
  NodePointer: () => null,
  NodePointerGroup: ({ cellAccessory }: { cellAccessory?: (subject: unknown, index: number) => { action?: React.ReactNode } | null }) => {
    const accessory = cellAccessory?.({}, 0)
    return accessory?.action ?? null
  },
}))

import { AgentPanelV4SpendCardBody } from './AgentPanelV4SpendCardBody'

const pointer = (exclusion: 'exclude' | 'restore') => ({
  shotId: 'shot-1', nodeId: 'node-1', shotRef: '镜 01', removed: false, exclusion,
})

const render = (exclusion: 'exclude' | 'restore') => renderToStaticMarkup(React.createElement(AgentPanelV4SpendCardBody, {
  pointers: [pointer(exclusion)], single: false, notices: [], busy: false,
  onExclude: vi.fn(), onRestore: vi.fn(),
}))

describe('AgentPanelV4SpendCardBody', () => {
  it('renders the exclusion accessory without a runtime missing-cn failure', () => {
    expect(render('exclude')).toContain('data-spend-exclusion="exclude"')
  })

  // SpendCardQ1 板 card.pointer.exclude：缩略图角上的小 ×「和输入框里参考图的 × 同一个样子」——共用 ThumbCornerX，付费卡不再有自己的一套样式。
  it('「不生成」 is the shared thumbnail-corner × (the reference-image one), with no pill style of its own', () => {
    const html = render('exclude')
    expect(html).toContain('data-thumb-corner-x="true"')
    expect(html).toContain('aria-label="agentPanelV4.spendCard.excludeName"')
    expect(html).not.toContain('bg-nomi-paper/85')
    expect(html).not.toContain('inline-flex h-5')
  })

  it('「恢复」 stays the small pill in the middle of the dimmed tile (its look was not part of this change)', () => {
    const html = render('restore')
    expect(html).toContain('data-spend-exclusion="restore"')
    expect(html).toContain('agentPanelV4.spendCard.restore</button>')
    expect(html).not.toContain('data-thumb-corner-x')
    expect(html).toContain('inline-flex h-5 items-center rounded-full')
  })
})
