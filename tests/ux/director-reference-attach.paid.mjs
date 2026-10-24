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
// 探测模式（NOMI_PAID_PROBE_DIALOG=1，协调 10-22 加）：供应商的源不进放行名单，所以就算哪天托管策略变成「允许」、点 ↑ 直接提交，网络闸也会当场挡下，结构上花不了钱。
// 注意：用环境变量里的 key 接入时，接入页若要验证 key 会真调一次模型（几个 token）；探测模式下这次调用会被网络闸挡下，走查当场失败并点名被挡的主机——遇到就改回正常放行。
// 所以「零」指的是**生成花费**，不是「一次供应商调用都没有」（正常模式下接入验证本来就可能调一次，几个 token）。
// 照常走到点 ↑，然后只量「从点击到确认框可见」多少毫秒（最多等 3 分钟），
// 每 5 秒截一张图、读一次节点状态 / 按钮是否禁用 / 按钮中心点此刻被哪个元素盖着；框出现后截图、点「取消」、退出。**绝不点生成。**
//
// 凭据与护栏：全部走 tests/ux/_paidRun.mjs 的 openPaidWalk（CI 拒跑、没有 NOMI_SPEND_OK=1 拒跑、构建产物过期拒跑、
// 出网只放行授权供应商、跑完删凭据副本）；key 只从环境变量读，不进报告 / 日志 / 截图。
import fs from 'node:fs'
import path from 'node:path'
import { clickOrFail, expect, proveProbe } from './_assert.mjs'
import { SPEND_DIALOG, openPaidWalk } from './_paidRun.mjs'
import { VIDEO, cheapVideoNodeProblems, probeLandedMedia } from './_agentVideoPaid.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { bringButtonIntoReach, readButtonReach } from './_generateReach.mjs'
import { openCanvas, readProject } from './agent-runtime-walk-support.mjs'
import { require as tsxRequire } from 'tsx/cjs/api'

const SCRIPT = 'director-reference-attach.paid.mjs'
// 第 4 轮产物标记：协调抽样必须确认这份脚本对应拆分后的“预演未挂上”原因。
const ROUND4_SPEND_GATE_MARKER = 'director.agent.spendBlockedNotAttached'
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

