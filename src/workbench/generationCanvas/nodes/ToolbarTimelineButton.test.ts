import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { ToolbarTimelineButton, ToolbarIconButton } from './NodeFloatingToolbar'
import { TIMELINE_GENERATION_NODE_DRAG_MIME, decodeTimelineGenerationNodeDragPayload } from '../../timeline/timelineDragPayload'

const fixture = vi.hoisted(() => ({ nodes: [] as GenerationCanvasNode[], append: vi.fn() }))
vi.mock('../store/generationCanvasStore', () => ({
  useGenerationCanvasStore: Object.assign(
    (select: (state: { nodes: GenerationCanvasNode[] }) => unknown) => select(fixture),
    { getState: () => fixture },
  ),
}))
vi.mock('../../timeline/addNodeToTimelineEnd', () => ({ addGenerationNodeToTimelineEnd: fixture.append }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-i18next')>(),
  useTranslation: () => ({ t: (key: string) => key }),
}))

const media = (type: 'image' | 'video' | 'audio' = 'image'): GenerationCanvasNode => ({
  id: 'media', kind: 'asset', position: { x: 0, y: 0 }, status: 'success',
  result: { id: type, type, url: `file:///${type}`, createdAt: 1 },
})

describe('shared timeline toolbar action', () => {
  beforeEach(() => { fixture.nodes = [media()]; fixture.append.mockClear() })

  it.each(['image', 'video', 'audio'] as const)('renders an accessible draggable icon for %s', (type) => {
    fixture.nodes = [media(type)]
    const html = renderToStaticMarkup(React.createElement(ToolbarTimelineButton, { nodeId: 'media' }))
    expect(html).toContain('data-toolbar-action="add-to-timeline"')
    expect(html).toContain('draggable="true"')
    expect(html).toContain('aria-label="timelineEditor.dragToTimeline"')
    expect(html).toContain('tabler-icon-timeline-event-plus')
    expect(html).not.toContain('<span')
  })

  it('reads the current primary result when clicking or dragging, and blocks a stale toolbar', () => {
    const element = ToolbarTimelineButton({ nodeId: 'media' })!
    expect(element.type).toBe(ToolbarIconButton)
    fixture.nodes = [{ ...media('video'), result: { ...media('video').result!, id: 'new-primary' } }]
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() }
    element.props.onClick(event)
    expect(fixture.append).toHaveBeenCalledWith(fixture.nodes[0])
    const setData = vi.fn()
    const drag = { ...event, dataTransfer: { effectAllowed: '', setData } }
    element.props.onDragStart(drag)
    expect(drag.dataTransfer.effectAllowed).toBe('copy')
    expect(setData.mock.calls[0][0]).toBe(TIMELINE_GENERATION_NODE_DRAG_MIME)
    expect(decodeTimelineGenerationNodeDragPayload(setData.mock.calls[0][1])?.node.result?.id).toBe('new-primary')
    fixture.nodes[0].status = 'running'
    fixture.append.mockClear(); setData.mockClear()
    element.props.onClick(event)
    element.props.onDragStart(drag)
    expect(fixture.append).not.toHaveBeenCalled()
    expect(setData).not.toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('renders no action for missing, empty, failed, panorama, or non-media nodes', () => {
    for (const node of [undefined, { ...media(), result: undefined }, { ...media(), status: 'error' as const }, { ...media(), kind: 'panorama' as const }, { ...media(), result: { ...media().result!, type: 'model3d' as const } }]) {
      fixture.nodes = node ? [node] : []
      expect(ToolbarTimelineButton({ nodeId: 'media' })).toBeNull()
    }
  })
})
