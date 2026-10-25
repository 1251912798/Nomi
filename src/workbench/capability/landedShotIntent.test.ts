// 起草意图落到节点之后怎么跟着 Agent 改稿走（D2 第③步）：节点是唯一 owner，Agent 改稿只写它真改了的那几样，
// 用户在节点上改过、Agent 没碰的不动；起草钉住的参考落到节点上。走真 `materializeShots`（首次落地经 create_canvas_nodes
// 写边界，改稿经 landedShotIntent），模型清单用真档案（KIE Seedance 2：t2v / i2v / firstlast / omni 四个方式）。
//
// 反例（这一类会从哪回来）：有人把「整份重绑」加回来（档案默认 ⊕ 候选盖节点，2026-10-22 落地默认值核查）→ 第 1、2 条红；
// 落地线不带参考 / 渲染层不摆参考（2026-10-22 落地默认值核查）→ 第 5、6 条红。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { persistNowSpy } = vi.hoisted(() => ({ persistNowSpy: vi.fn(async () => null) }))
vi.mock('../project/workbenchProjectSession', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../project/workbenchProjectSession')>()),
  persistActiveWorkbenchProjectNow: persistNowSpy,
}))

vi.mock('../generationCanvas/agent/availableModels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../generationCanvas/agent/availableModels')>()
  return {
    ...actual,
    listAvailableModelsForAgent: vi.fn(async () => actual.buildAgentModelEntries([
      { value: 'bytedance/seedance-2', modelKey: 'bytedance/seedance-2', label: 'Seedance 2', vendor: 'kie', kind: 'video', meta: { archetypeId: 'seedance-2' } },
    ])),
  }
})

import { materializeShots, type MaterializeShotInput } from './multiShotCanvasLanding'
import { useGenerationCanvasStore } from '../generationCanvas/store/generationCanvasStore'
import { resetClientIdRegistry } from '../generationCanvas/agent/applyCanvasToolCall'
import { readReferenceList } from '../generationCanvas/nodes/controls/referenceList'
import { CANDIDATE_META_KEYS } from '../generationCanvas/agent/candidateNodeMeta'
import { createProjectSessionTestHarness, type ProjectSessionTestHarness } from '../project/projectSessionTestHarness'
import type { GenerationCanvasNode } from '../generationCanvas/model/generationCanvasTypes'
import type { LandedShotCandidate } from '../generationCanvas/agent/candidateNodeMeta'

const OPERATION_ID = 'canvas-landing:run-intent'
const REF_A = 'nomi-local://asset/project-a/assets/ref-a.png'
const REF_B = 'nomi-local://asset/project-a/assets/ref-b.png'

function shot(revision: number, candidate: Partial<LandedShotCandidate> = {}, extra: Partial<MaterializeShotInput> = {}): MaterializeShotInput {
  return {
    shotId: 'shot-1', role: 'shot', kind: 'video', title: '镜头 1', prompt: '雨夜街口',
    candidate: { candidateId: 'candidate-1', revision, vendor: 'kie', modelKey: 'bytedance/seedance-2', modeId: 't2v', mode: 'text_to_video', ...candidate },
    ...extra,
  }
}

const land = (shots: MaterializeShotInput[]) => materializeShots({ materializationOperationId: OPERATION_ID, runId: 'run-intent', shots })

function landedNode(): GenerationCanvasNode {
  const node = useGenerationCanvasStore.getState().nodes
    .find((candidate) => (candidate.meta as Record<string, unknown> | undefined)?.materializationOperationId === OPERATION_ID)
  if (!node) throw new Error('landed node missing')
  return node
}

const metaOf = (node: GenerationCanvasNode) => (node.meta ?? {}) as Record<string, unknown>

/** 用户在节点上改一个参数（生成框那条写口同样只改 meta）。 */
function userSets(key: string, value: unknown): void {
  const node = landedNode()
  useGenerationCanvasStore.getState().updateNode(node.id, { meta: { ...metaOf(node), [key]: value } })
}

