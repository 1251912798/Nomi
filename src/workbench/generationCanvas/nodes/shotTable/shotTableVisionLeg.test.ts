import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGenerationCanvasStore } from '../../store/generationCanvasStore'
import { abandonPendingCanvasWrite } from '../../events/canvasWriteBoundary'
import { readShotTable } from '../../../../../electron/shared/canvas/shotTable'
import { deconstructToShotTable, ensureDeconstructionShotTable, retryShot } from './factBridge'
import { createDeconstructionShotTable, deconstructionResultToShotTable } from './shotTableFacts'
import { selectShotTableRows } from './selectShotTableRows'
import { editShotTableFacts } from './shotTableActions'
import { ShotTableGrid } from './ShotTableGrid'
import { SHOT_TABLE_ROW_METRICS } from './shotTableRowMetrics'

// 2026-10-11 走查 §1：拆解表拆不出画面 / 景别，且用户看不到原因、也换不了读图模型。
// 这里钉表这一层：失败原话落进行、行里看得见；读图模型选择记在表上（source.visionModel），整表重拆与单镜重试都带它。
// 方案卡：docs/plan/2026-10-11-canvas-ux-8-issues.md §11。

const bridge = vi.hoisted(() => ({ deconstruct: vi.fn(), onDeconstructionProgress: vi.fn(() => vi.fn()) }))
vi.mock('../../../../desktop/bridge', () => ({ getDesktopBridge: () => ({ video: bridge }) }))

function originProject() {
  const controller = new AbortController()
  return { binding: { projectId: 'p', immutableProjectUuid: 'uuid', projectGeneration: 1 }, signal: controller.signal,
    assertCurrent() { /* 当前 */ } }
}

const failedShot = {
  index: 1, startSeconds: 0, endSeconds: 2, durationSeconds: 2, sourceFrameUrl: 'nomi-local://p/f.png',
  shotSize: '', mood: '', visual: '', onScreenText: '', dialogue: '', carriedOver: false, imagePrompt: '', motionPrompt: '', custom: {},
  visionFailed: true, failureReason: "You've reached the API rate limit for free users",
}
const result = { shots: [failedShot], durationSeconds: 2, hasAudio: false, failedShotIndexes: [1], cutCoverage: undefined } as never

beforeEach(() => {
  abandonPendingCanvasWrite()
  bridge.deconstruct.mockReset()
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [], selectedNodeIds: [] })
})

function source(): string {
  const node = useGenerationCanvasStore.getState().addNode({ kind: 'video', title: 'Ref', position: { x: 0, y: 0 }, meta: {} })
  useGenerationCanvasStore.getState().updateNode(node.id, { result: { id: 'r', type: 'video', url: 'nomi-local://p/v.mp4', createdAt: 1 } })
  return node.id
}

describe('失败原话落进表', () => {
  it('引擎结果的每镜 failureReason 进入表行（读回来仍在）', () => {
    const table = deconstructionResultToShotTable(createDeconstructionShotTable('src', 'T'), result)
    expect(table.rows[0].failureReason).toContain('rate limit')
    const reread = readShotTable({ shotTable: table })
    expect(reread?.rows[0].failureReason).toContain('rate limit')
  })

  it('行视图带着它，格子里没读出的那一镜说得出原因', () => {
    const table = deconstructionResultToShotTable(createDeconstructionShotTable('src', 'T'), result)
    const rows = selectShotTableRows(table)
    expect(rows[0].failureReason).toContain('rate limit')
    const html = renderToStaticMarkup(React.createElement(ShotTableGrid, {
      rows, compact: false, rowMetrics: SHOT_TABLE_ROW_METRICS.standard, selectedIds: [], factColumns: table.columns,
    }))
    expect(html).toContain('rate limit')
  })
})

describe('读图模型选择记在表上', () => {
  it('整表拆解：source.visionModel 作为 payload.vision 发给引擎', async () => {
    bridge.deconstruct.mockResolvedValue(result)
    const sourceId = source()
    const tableId = ensureDeconstructionShotTable(sourceId)!
    editShotTableFacts(tableId, (table) => ({ ...table, source: { ...table.source, visionModel: { vendorKey: 'gem', modelKey: 'gem-flash' } } }))
    await deconstructToShotTable(sourceId, originProject())
    expect(bridge.deconstruct).toHaveBeenCalledWith(expect.objectContaining({ vision: { vendorKey: 'gem', modelKey: 'gem-flash' } }))
  })

  it('单镜重试也带同一个读图模型（换了模型的人重试不会悄悄退回默认）', async () => {
    const sourceId = source()
    const tableId = ensureDeconstructionShotTable(sourceId)!
    bridge.deconstruct.mockResolvedValueOnce(result)
    editShotTableFacts(tableId, (table) => ({ ...table, source: { ...table.source, visionModel: { vendorKey: 'gem', modelKey: 'gem-flash' } } }))
    await deconstructToShotTable(sourceId, originProject())
    bridge.deconstruct.mockResolvedValueOnce(result)
    await retryShot(tableId, 'fact-1', originProject())
    expect(bridge.deconstruct).toHaveBeenLastCalledWith(expect.objectContaining({ shotIndexes: [1], vision: { vendorKey: 'gem', modelKey: 'gem-flash' } }))
  })

  it('没选过：不发 vision（交给引擎自动挑，行为不变）', async () => {
    bridge.deconstruct.mockResolvedValue(result)
    await deconstructToShotTable(source(), originProject())
    expect(bridge.deconstruct.mock.calls[0][0]).not.toHaveProperty('vision')
  })
})
