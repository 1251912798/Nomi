#!/usr/bin/env node
// 真实付费核对 · 3D-BOX「出成片」的预演参考真的随付费请求走、真的被采用（I-3d-ref）。**只写脚本，由协调来跑。**
//
//   NOMI_SPEND_OK=1 APIMART_API_KEY=<key，只从环境读> node tests/ux/director-reference-attach.paid.mjs [--packaged <Nomi 可执行文件的绝对路径>]
//
// 免费的那一半（tests/ux/director-reference-attach.walk.mjs）已经证明：隔离 Electron + 本机假上游上，请求体里有预演参考、
// 编号对。它证不到的只有两件：①真供应商收下这条参考视频并按它的运镜出片；②提示词里 `@video1` 这种写法真模型照着找片。
// 所以这里只花**一条**视频：Seedance 2.0 fast · 480p · 4 秒 · 无音频（_agentVideoPaid.mjs 里被授权的最便宜一档），
// 参考 = 本机合成的 4 秒预演（灰色人偶，没有任何真实素材；预演 mp4 会经应用的托管上传通道交给供应商，
// 这是这类付费参考的正常路径，确认框里的托管披露按「生成」同意即可）。
//
// 一次付费 = 一次花钱前的整套核对（任何一项不成立就一分钱不花）：
//   ① 节点模型 / 参数就是被授权那一档（cheapVideoNodeProblems）；
//   ② 预演是对当前工程渲的、已就绪、挂在这个镜头上（节点 meta：referenceVideoUrls 含预演；提示词有引用标记，不是写死的 @Video1）；
//   ③ 预演时长 = 镜头时长（4 秒），不会被付费闸的 duration_mismatch 拦下。
// 花钱后：节点恰好一次提交、结果带供应商任务号、落地的 mp4 用 ffprobe 量过；证据目录里留着：预演 mp4 路径、成片路径、截图，
// 供协调**肉眼对比**「成片的运镜是不是照预演」（这一步是人判，脚本不判画面）。
//
// 凭据与护栏：全部走 tests/ux/_paidRun.mjs 的 openPaidWalk（CI 拒跑、没有 NOMI_SPEND_OK=1 拒跑、构建产物过期拒跑、
// 出网只放行授权供应商、跑完删凭据副本）；key 只从环境变量读，不进报告 / 日志 / 截图。
import { clickOrFail, expect, proveProbe } from './_assert.mjs'
import { SPEND_DIALOG, openPaidWalk } from './_paidRun.mjs'
import { VIDEO, cheapVideoNodeProblems, probeLandedMedia } from './_agentVideoPaid.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { openCanvas, readProject } from './agent-runtime-walk-support.mjs'
import { require as tsxRequire } from 'tsx/cjs/api'

const SCRIPT = 'director-reference-attach.paid.mjs'
// 4 秒两镜预演（与节点上的 4 秒时长一致）。
const PLAN = {
  scene: { environment: 'day', template: 'room', tags: ['书房'] },
  actors: [
    { id: 'reader', kind: 'person', desc: '读者', placement: { relation: 'at', ref: 's1-room-floor' } },
    { id: 'friend', kind: 'person', desc: '朋友', placement: { relation: 'in_front_of', ref: 'reader' } },
  ],
  shots: [
    { id: 'wide', window: [0, 2], transitionIn: 'cut', subject: 'reader', size: '全景', angle: 'front', height: 'eye', move: { kind: 'static' } },
    { id: 'close', window: [2, 4], transitionIn: 'cut', subject: 'friend', size: '中景', angle: 'three_quarter', height: 'eye', move: { kind: 'push_in' } },
  ],
}
const { compileDirectorPlan } = tsxRequire('../../src/workbench/generationCanvas/nodes/director/model/compiler/directorPlanCompiler.ts', import.meta.url)
const compiled = compileDirectorPlan(PLAN)
if (!compiled.ok) throw new Error(`计划编译失败：${compiled.errors.join('; ')}`)
// 节点按被授权的那一档建：fast 变体，480p，4 秒，无音频。
const SHOT_META = {
  modelKey: VIDEO.modelKey, modelVendor: VIDEO.vendorKey, vendor: VIDEO.vendorKey,
  archetype: { id: 'seedance-2-apimart', modeId: 't2v', variantId: 'fast' },
  duration: 4, resolution: '480p', generate_audio: false,
}
const VIDEO_LANDS_MS = stationTimeout({ turns: 4 })
const NODE_GENERATE = 'button[data-bar-segment="generate"]'