describe('Agent 改稿只写它真改了的那几样（节点是唯一 owner）', () => {
  let landingProject: ProjectSessionTestHarness
  beforeEach(async () => {
    landingProject = createProjectSessionTestHarness()
    await landingProject.open('project-a')
    resetClientIdRegistry()
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [] })
  })
  afterEach(() => landingProject.dispose())

  it('1. 用户在节点上改了时长，Agent 只改提示词 → 时长留着，提示词换新', async () => {
    await land([shot(1)])
    userSets('duration', 10)
    await land([shot(2, {}, { prompt: '逆光下的侧脸' })])
    const node = landedNode()
    expect(metaOf(node).duration).toBe(10)
    expect(node.prompt).toBe('逆光下的侧脸')
    expect(metaOf(node)[CANDIDATE_META_KEYS.candidateRevision]).toBe(2)
  })

  it('2. Agent 写过的时长没变、用户改了它，Agent 又改了别的参数 → 用户的时长不被冲回 Agent 的旧值', async () => {
    await land([shot(1, { parameters: { duration: 5 } })])
    userSets('duration', 12)
    userSets('generate_audio', false)
    await land([shot(2, { parameters: { duration: 5, resolution: '1080p' } })])
    const meta = metaOf(landedNode())
    expect(meta.duration).toBe(12)
    expect(meta.generate_audio).toBe(false)
    expect(meta.resolution).toBe('1080p')
  })

  it('3. Agent 把它写过的参数改了 → 节点跟过去（用户改过也以 Agent 这一次为准）', async () => {
    await land([shot(1, { parameters: { duration: 5 } })])
    userSets('duration', 12)
    await land([shot(2, { parameters: { duration: 8 } })])
    expect(metaOf(landedNode()).duration).toBe(8)
  })

  it('4. Agent 删掉它写过的参数 → 回到档案默认', async () => {
    await land([shot(1, { parameters: { duration: 9 } })])
    expect(metaOf(landedNode()).duration).toBe(9)
    await land([shot(2, { parameters: {} })])
    expect(metaOf(landedNode()).duration).toBe(5)
  })

  it('同一 revision 的重放一个字不动（打开项目补齐不覆盖用户手改）', async () => {
    await land([shot(1, { parameters: { duration: 5 } })])
    userSets('duration', 12)
    await land([shot(1, { parameters: { duration: 8 } })])
    expect(metaOf(landedNode()).duration).toBe(12)
  })

  it('5. 起草钉住的参考落到节点上：参考图进节点参考列表，方式对齐到收得下它的那一个（不是停在文生）', async () => {
    await land([shot(1, { references: [{ url: REF_A, kind: 'image', role: 'reference' }] })])
    const meta = metaOf(landedNode())
    expect(readReferenceList(meta)).toContain(REF_A)
    expect((meta.archetype as { modeId?: string }).modeId).not.toBe('t2v')
  })

  it('5b. 参考就是画布上某个节点出的图 → 连一条真边，不把地址抄进槽里', async () => {
    const source = useGenerationCanvasStore.getState().addNode({ kind: 'image', title: '角色' })
    useGenerationCanvasStore.getState().addNodeResult(source.id, { id: 'r1', type: 'image', url: REF_A, createdAt: 1 })
    await land([shot(1, { references: [{ url: REF_A, kind: 'image', role: 'reference' }] })])
    const node = landedNode()
    expect(useGenerationCanvasStore.getState().edges.some((edge) => edge.source === source.id && edge.target === node.id)).toBe(true)
    expect(readReferenceList(metaOf(node))).not.toContain(REF_A)
  })

  it('6. Agent 改稿加一张、删一张参考 → 节点上增删同一张；用户自己加的那张不动', async () => {
    await land([shot(1, { modeId: 'omni', references: [{ url: REF_A, kind: 'image', role: 'reference' }] })])
    const userRef = 'nomi-local://asset/project-a/assets/user.png'
    const before = metaOf(landedNode())
    useGenerationCanvasStore.getState().updateNode(landedNode().id, { meta: { ...before, referenceImageUrls: [...readReferenceList(before), userRef] } })
    await land([shot(2, { modeId: 'omni', references: [{ url: REF_B, kind: 'image', role: 'reference' }] })])
    const list = readReferenceList(metaOf(landedNode()))
    expect(list).toContain(REF_B)
    expect(list).toContain(userRef)
    expect(list).not.toContain(REF_A)
  })

  it('7. 这一版之前落的节点（没有指纹）：Agent 写出来的那几样照写，起草从没写过的参数不碰', async () => {
    await land([shot(1, { parameters: { duration: 5 } })])
    const node = landedNode()
    const { [CANDIDATE_META_KEYS.candidateIntent]: _dropped, ...legacy } = metaOf(node)
    useGenerationCanvasStore.getState().updateNode(node.id, { meta: { ...legacy, generate_audio: false } })
    await land([shot(2, { parameters: { duration: 7 } })])
    const meta = metaOf(landedNode())
    expect(meta.duration).toBe(7)
    expect(meta.generate_audio).toBe(false)
  })
})
