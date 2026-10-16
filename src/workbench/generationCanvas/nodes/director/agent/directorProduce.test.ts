/**
 * 导演视图「出成片」（选项 A：只准备，不花钱）。走真画布 store、真 stage_shot 执行体（applyProposalBatch）、
 * 真预演写回（applyPreviewCaptured，与常驻 Host 同一个函数）、真挂接核心。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { applyProposalBatch } from '../../../agent/proposalTxn'
import { generationCanvasTools } from '../../../agent/generationCanvasTools'
import { useGenerationCanvasStore } from '../../../store/generationCanvasStore'
import { DIRECTOR_PREVIEW_META_KEY, DIRECTOR_PROJECT_META_KEY } from '../model/directorNodeMeta'
import { directorPreviewSpendBlock, directorProduceState, readDirectorPreview } from '../model/directorPreviewState'
import { createDefaultProject, normalizeDirectorProject } from '../model/directorProject'
import type { DirectorProject } from '../model/directorTypes'
import type { DirectorWriteDomainResult } from './applyDirectorWrite'
import { CAMERA_MOVE_ATTACHED_URL_KEY } from './attachCameraMoveToTarget'
import { applyPreviewCaptured, previewCapturePlan } from './directorPreviewCapture'
import { prepareProduceFromPreview } from './directorProduce'

const PLAN = {
  scene: { environment: 'day', template: 'room', tags: ['书房'] },
  actors: [
    { id: 'reader', kind: 'person', desc: '读者', placement: { relation: 'at', ref: 's1-room-floor' } },
    { id: 'friend', kind: 'person', desc: '朋友', placement: { relation: 'in_front_of', ref: 'reader' } },
  ],
  shots: [
    { id: 'wide', window: [0, 3], transitionIn: 'cut', subject: 'reader', size: '全景', angle: 'front', height: 'eye', move: { kind: 'static' } },
    { id: 'close', window: [3, 6], transitionIn: 'cut', subject: 'friend', size: '中景', angle: 'three_quarter', height: 'eye', move: { kind: 'push_in' } },
  ],
}
const URL_V1 = 'nomi-local://asset/p/preview-1.mp4'
const output = { id: 'out-1', name: 'preview-output', width: 1280, height: 720, duration: 6, createdAt: 1 }

const node = (id: string) => useGenerationCanvasStore.getState().nodes.find((candidate) => candidate.id === id)
const projectOf = (id: string): DirectorProject => normalizeDirectorProject(node(id)?.meta?.[DIRECTOR_PROJECT_META_KEY])

async function staged(withShot: boolean) {
  // seedance-2 有 video_ref 槽：预演应挂成参考视频
  const shot = withShot
    ? generationCanvasTools.create_nodes([{ kind: 'video', title: '镜头 1', prompt: '书房对话', position: { x: 0, y: 0 }, meta: { archetype: { id: 'seedance-2-apimart', modeId: 't2v' } } }])[0]
    : undefined
  const outcome = await applyProposalBatch([{ toolCallId: 'c1', toolName: 'create_director_plan', effectiveArgs: { operation: 'create_director_plan', ...(shot ? { shotNodeId: shot.id } : {}), plan: PLAN } as unknown as Record<string, unknown> }])
  if (outcome.status !== 'committed') throw new Error('stage failed')
  const result = outcome.results[0] as Extract<DirectorWriteDomainResult, { applied: true }>
  return { shotId: shot?.id, directorNodeId: result.directorNodeId, revision: result.revision }
}

/** 与常驻 Host 同一条路：按节点此刻的工程排采帧计划 → 落盘 → 写回 ready（带渲染源指纹）。 */
function renderPreview(directorNodeId: string, url = URL_V1): void {
  const plan = previewCapturePlan(node(directorNodeId)!)
  if (!plan) throw new Error('no capture plan')
  applyPreviewCaptured(directorNodeId, plan.revision, url, 'asset-preview', output, plan.sourceFingerprint)
}

beforeEach(() => {
  const state = useGenerationCanvasStore.getState()
  for (const item of [...state.nodes]) state.deleteNode(item.id)
})