const paid = await openPaidWalk(SCRIPT, 'director-reference-attach', [VIDEO])
const { walk } = paid
let failure
try {
  const { win } = await walk.start({ first: true })
  await win.evaluate(() => window.localStorage.setItem('__nomiE2E', '1'))
  await win.reload({ waitUntil: 'domcontentloaded' })
  await paid.lockToAuthorizedModels(win)
  const { projectId, projectRoot } = await walk.newProject()
  await openCanvas(win)
  await win.waitForFunction(() => Boolean(window.__nomiCanvasStore), null, { timeout: stationTimeout({ operations: 2 }) })

  // 导演节点（带编译好的工程，预演指向镜头）+ 一个按被授权那一档建好的视频镜头。预演是 stage_shot 写下的同一份 meta。
  const ids = await win.evaluate(({ directorProject, shotMeta }) => {
    const state = window.__nomiCanvasStore.getState()
    const director = state.addNode({ kind: 'director', title: '书房预演', prompt: '', position: { x: 0, y: 0 }, select: false })
    const shot = state.addNode({ kind: 'video', title: '书房对话', prompt: '书房里两人对话，镜头跟随人物，写实', position: { x: 200, y: 0 }, select: false, meta: shotMeta })
    window.__nomiCanvasStore.getState().updateNode(director.id, {
      meta: { ...director.meta, directorProject, directorPreview: { status: 'rendering', revision: 'manual:paid-1', targetNodeId: shot.id, updatedAt: Date.now() } },
    })
    return { director: director.id, shot: shot.id }
  }, { directorProject: compiled.project, shotMeta: SHOT_META })

  const nodeOnDisk = async (id) => ((await readProject(win, projectId)).payload.generationCanvas.nodes ?? []).find((node) => node.id === id)
  const storeNode = (id) => win.evaluate((nodeId) => window.__nomiCanvasStore.getState().nodes.find((node) => node.id === nodeId) ?? null, id)

  // 常驻 Host 离屏渲染整段预演（本机、免费）→ 写回 ready。
  await expect.poll(async () => (await storeNode(ids.director))?.meta?.directorPreview?.status, { message: '预演渲染完成（ready）', timeout: stationTimeout({ turns: 1 }) }).toBe('ready')
  const preview = (await storeNode(ids.director)).meta.directorPreview

  // 进导演台点「出成片」（与真人同一条路）→ 回画布选中视频镜头。
  await win.evaluate((id) => window.dispatchEvent(new CustomEvent('nomi-focus-generation-node', { detail: { nodeId: id } })), ids.director)
  const open = win.locator('[data-testid="director-node-open"]').first()
  await open.waitFor({ state: 'attached', timeout: stationTimeout({ operations: 2 }) })
  await open.evaluate((element) => element.click())
  await win.locator('[data-testid="director-editor"]').waitFor({ timeout: stationTimeout({ operations: 4 }) })
  await win.waitForTimeout(1500)
  await clickOrFail(win.locator('[data-testid="director-produce-main"]'), '导演视图「出成片」')
  await expect.poll(() => win.evaluate((id) => !document.querySelector('[data-testid="director-editor"]') && window.__nomiCanvasStore.getState().selectedNodeIds.includes(id), ids.shot), { message: '回到画布并选中视频镜头', timeout: stationTimeout({ operations: 2 }) }).toBe(true)

  // ── 花钱之前的整套核对：任何一项不成立就停（一分钱没花）──
  const shot = await storeNode(ids.shot)
  const problems = [...cheapVideoNodeProblems(shot.meta)]
  const refs = Array.isArray(shot.meta?.referenceVideoUrls) ? shot.meta.referenceVideoUrls : []
  if (!refs.includes(preview.videoUrl)) problems.push(`镜头没带上预演参考：referenceVideoUrls=${JSON.stringify(refs)}`)
  if (!/@\[asset:[^\]]+\]/.test(shot.prompt ?? '')) problems.push('提示词里没有预演的引用标记')
  if (/@Video1/.test(shot.prompt ?? '')) problems.push('提示词里还有写死的 @Video1')
  if (Math.abs((preview.durationSeconds ?? 0) - 4) > 0.5) problems.push(`预演时长 ${preview.durationSeconds} 秒，与镜头 4 秒不符`)
  if (problems.length) throw new Error(`花钱前核对没过（一分钱没花）：\n  ${problems.join('\n  ')}`)
  await walk.snap('01-zh-before-spend-reference-attached')
  walk.report.preCheck = { previewUrl: preview.videoUrl, previewSeconds: preview.durationSeconds, referenceVideoUrls: refs, promptHasMention: true }

  // ── 花钱：按节点 ↑（托管披露确认框出现就按「生成」同意）──
  await clickOrFail(win.locator(`[data-node-id="${ids.shot}"] ${NODE_GENERATE}`).first(), '节点底栏的 ↑（生成）', { noWaitAfter: true })
  const dialog = win.locator(SPEND_DIALOG)
  if (await dialog.first().isVisible({ timeout: 8000 }).catch(() => false)) {
    await proveProbe(dialog, '付费 / 托管披露确认框')
    await walk.snap('02-zh-confirm-dialog')
    await clickOrFail(dialog.locator('[data-spend-confirm-action="confirm"]'), '确认框「生成」', { noWaitAfter: true })
  }
  await expect.poll(async () => (await nodeOnDisk(ids.shot))?.result?.url ?? '', { message: '成片落在这个镜头上', timeout: VIDEO_LANDS_MS }).toMatch(/^nomi-local:\/\//)
  const done = await nodeOnDisk(ids.shot)
  expect(done.runs?.length, '镜头恰好一次提交').toBe(1)
  expect(done.runs[0].status, '那一次提交成功').toBe('success')
  expect(Boolean(done.result?.taskId), '结果带着供应商任务号').toBe(true)
  const landed = await probeLandedMedia(projectRoot, projectId, done.result.url)
  walk.report.landed = { url: done.result.url, bytes: landed.bytes, probe: landed.probe, previewUrl: preview.videoUrl, note: '成片与预演放在一起肉眼对比：运镜是不是照预演（脚本不判画面）' }
  expect(landed.probe.duration ?? 0, '成片是一段真视频（ffprobe 量出时长）').toBeGreaterThan(1)
  await walk.snap('03-zh-result-landed')
  walk.report.verified = ['preview-reference-attached-before-spend', 'one-provider-task', 'result-landed-and-probed']
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await paid.finish(failure)
}
