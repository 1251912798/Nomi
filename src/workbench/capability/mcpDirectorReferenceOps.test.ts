// 对外 MCP 的摆位参考 / 运镜参考在渲染端这一跳：主进程路由过来的请求（electron/capabilityCore/mcpDirectorReferenceOps.sdk.test.ts
// 用官方 SDK 钉住了前半程）进 executeCanonicalCanvasPlanPatch → 正常的准入 → 提议事务 → 收据，在画布上真建出导演节点
// （3D-BOX 是唯一的导演台，打开即进新导演台），导演工程能被编辑器载入。只替身「项目落盘」那一步。
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SurfacePortWireError } from '../../../electron/shared/surfacePortBinding'
import { executeCanonicalCanvasPlanPatch } from './canonicalCanvasPlanPatch'
import type { ProjectExecutionContext } from '../project/projectCanvasReadSurface'
import { generationCanvasTools } from '../generationCanvas/agent/generationCanvasTools'
import { useGenerationCanvasStore } from '../generationCanvas/store/generationCanvasStore'
import { DIRECTOR_PROJECT_META_KEY } from '../generationCanvas/nodes/director/model/directorNodeMeta'
import { createDirectorStore } from '../generationCanvas/nodes/director/model/directorStore'
import { abandonPendingCanvasWrite } from '../generationCanvas/events/canvasWriteBoundary'
import { __resetCanvasUndoJournalForTests } from '../generationCanvas/events/canvasUndoJournal'
import { resetClientIdRegistry } from '../generationCanvas/agent/applyCanvasToolCall'

// 收据存储在主进程（IPC）；这里换成记账的替身，同 canvasWriteTarget.integration.test.ts。
const receipts = vi.hoisted(() => ({ commits: [] as unknown[] }))
vi.mock('../generationCanvas/agent/proposalUndo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../generationCanvas/agent/proposalUndo')>()
  return {
    ...actual,
    createProposalReceiptCoordinator() {
      return {
        async prepare() { return true },
        async commit(input: unknown) { receipts.commits.push(input); return true },
        async abort() {},
        async disposition() { return 'committed' as const },
      }
    },
  }
})

vi.mock('../project/workbenchProjectSession', () => ({
  persistActiveWorkbenchProjectNow: vi.fn(async () => ({ id: 'project-a', revision: 2, version: 1 })),
  waitForActiveWorkbenchProjectSaveTarget: vi.fn(() => true),
}))

const loaded: ProjectExecutionContext = {
  binding: { projectId: 'project-a', immutableProjectUuid: '11111111-1111-4111-8111-111111111111', projectGeneration: 1 },
  signal: new AbortController().signal,
  assertCurrent() {},
}

function hostRequest(input: Record<string, unknown>, suffix: string) {
  return {
    projectId: 'project-a',
    input,
    receiptProposalId: `mcp-canvas:${String(input.operation)}:${suffix}`,
    approvalId: `mcp-canvas-approval:${String(input.operation)}:${suffix}`,
    loaded,
  }
}

const directors = () => useGenerationCanvasStore.getState().nodes.filter((node) => node.kind === 'director')

function loadsInEditor(nodeId: string): number {
  const node = useGenerationCanvasStore.getState().nodes.find((candidate) => candidate.id === nodeId)
  const scene = createDirectorStore({ rawProject: node?.meta?.[DIRECTOR_PROJECT_META_KEY], defaultSceneName: 'scene' }).getState().activeScene()
  return scene.objects.length + scene.cameras.length
}

beforeEach(() => {
  abandonPendingCanvasWrite()
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], selectedNodeIds: [], groups: [] })
  __resetCanvasUndoJournalForTests()
  resetClientIdRegistry()
  receipts.commits = []
})

describe('MCP director reference operations in the renderer', () => {
  it('create_camera_move lands a director node bound to the target video shot', async () => {
    const [shot] = generationCanvasTools.create_nodes([{ kind: 'video', title: '镜头 1', prompt: 'p', position: { x: 0, y: 0 } }])
    const result = await executeCanonicalCanvasPlanPatch(hostRequest({ operation: 'create_camera_move', shotClientId: shot.id, move: 'push_in' }, 'camera'))
    expect(result).toMatchObject({ applied: true, operation: 'create_camera_move' })
    expect(receipts.commits).toHaveLength(1)
    const [director] = directors()
    expect(director).toBeTruthy()
    expect(director.meta?.cameraMoveAutoCapture).toMatchObject({ targetNodeId: shot.id, move: 'push_in' })
    expect(loadsInEditor(director.id)).toBeGreaterThan(0)
  })

  it('create_staging_reference lands a director node with the staged characters', async () => {
    const [frame] = generationCanvasTools.create_nodes([{ kind: 'image', title: '关键帧', prompt: 'p', position: { x: 0, y: 0 } }])
    const result = await executeCanonicalCanvasPlanPatch(hostRequest({ operation: 'create_staging_reference', shotClientId: frame.id, characters: [{ name: 'A' }, { name: 'B' }], layout: 'facing' }, 'staging'))
    expect(result).toMatchObject({ applied: true, operation: 'create_staging_reference' })
    const [director] = directors()
    expect(director).toBeTruthy()
    expect(loadsInEditor(director.id)).toBeGreaterThan(0)
  })

  it('still refuses canvas writes the main process does not route here', async () => {
    await expect(executeCanonicalCanvasPlanPatch(hostRequest({ operation: 'tidy_canvas' }, 'tidy'))).rejects.toMatchObject({ code: 'capability_input_invalid' } satisfies Partial<SurfacePortWireError>)
    expect(directors()).toHaveLength(0)
  })
})
