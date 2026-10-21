// 3D-BOX 是唯一的导演台（用户 10-16）：工具面只有一张。
// - 内部 Agent：只有一份 `stage_shot`，归仅内部的 `director.write`（计划 / 补丁一个入口）。
// - 对外 MCP：`nomi_canvas_edit` 的摆位参考 / 运镜参考两个操作照旧在（外部 Agent 在用），它们建出来的就是导演节点，
//   打开即进 3D-BOX 导演台；`director.write` 永不出现在对外面。
import { describe, expect, it } from 'vitest'
import { toModelVisibleSchema } from '../agentLane/laneToolSchema.mts'
import { CANVAS_WRITE_OPERATIONS } from '../shared/agentCapabilities/canvasWrite'
import { MODEL_FACING_TOOL_SPECS } from '../shared/agentCapabilities/modelFacingToolRegistry'
import { CAPABILITY_CONTRACTS, resolveCapabilityAlias } from '../shared/agentCapabilities/registry'
import { CANVAS_AND_DIRECTOR_WRITE_CAPTURE_OPERATIONS, CANVAS_WRITE_CAPTURE_OPERATIONS, createCanvasReadSurfacePreloadBridge } from '../surfacePortPreloadBridge'
import { MCP_TOOL_RESOLVER } from './mcpToolCatalog'

const internal = MODEL_FACING_TOOL_SPECS.filter((spec) => spec.profiles?.includes('internal') ?? true)

describe('3D-BOX tool face (sole director)', () => {
  it('keeps the external staging / camera-move operations on nomi_canvas_edit and never exposes director.write', () => {
    const tools = MCP_TOOL_RESOLVER.list() as unknown as Array<Record<string, unknown>>
    const canvasEdit = tools.find((tool) => tool.name === 'nomi_canvas_edit')
    expect(canvasEdit).toBeTruthy()
    const text = JSON.stringify(canvasEdit)
    expect(text).toContain('create_staging_reference')
    expect(text).toContain('create_camera_move')
    expect(CANVAS_WRITE_OPERATIONS).toEqual(expect.arrayContaining(['create_staging_reference', 'create_camera_move']))
    expect(JSON.stringify(tools)).not.toContain('director.write')
    // 内部 stage_shot 的旧说明（「Attach a staging …」）不再拼进对外说明书：内部只剩 director.write 那一份。
    expect(String(canvasEdit?.description)).not.toContain('Attach a staging')
  })

  it('assembles exactly one internal stage_shot and it belongs to director.write', () => {
    expect(internal.filter((spec) => spec.name === 'stage_shot').map((spec) => spec.contractId)).toEqual(['director.write'])
    expect(CAPABILITY_CONTRACTS.map((contract) => contract.id)).toContain('director.write')
    expect(resolveCapabilityAlias('stage_shot')?.contract.id).toBe('director.write')
  })

  it('the preload capture whitelist is the canvas operations plus the two director operations', () => {
    expect([...CANVAS_AND_DIRECTOR_WRITE_CAPTURE_OPERATIONS]).toEqual([...CANVAS_WRITE_CAPTURE_OPERATIONS, 'create_director_plan', 'patch_director_plan'])
    expect(CANVAS_WRITE_CAPTURE_OPERATIONS).toEqual(expect.arrayContaining(['create_staging_reference', 'create_camera_move']))
  })

  it('lets a director capture request and an MCP staging capture request through the preload boundary', () => {
    const listeners = new Map<string, (payload: unknown) => void>()
    const events = { subscribe: (channel: string, listener: (payload: unknown) => void) => { listeners.set(channel, listener); return () => undefined }, send: () => undefined }
    const seen: string[] = []
    const bridge = createCanvasReadSurfacePreloadBridge(async () => undefined, events)
    bridge.onCanvasWriteCapture((request) => { seen.push(request.operation); return { ok: true } as never })
    const listener = [...listeners.values()][0]
    for (const operation of ['create_director_plan', 'create_staging_reference', 'create_camera_move', 'not_an_operation']) {
      listener({ requestId: `r-${operation}`, binding: { projectId: 'p' }, operation, input: {} })
    }
    expect(seen).toEqual(['create_director_plan', 'create_staging_reference', 'create_camera_move'])
  })
})

describe('3D-BOX tool face survives the lane schema bridge', () => {
  // 真机首跑抓到的：外层 .describe() 盖掉了计划 schema 自己那句描述，lane 装配期的无损断言当场抛，
  // 整个 Agent 面板起不来。这里把全部内部动词过一遍同一个桥。
  it('every internal verb converts without information loss', () => {
    for (const spec of internal) {
      expect(() => toModelVisibleSchema(spec.schema, { toolName: spec.name } as never), spec.name).not.toThrow()
    }
  })
})
