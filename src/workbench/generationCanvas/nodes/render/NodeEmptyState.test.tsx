import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { GENERATION_NODE_PLUGINS } from '../registry'
import { getGenerationNodeIcon } from '../renderRegistry'
import { NodeEmptyState } from './NodeEmptyState'
import { NodeEmptyStateProvider } from './NodeEmptyStateProvider'
import { EmptyStateLauncher, UploadFallback } from './CardCommon'
import PanoramaUploadFallback from '../PanoramaUploadFallback'

vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key }) }))
const render = (children: React.ReactNode, engaged: boolean, readOnly = false) => renderToStaticMarkup(
  <NodeEmptyStateProvider engaged={engaged} readOnly={readOnly}>{children}</NodeEmptyStateProvider>,
)

describe('host-owned empty guidance across the node registry', () => {
  it.each(GENERATION_NODE_PLUGINS.map(({ kind }) => kind))('%s: browsing hides teaching, single selection restores it, read-only hides writes', (kind) => {
    const Icon = getGenerationNodeIcon(kind)
    const body = <NodeEmptyState icon={<Icon />} title="KIND" description="INSTRUCTION" action={<button>NEXT STEP</button>} />
    const browsing = render(body, false)
    expect(browsing).toContain('data-empty-tier="icon"')
    expect(browsing).toContain('tabler-icon')
    expect(browsing).not.toMatch(/KIND|INSTRUCTION|NEXT STEP|<button/)
    const selected = render(body, true)
    expect(selected).toContain('INSTRUCTION')
    expect(selected).toContain('NEXT STEP')
    const readOnly = render(body, true, true)
    expect(readOnly).toContain('INSTRUCTION')
    expect(readOnly).not.toContain('<button')
  })

  it.each([false, true])('operational facts survive host engagement=%s', (engaged) => {
    const out = render(<NodeEmptyState purpose="status" icon={<svg />} title="WAITING" description="UPSTREAM" />, engaged)
    expect(out).toContain('WAITING')
    expect(out).toContain('UPSTREAM')
  })

  it('unscoped empty bodies fail closed to a type icon', () => {
    const out = renderToStaticMarkup(<NodeEmptyState icon={<svg />} title="GUIDANCE" action={<button>WRITE</button>} />)
    expect(out).toContain('data-empty-tier="icon"')
    expect(out).not.toMatch(/GUIDANCE|WRITE/)
  })

  it.each([[120, 44], [240, 84], [462, 184]])('icon-only at card height %s: disc top is %spx (45%% centre, >= 44px from top)', (height, top) => {
    const out = render(<NodeEmptyState height={height} icon={<svg />} />, false)
    expect(out).toContain(`top:${top}px`)
  })

  it('compact (audio strip / director inline) is the documented exception: centred in its own container', () => {
    expect(render(<NodeEmptyState compact icon={<svg />} />, false)).toContain('top:calc(50% - 24px)')
  })

  it('F1 empty tiers keep full cards at 24/1.5 and narrow bars at 13/1.8', () => {
    const full = render(<NodeEmptyState icon={<svg />} />, false)
    expect(full).toContain('size-6')
    expect(full).toContain('stroke-[1.5]')
    const narrow = render(<NodeEmptyState compact icon={<svg />} />, false)
    expect(narrow).toContain('size-[13px]')
    expect(narrow).toContain('stroke-[1.8]')
  })

  it.each([120, 169, 462])('icon-only stays a single 48px type mark at height %s', (height) => {
    const out = render(<NodeEmptyState height={height} icon={<svg />} title="TITLE" />, false)
    expect(out).toContain('size-12')
    expect(out).not.toContain('TITLE')
    expect(out.match(/<svg/g)).toHaveLength(1)
  })
})

describe('empty launchers obey the host capability gate', () => {
  const entries = [
    ['character', <UploadFallback kind="character" accept="image/*" label="Portrait" onUpload={() => {}} />],
    ['scene', <UploadFallback kind="scene" accept="image/*" label="Scene" onUpload={() => {}} />],
    ['prop', <UploadFallback kind="prop" accept="image/*" label="Prop" onUpload={() => {}} />],
    ['panorama', <PanoramaUploadFallback onChange={() => {}} />],
  ] as const
  it.each(entries)('%s: input is unavailable outside writable single selection', (_name, body) => {
    expect(render(body, false)).toContain('disabled=""')
    expect(render(body, true)).not.toContain('disabled=""')
    expect(render(body, true, true)).toContain('disabled=""')
  })
  it('whiteboard launcher enters keyboard order only when active', () => {
    const body = <EmptyStateLauncher icon={<svg />} label="OPEN" onActivate={() => {}} />
    expect(render(body, false)).toContain('tabindex="-1"')
    expect(render(body, true)).toContain('tabindex="0"')
    expect(render(body, true, true)).toContain('tabindex="-1"')
  })
})
