import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { V4ModelPopover } from './AgentPanelV4Composer'
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
describe('model popover content flow', () => {
  it('renders all supplied categories without a redundant heading or fixed width', () => {
    const html = renderToStaticMarkup(React.createElement(V4ModelPopover, { rows: ['chat', 'image', 'video'].map(slot => ({ slot, name: slot, empty: 'unavailable' })) }))
    for (const slot of ['chat', 'image', 'video']) expect(html).toContain(`data-v4-model-row="${slot}"`)
    expect(html).not.toContain('agentPanelV4.modelHint')
    expect(html).not.toContain('w-[340px]')
  })
})
