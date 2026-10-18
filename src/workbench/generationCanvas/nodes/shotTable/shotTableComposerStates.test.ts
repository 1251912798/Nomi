import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it, vi } from 'vitest'
import { createDeconstructionShotTable } from './shotTableFacts'
import { ShotTableComposer } from './ShotTableComposer'

// 2026-10-18 拆解前选模型 · 设计卡 ★4：选的模型用不了 → 标红说原因、「拆解」不可点（不悄悄换）；
// 一个能读图的模型都没有 → 下拉给「去接入」。

const catalog = vi.hoisted(() => ({ text: [] as Array<Record<string, unknown>> }))
vi.mock('../../../../config/useModelOptions', () => ({
  useModelOptionsState: (kind?: string) => ({ options: kind === 'text' ? catalog.text : [], error: null, healthError: null }),
}))
vi.mock('../composerAnchor', () => ({ ComposerAnchor: ({ children, inFlow: _inFlow, anchorRef: _ref, visualSize: _size, ...rest }: Record<string, unknown>) => React.createElement('div', rest, children as React.ReactNode) }))

const gem = { value: 'g', label: 'Gemini 3.5 Flash', vendor: 'apimart', vendorName: 'APIMart', modelKey: 'gemini-3.5-flash', meta: { supportsImageInput: true } }

function render(source: Record<string, unknown>): string {
  const base = createDeconstructionShotTable('video-1', '参考片')
  const table = { ...base, source: { ...base.source, ...source } }
  return renderToStaticMarkup(React.createElement(MantineProvider, null, React.createElement(ShotTableComposer, {
    nodeId: 'table-1', table, visualSize: { width: 920, height: 372 }, sourceAvailable: true, hasRows: false,
    selectedRowIds: [], busy: false, onGenerate: () => {}, onError: () => {},
  })))
}

const primary = (html: string) => /<button[^>]*data-testid="shot-table-restart-deconstruction"[^>]*>/.exec(html)?.[0] ?? ''

describe('拆解栏：选的模型用不了时不悄悄换、不让拆', () => {
  it('读图选了一个已不在清单里的模型：主按钮不可点、写明原因', () => {
    catalog.text = [gem]
    const html = render({ visionModel: { vendorKey: 'relay', modelKey: 'retired-vl' } })
    expect(primary(html)).toMatch(/ disabled=""/)
    expect(html).toContain('data-testid="shot-table-model-stale"')
  })

  it('选的模型还在：主按钮可点、没有原因行', () => {
    catalog.text = [gem]
    const html = render({ visionModel: { vendorKey: 'apimart', modelKey: 'gemini-3.5-flash' } })
    expect(primary(html)).not.toMatch(/ disabled=""/)
    expect(html).not.toContain('data-testid="shot-table-model-stale"')
  })

  it('没选过（自动）：不算失效', () => {
    catalog.text = []
    expect(render({})).not.toContain('data-testid="shot-table-model-stale"')
  })
})