describe('3D-BOX produce: prepare only, never spend', () => {
  it('a project without playable shots is blocked and writes nothing', () => {
    const [director] = generationCanvasTools.create_nodes([{ kind: 'director', title: 'D', prompt: '', position: { x: 0, y: 0 }, meta: { [DIRECTOR_PROJECT_META_KEY]: createDefaultProject('S') } }])
    const before = JSON.stringify(useGenerationCanvasStore.getState().nodes)
    expect(prepareProduceFromPreview(director.id, projectOf(director.id))).toEqual({ kind: 'blocked', reason: 'empty' })
    expect(JSON.stringify(useGenerationCanvasStore.getState().nodes)).toBe(before)
  })

  it('while the preview is still rendering it waits (no attach, no new node), and the shot stays behind the spend gate', async () => {
    const { shotId, directorNodeId } = await staged(true)
    const count = useGenerationCanvasStore.getState().nodes.length
    expect(prepareProduceFromPreview(directorNodeId, projectOf(directorNodeId))).toEqual({ kind: 'rendering' })
    expect(useGenerationCanvasStore.getState().nodes).toHaveLength(count)
    expect(directorPreviewSpendBlock(shotId!, useGenerationCanvasStore.getState().nodes)?.reason).toBe('rendering')
  })

  it('a fresh preview on a target shot: hands back that shot, already attached as reference video', async () => {
    const { shotId, directorNodeId } = await staged(true)
    renderPreview(directorNodeId)
    const outcome = prepareProduceFromPreview(directorNodeId, projectOf(directorNodeId))
    expect(outcome).toMatchObject({ kind: 'prepared', videoNodeId: shotId, created: false, attach: 'kept' })
    expect(node(shotId!)?.meta?.referenceVideoUrls).toEqual([URL_V1])
    expect(directorPreviewSpendBlock(shotId!, useGenerationCanvasStore.getState().nodes)).toBeNull()
  })

  it('a hand edit after the preview makes it stale: produce re-renders first instead of attaching the old preview', async () => {
    const { directorNodeId } = await staged(true)
    renderPreview(directorNodeId)
    const edited = projectOf(directorNodeId)
    edited.scenes[0].cameras[0].fov += 10
    expect(directorProduceState(readDirectorPreview(node(directorNodeId)), edited, 2)).toEqual({ kind: 'needs_render' })
    useGenerationCanvasStore.getState().updateNode(directorNodeId, { meta: { ...node(directorNodeId)!.meta, [DIRECTOR_PROJECT_META_KEY]: edited } })
    expect(prepareProduceFromPreview(directorNodeId, edited)).toEqual({ kind: 'rendering' })
    expect(readDirectorPreview(node(directorNodeId))?.status).toBe('rendering')
    // 渲染好（按改过的工程）→ 再点就是最新的
    renderPreview(directorNodeId, 'nomi-local://asset/p/preview-2.mp4')
    expect(prepareProduceFromPreview(directorNodeId, projectOf(directorNodeId))).toMatchObject({ kind: 'prepared', attach: 'kept' })
  })

  it('a standalone preview (no target shot) gets a new idle video node beside the director, with the preview attached and the gate pointed at it', async () => {
    const { directorNodeId } = await staged(false)
    // 独立预演建好时不渲染（没有要挂的镜头）：第一次点 = 请求渲染
    expect(readDirectorPreview(node(directorNodeId))).toBeNull()
    expect(prepareProduceFromPreview(directorNodeId, projectOf(directorNodeId))).toEqual({ kind: 'rendering' })
    renderPreview(directorNodeId)
    const outcome = prepareProduceFromPreview(directorNodeId, projectOf(directorNodeId))
    if (outcome.kind !== 'prepared') throw new Error(`expected prepared, got ${outcome.kind}`)
    expect(outcome.created).toBe(true)
    const video = node(outcome.videoNodeId)!
    expect(video.kind).toBe('video')
    expect(video.status ?? 'idle').not.toBe('running')
    expect(video.meta?.[CAMERA_MOVE_ATTACHED_URL_KEY]).toBe(URL_V1)
    expect(video.position.x).toBeGreaterThan(node(directorNodeId)!.position.x)
    expect(readDirectorPreview(node(directorNodeId))?.targetNodeId).toBe(video.id)
    // 连点：第二次不再建节点，也不重复挂
    const again = prepareProduceFromPreview(directorNodeId, projectOf(directorNodeId))
    expect(again).toMatchObject({ kind: 'prepared', videoNodeId: video.id, created: false, attach: 'kept' })
  })

  it('a preview that failed as too long stays blocked (shorten it first)', async () => {
    const { directorNodeId } = await staged(true)
    const preview = readDirectorPreview(node(directorNodeId))!
    useGenerationCanvasStore.getState().updateNode(directorNodeId, { meta: { ...node(directorNodeId)!.meta, [DIRECTOR_PREVIEW_META_KEY]: { ...preview, status: 'failed', reason: 'too_long' } } })
    expect(prepareProduceFromPreview(directorNodeId, projectOf(directorNodeId))).toEqual({ kind: 'blocked', reason: 'too_long' })
  })
})

describe('produce never reaches a spending door (same rule as quick-action derive, 2026-10-05)', () => {
  const FORBIDDEN = [
    'confirmAndRunNode', 'regenerateNodeInPlace', 'runGenerationNode', 'runGenerationNodesBatch',
    'mintSpendGrant', 'submitCanvasShotRun', 'createCanvasShotRuns', 'confirmGenerationSpend', 'runTask',
  ]
  const here = path.dirname(fileURLToPath(import.meta.url))
  const files = [path.join(here, 'directorProduce.ts'), path.join(here, '../panels/topbar/ProduceButton.tsx')]
  it.each(FORBIDDEN)('no %s in the produce path', (name) => {
    for (const file of files) {
      const code = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(code.includes(name), `${path.basename(file)} mentions ${name}`).toBe(false)
    }
  })
})