const paid = await openPaidWalk(SCRIPT, 'director-reference-attach', [VIDEO], { hostedUploads: true, vendorNetwork: process.env.NOMI_PAID_PROBE_DIALOG !== '1' }) // 预演 mp4 要先经应用的托管上传中转：放行当前配置的那一个中转源（report.json 的 hostedUploadRelayAllowed）
const { walk } = paid
walk.report.round4SpendGateMarker = ROUND4_SPEND_GATE_MARKER
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
  await expect.poll(() => win.locator('[data-testid="director-produce-main"]').isEnabled().catch(() => false), { message: '「出成片」可点', timeout: stationTimeout({ turns: 1 }) }).toBe(true)
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
  // 媒体在隔离副本删除之前拷进证据目录（工作树 .tmp/ 下，不进仓库）：协调要肉眼对比成片运镜是不是跟随预演（上次两个文件随副本删掉了）
  const keepMedia = async (url, name) => {
    const { filePath } = await probeLandedMedia(projectRoot, projectId, url)
    const target = path.join(walk.report.outputDir, name)
    fs.copyFileSync(filePath, target)
    return target
  }
  walk.report.keptPreviewMp4 = await keepMedia(preview.videoUrl, 'preview.mp4')
  await walk.snap('01-zh-before-spend-reference-attached')
  walk.report.preCheck = { previewUrl: preview.videoUrl, previewSeconds: preview.durationSeconds, referenceVideoUrls: refs, promptHasMention: true }

  // ── 花钱：按节点 ↑（托管披露确认框出现就按「生成」同意）──
  const generateButton = win.locator(`[data-node-id="${ids.shot}"] ${NODE_GENERATE}`).first()
  const readButtonState = () => readButtonReach(generateButton)
  // 出成片后画布对焦放大到 200% 以上，↑ 会掉出视口或被盖住：先用画布自己的控件调到点得到，点不到就报错（探测模式也走这一步）
  walk.report.generateButtonBeforeClick = await bringButtonIntoReach(win, generateButton, '节点底栏的 ↑')
  const clickedAt = Date.now()
  await clickOrFail(generateButton, '节点底栏的 ↑（生成）', { noWaitAfter: true })
  walk.report.generateButtonAfterClick = await readButtonState()
  const dialog = win.locator(SPEND_DIALOG)
  if (process.env.NOMI_PAID_PROBE_DIALOG === '1') {
    // 探测：最多等 3 分钟，只看、只截图、只取消。
    const PROBE_MS = 180_000
    const samples = []
    let dialogMs = null
    let lastShot = 0
    while (Date.now() - clickedAt < PROBE_MS) {
      if (await dialog.first().isVisible().catch(() => false)) { dialogMs = Date.now() - clickedAt; break }
      if (Date.now() - lastShot >= 5000) {
        lastShot = Date.now()
        const nodeNow = await storeNode(ids.shot)
        samples.push({ afterMs: Date.now() - clickedAt, status: nodeNow?.status ?? null, runs: nodeNow?.runs?.length ?? 0, button: await readButtonState() })
        await walk.snap(`probe-${String(samples.length).padStart(2, '0')}-${Math.round((Date.now() - clickedAt) / 1000)}s`)
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    walk.report.probe = { mode: 'dialog-latency', dialogMs, samples, note: dialogMs === null ? '3 分钟内确认框没出现' : '确认框出现；已点取消，没点生成' }
    if (dialogMs === null) throw new Error(`探测：点 ↑ 之后 ${PROBE_MS / 1000} 秒内确认框一直没出现（见 probe-*.png 与 report.json 的 probe.samples）`)
    await walk.snap('probe-dialog-visible')
    await clickOrFail(dialog.locator('[data-spend-confirm-action="cancel"]'), '确认框「取消」（探测模式绝不点生成）', { noWaitAfter: true })
    await dialog.first().waitFor({ state: 'hidden', timeout: stationTimeout({ operations: 1 }) })
    const runsAfterCancel = (await nodeOnDisk(ids.shot))?.runs?.length ?? 0
    if (runsAfterCancel > 0) throw new Error(`探测模式取消之后镜头上有 ${runsAfterCancel} 条提交记录（不该有）`)
    walk.report.verified = ['probe-dialog-latency']
  } else {
  // 真正的等待：Playwright 的 isVisible 不等待、会忽略 timeout，框晚几百毫秒出现就被当成「没有框」（协调 10-22 实跑踩到）。
  if (await dialog.first().waitFor({ state: 'visible', timeout: stationTimeout({ operations: 1 }) }).then(() => true).catch(() => false)) {
    await proveProbe(dialog, '付费 / 托管披露确认框')
    await walk.snap('02-zh-confirm-dialog')
    await clickOrFail(dialog.locator('[data-spend-confirm-action="confirm"]'), '确认框「生成」', { noWaitAfter: true })
  }
  // 快速失败：点了 ↑（并按过确认）之后 30 秒内这个镜头必须有新的提交记录，没有就当场报错，不空等成片。
  let submitted = false
  const submitDeadline = Date.now() + stationTimeout({ operations: 2 })
  while (!submitted && Date.now() < submitDeadline) {
    submitted = ((await nodeOnDisk(ids.shot))?.runs?.length ?? 0) > 0
    if (!submitted) await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  if (!submitted) {
    await walk.snap('fail-no-submission')
    throw new Error('点了生成但没有提交：30 秒内这个镜头没有出现提交记录（确认框是否还开着、按钮是否被禁用见 fail-no-submission 截图）')
  }
  await expect.poll(async () => (await nodeOnDisk(ids.shot))?.result?.url ?? '', { message: '成片落在这个镜头上', timeout: VIDEO_LANDS_MS }).toMatch(/^nomi-local:\/\//)
  const done = await nodeOnDisk(ids.shot)
  expect(done.runs?.length, '镜头恰好一次提交').toBe(1)
  expect(done.runs[0].status, '那一次提交成功').toBe('success')
  expect(Boolean(done.result?.taskId), '结果带着供应商任务号').toBe(true)
  const landed = await probeLandedMedia(projectRoot, projectId, done.result.url)
  walk.report.landed = { url: done.result.url, bytes: landed.bytes, probe: landed.probe, previewUrl: preview.videoUrl, note: '成片与预演放在一起肉眼对比：运镜是不是照预演（脚本不判画面）' }
  expect(landed.probe.durationSeconds ?? 0, '成片是一段真视频（ffprobe 量出时长）').toBeGreaterThan(1)
  walk.report.keptResultMp4 = await keepMedia(done.result.url, 'result.mp4')
  await walk.snap('03-zh-result-landed')
  walk.report.verified = ['preview-reference-attached-before-spend', 'one-provider-task', 'result-landed-and-probed']
  }
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await paid.finish(failure)
}
