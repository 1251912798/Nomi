import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGenerationCanvasStore } from '../../store/generationCanvasStore'
import { abandonPendingCanvasWrite } from '../../events/canvasWriteBoundary'
import { readShotTable } from '../../../../../electron/shared/canvas/shotTable'
import { deconstructToShotTable, ensureDeconstructionShotTable } from './factBridge'
import { editShotTableFacts } from './shotTableActions'
import { lastDeconstructModelChoice } from './shotTableModelChoice'

// 2026-10-18 拆解前选模型：拆解表改成「先建表、再拆」，读图 / 转写在拆解栏里选，默认取这个项目上次拆解选过的。
// 设计卡：docs/plan/2026-10-18-shot-table-node.md。

const bridge = vi.hoisted(() => ({ deconstruct: vi.fn(), onDeconstructionProgress: vi.fn(() => vi.fn()) }))
vi.mock('../../../../desktop/bridge', () => ({ getDesktopBridge: () => ({ video: bridge }) }))

const result = { shots: [], durationSeconds: 2, hasAudio: true, failedShotIndexes: [], cutCoverage: undefined } as never
const gem = { vendorKey: 'apimart', modelKey: 'gemini-3.5-flash' }
const whisper = { vendorKey: 'local-speech', modelKey: 'whisper-large-v3-turbo' }

function originProject() {
  const controller = new AbortController()
  return { binding: { projectId: 'p', immutableProjectUuid: 'uuid', projectGeneration: 1 }, signal: controller.signal, assertCurrent() { /* 当前 */ } }
}

function video(title = 'Ref'): string {
  const node = useGenerationCanvasStore.getState().addNode({ kind: 'video', title, position: { x: 0, y: 0 }, meta: {} })
  useGenerationCanvasStore.getState().updateNode(node.id, { result: { id: `r-${node.id}`, type: 'video', url: `nomi-local://p/${node.id}.mp4`, createdAt: 1 } })
  return node.id
}

function tableOf(id: string) {
  return readShotTable(useGenerationCanvasStore.getState().nodes.find((node) => node.id === id)?.meta)!
}

beforeEach(() => {
  abandonPendingCanvasWrite()
  bridge.deconstruct.mockReset()
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [], selectedNodeIds: [] })
})

describe('先建表、再拆', () => {
  it('建表不发任何拆解调用：表是待拆（idle）并被选中', () => {
    const tableId = ensureDeconstructionShotTable(video())!
    expect(bridge.deconstruct).not.toHaveBeenCalled()
    expect(tableOf(tableId).source.status).toBe('idle')
    expect(useGenerationCanvasStore.getState().selectedNodeIds).toEqual([tableId])
  })
})

describe('默认取这个项目上次拆解选过的模型', () => {
  it('新表带上最近一张表的读图 / 转写选择', () => {
    const first = ensureDeconstructionShotTable(video('A'))!
    editShotTableFacts(first, (table) => ({ ...table, source: { ...table.source, visionModel: gem, transcribeModel: whisper } }))
    const second = ensureDeconstructionShotTable(video('B'))!
    expect(tableOf(second).source.visionModel).toEqual(gem)
    expect(tableOf(second).source.transcribeModel).toEqual(whisper)
  })

  it('两条腿各取各自最近一次有值的；没选过 = 不写（自动挑）', () => {
    const older = ensureDeconstructionShotTable(video('A'))!
    editShotTableFacts(older, (table) => ({ ...table, updatedAt: '2026-10-01T00:00:00.000Z', source: { ...table.source, transcribeModel: whisper } }))
    const newer = ensureDeconstructionShotTable(video('B'))!
    editShotTableFacts(newer, (table) => ({ ...table, source: { ...table.source, visionModel: gem } }))
    const choice = lastDeconstructModelChoice(useGenerationCanvasStore.getState().nodes)
    expect(choice).toEqual({ visionModel: gem, transcribeModel: whisper })
    expect(lastDeconstructModelChoice([])).toEqual({})
  })
})

describe('转写腿的选择记在表上', () => {
  it('整表拆解把 source.transcribeModel 作为 payload.transcribe 发给引擎', async () => {
    bridge.deconstruct.mockResolvedValue(result)
    const sourceId = video()
    const tableId = ensureDeconstructionShotTable(sourceId)!
    editShotTableFacts(tableId, (table) => ({ ...table, source: { ...table.source, transcribeModel: whisper } }))
    await deconstructToShotTable(sourceId, originProject())
    expect(bridge.deconstruct).toHaveBeenCalledWith(expect.objectContaining({ transcribe: whisper }))
  })

  it('「改用云端」是显式的这一次：盖过表上的选择，且不改写它', async () => {
    bridge.deconstruct.mockResolvedValue(result)
    const sourceId = video()
    const tableId = ensureDeconstructionShotTable(sourceId)!
    editShotTableFacts(tableId, (table) => ({ ...table, source: { ...table.source, transcribeModel: whisper } }))
    await deconstructToShotTable(sourceId, originProject(), 'cloud')
    expect(bridge.deconstruct).toHaveBeenCalledWith(expect.objectContaining({ transcribe: 'cloud' }))
    expect(tableOf(tableId).source.transcribeModel).toEqual(whisper)
  })

  it('没选过：不发 transcribe（交给引擎自动挑）', async () => {
    bridge.deconstruct.mockResolvedValue(result)
    await deconstructToShotTable(video(), originProject())
    expect(bridge.deconstruct.mock.calls[0][0]).not.toHaveProperty('transcribe')
  })
})

describe('表上的视图设置', () => {
  it('行高随项目保存，老表读回来没有就是标准', () => {
    const tableId = ensureDeconstructionShotTable(video())!
    expect(tableOf(tableId).view.rowHeight).toBeUndefined()
    editShotTableFacts(tableId, (table) => ({ ...table, view: { ...table.view, rowHeight: 'large' } }))
    expect(tableOf(tableId).view.rowHeight).toBe('large')
  })
})
