import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { ToolbarTimelineButton, ToolbarIconButton, NodeHoverTimelineHandle } from './NodeFloatingToolbar'
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
  id: 'media', title: 'Media', kind: 'asset', categoryId: type === 'audio' ? 'audio' : 'shots', position: { x: 0, y: 0 }, status: 'success',
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
    expect(html).toContain('tabler-icon-timeline')
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
  it('renders nothing and refuses to act on a read-only canvas', () => {
    expect(ToolbarTimelineButton({ nodeId: 'media', readOnly: true })).toBeNull()
    expect(renderToStaticMarkup(React.createElement(ToolbarTimelineButton, { nodeId: 'media', readOnly: true }))).toBe('')
    expect(ToolbarTimelineButton({ nodeId: 'media' })).not.toBeNull()
  })

  it('hover handle: draggable timeline action that stays out of the way until hovered, hidden when the toolbar is present', () => {
    const html = renderToStaticMarkup(React.createElement(NodeHoverTimelineHandle, { nodeId: 'media' }))
    expect(html).toContain('data-node-timeline-hover-handle="true"')
    expect(html).toContain('data-toolbar-action="add-to-timeline"')
    expect(html).toContain('draggable="true"')
    expect(html).toContain('opacity-0')
    expect(html).toContain('group-hover/node:opacity-100')
    expect(html).toContain('group-has-[[data-node-floating-toolbar]]/node:hidden')
    // 把手必须整个在节点外（bottom-full），且隐藏时不接收指针：节点本体不许被它占，否则点选会被它截走（CI 走查「两版卡没选中」）
    expect(html).toContain('bottom-full')
    expect(html).toContain('pointer-events-none')
    expect(html).not.toMatch(/[\s"](top|left|inset)-[\w/[\]-]+/)
    expect(renderToStaticMarkup(React.createElement(NodeHoverTimelineHandle, { nodeId: 'media', readOnly: true }))).toBe('')
    fixture.nodes = [{ ...media(), status: 'running' }]
    expect(renderToStaticMarkup(React.createElement(NodeHoverTimelineHandle, { nodeId: 'media' }))).toBe('')
  })
})
