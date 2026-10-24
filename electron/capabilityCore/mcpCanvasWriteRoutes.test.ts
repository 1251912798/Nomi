// 对外 MCP 面上 nomi_canvas_edit 写着能做的画布操作，每一个都要有一条真送得到的路：主进程无头那条
// （CANVAS_WRITE_HEADLESS_OPERATIONS），或经项目会话送到开着的渲染端（CANVAS_WRITE_LIVE_RENDERER_OPERATIONS）。
//
// 2026-10-16 V-3dbox 用官方 SDK 实调：摆位参考 / 运镜参考写在工具说明里，线上却回 capability_unsupported——
// 新操作上了工具面、没人接传输，快照和直调渲染端的单测都看不出来。这道门让「上了面、没接路」当场红。
// 2026-10-17：旧账里的 4 个（tidy_canvas / propose_storyboard_plan / arrange_storyboard_to_timeline / set_node_text）
// 已接上路由，清单清零——从此「上了面、没接路」没有任何豁免。
import { describe, expect, it } from 'vitest'

import { CANVAS_WRITE_HEADLESS_OPERATIONS, CANVAS_WRITE_LIVE_RENDERER_OPERATIONS, CANVAS_WRITE_OPERATIONS } from '../shared/agentCapabilities/canvasWrite'
import { MCP_TOOL_RESOLVER } from './mcpToolCatalog'

function advertisedCanvasEditOperations(): string[] {
  const tool = (MCP_TOOL_RESOLVER.list() as unknown as Array<Record<string, unknown>>).find((candidate) => candidate.name === 'nomi_canvas_edit')
  const text = JSON.stringify(tool ?? {})
  return CANVAS_WRITE_OPERATIONS.filter((operation) => text.includes(`"${operation}"`))
}

describe('every canvas operation advertised on nomi_canvas_edit has a transport route', () => {
  it('advertised operations are all served headless or by the live renderer (no exemptions)', () => {
    const routed = new Set<string>([...CANVAS_WRITE_HEADLESS_OPERATIONS, ...CANVAS_WRITE_LIVE_RENDERER_OPERATIONS])
    expect(advertisedCanvasEditOperations().filter((operation) => !routed.has(operation))).toEqual([])
  })

  it('every canvas.write operation (advertised or not) has exactly one route', () => {
    const headless = new Set<string>(CANVAS_WRITE_HEADLESS_OPERATIONS)
    const live = new Set<string>(CANVAS_WRITE_LIVE_RENDERER_OPERATIONS)
    for (const operation of CANVAS_WRITE_OPERATIONS) {
      expect([headless.has(operation), live.has(operation)].filter(Boolean), `${operation} must be routed exactly once`).toHaveLength(1)
    }
  })

  it('the four operations that used to answer capability_unsupported are routed to the live renderer', () => {
    expect(CANVAS_WRITE_LIVE_RENDERER_OPERATIONS).toEqual(expect.arrayContaining([
      'tidy_canvas', 'propose_storyboard_plan', 'arrange_storyboard_to_timeline', 'set_node_text',
    ]))
  })

  it('the director reference operations are routed (they land director nodes in the 3D-BOX director)', () => {
    expect(CANVAS_WRITE_LIVE_RENDERER_OPERATIONS).toEqual(expect.arrayContaining(['create_staging_reference', 'create_camera_move']))
    expect(advertisedCanvasEditOperations()).toEqual(expect.arrayContaining(['create_staging_reference', 'create_camera_move']))
  })
})
