import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { describe, expect, it, vi } from 'vitest'
import { createDeconstructionShotTable } from './shotTableFacts'
import { ShotTableComposer } from './ShotTableComposer'
import { ShotTableFarCard } from './ShotTableFarCard'

// 2026-10-18 拆解前选模型 · 设计卡 ★4：选的模型用不了 → 标红说原因、「拆解」不可点（不悄悄换）；
// 一个能读图的模型都没有 → 下拉给「去接入」。

const catalog = vi.hoisted(() => ({ text: [] as Array<Record<string, unknown>> }))
vi.mock('../../../../config/useModelOptions', () => ({
  useModelOptionsState: (kind?: string) => ({ options: kind === 'text' ? catalog.text : [], error: null, healthError: null }),
}))
vi.mock('../composerAnchor', () => ({ ComposerAnchor: ({ children, inFlow: _inFlow, anchorRef: _ref, visualSize: _size, ...rest }: Record<string, unknown>) => React.createElement('div', rest, children as React.ReactNode) }))

const gem = { value: 'g', label: 'Gemini 3.5 Flash', vendor: 'apimart', vendorName: 'APIMart', modelKey: 'gemini-3.5-flash', meta: { supportsImageInput: true } }

function render(source: Record<string, unknown>, media: { sourceThumbnail?: string; sourceSeconds?: number } = {}): string {
  const base = createDeconstructionShotTable('video-1', '参考片')
  const table = { ...base, source: { ...base.source, ...source } }
  return renderToStaticMarkup(React.createElement(MantineProvider, null, React.createElement(ShotTableComposer, {
    nodeId: 'table-1', table, visualSize: { width: 920, height: 372 }, sourceAvailable: true, hasRows: false, ...media,
    selectedRowIds: [], onError: () => {},
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

// 拍板稿图 1 下方栏首行：源视频 poster +「拆这条视频：<名> · m:ss」；没有 poster / 时长就不画、不编。
describe('拆解栏首行：源视频', () => {
  const sourceLine = (html: string) => /data-testid="shot-table-source-line"[^>]*>([^<]*)</.exec(html)?.[1] ?? ''
  it('有 poster 与时长：缩略图 + 名字 · m:ss（先取整再拆分，59.6 秒写 1:00）', () => {
    catalog.text = []
    const html = render({}, { sourceThumbnail: 'nomi-local://poster.jpg', sourceSeconds: 59.6 })
    expect(html).toContain('data-testid="shot-table-source-thumbnail"')
    expect(sourceLine(html)).toMatch(/参考片 · 1:00$/)
  })
  it('没有时长：只写名字，不编一个 0:00', () => {
    catalog.text = []
    const html = render({})
    expect(html).not.toContain('data-testid="shot-table-source-thumbnail"')
    expect(sourceLine(html)).not.toContain(':0')
  })
})

// 拍板稿图 4 远档：标题 · 镜数 · 时长 · 没读出几镜 · 关键帧条（最多 6 张）。
describe('远档卡片', () => {
  const row = (index: number, over: Record<string, unknown> = {}) => ({ id: `r${index}`, index, prompt: '', thumbnail: `nomi-local://k${index}.jpg`, ...over })
  const card = (rows: ReturnType<typeof row>[], totalSeconds?: number) => renderToStaticMarkup(React.createElement(ShotTableFarCard, { title: '雨夜参考片', rows, totalSeconds }))
  it('有没读出的镜：写出几镜，关键帧条最多 6 张', () => {
    const html = card(Array.from({ length: 10 }, (_, i) => row(i + 1, i === 2 ? { visionFailed: true } : {})), 15)
    expect(html).toContain('雨夜参考片')
    expect((html.match(/<img /g) ?? []).length).toBe(6)
    expect(html).toMatch(/15s/)
    expect(html).toContain('data-testid="shot-table-far-card"')
  })
  it('全读出：不写问题数（那一行不标红）', () => {
    expect(card([row(1)], 3)).not.toContain('text-nomi-danger')
    expect(card([row(1, { visionFailed: true })], 3)).toContain('text-nomi-danger')
  })
})
