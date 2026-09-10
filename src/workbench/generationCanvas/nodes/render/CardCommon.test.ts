import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PendingGenerationPlaceholder } from './CardCommon'
vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key }) }))
describe('pending media action', () => {
  it.each(['image', 'video', 'model3d'])('%s does not duplicate author content', (kind) => {
    const props = { kind, selected: true, needsFirstFrame: false, prompt: 'PRIVATE FULL PROMPT' }
    const html = renderToStaticMarkup(React.createElement(PendingGenerationPlaceholder, props))
    expect(html).not.toContain('PRIVATE FULL PROMPT')
    expect(html).toContain(`nodeEmpty.${kind}.description`)
  })
  it('keeps the blocking next step ahead of the ordinary action', () => {
    expect(renderToStaticMarkup(React.createElement(PendingGenerationPlaceholder, {kind: 'video', selected: false, needsFirstFrame: true}))).toContain('nodeEmpty.firstFrame')
    expect(renderToStaticMarkup(React.createElement(PendingGenerationPlaceholder, {kind: 'video', selected: true, needsFirstFrame: true, waitingUpstream: true}))).toContain('nodeEmpty.waiting')
  })
})
