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

describe('AgentPanelV4SpendCardBody', () => {
  it('renders the exclusion accessory without a runtime missing-cn failure', () => {
    const html = renderToStaticMarkup(React.createElement(AgentPanelV4SpendCardBody, {
      pointers: [pointer('exclude')], single: false, notices: [], busy: false,
      onExclude: vi.fn(), onRestore: vi.fn(),
    }))
    expect(html).toContain('data-spend-exclusion="exclude"')
    expect(html).toContain('inline-flex h-5 items-center')
  })
})
