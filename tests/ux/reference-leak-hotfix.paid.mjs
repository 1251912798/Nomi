#!/usr/bin/env node
// 真实付费核对 · 参考图错发热修（F-refleak-hotfix）：界面没在用的参考图，真的不再发给 APIMart。**只写脚本，由协调来跑。**
//
//   pnpm build
//   NOMI_SPEND_OK=1 APIMART_API_KEY=<key，只从环境读> node tests/ux/reference-leak-hotfix.paid.mjs [--packaged <Nomi 可执行文件的绝对路径>]
//   # 先零花费探测（走到确认框为止、绝不点生成）：
//   NOMI_SPEND_OK=1 NOMI_PAID_PROBE_DIALOG=1 APIMART_API_KEY=<key> node tests/ux/reference-leak-hotfix.paid.mjs
//
// 只花**一条**视频（复盘场景 2，APIMart 官方渠道）：Seedance 2.0 fast · 480p · 4 秒 · 无音频（_agentVideoPaid.mjs 里被授权的最便宜一档）。
//   全能参考方式放 3 张参考图 → 切到「首尾帧」（参考图留在节点上，参考区不再显示它们）→ 放首帧、尾帧 → 点 ↑ → 确认框点「生成」。
// 修前：APIMart 的请求体里 image_urls / image_with_roles 带着首、尾帧**加上**那 3 张残留参考（花钱买的是用户看不到的图左右的片）。
// 修后要证明：真正发往 api.apimart.ai 的那份请求体里只有首帧、尾帧两张图，那 3 张参考一张都没上传、没发出。
//
// 请求体从哪抓：走查网络闸（scripts/walkthrough-network-guard.cjs）在 fetch 层对放行名单上的请求记账（openPaidWalk 的
// recordAllowedBodies）。不记请求头（key 在头里）；正文里的签名查询串、key 形状的串先打码再落盘。托管上传的 multipart 记文件名，
// 上传回的公网地址用来把请求体里的地址对回本地文件名。报告里只留文件名和地址哈希，不留签名参数。
//
// 一次付费之前的整套核对（任何一项不成立就一分钱不花）：
//   ① 节点就是被授权那一档（cheapVideoNodeProblems）；② 当前方式是首尾帧，首帧 / 尾帧都在；③ 那 3 张参考还躺在节点上（场景真的布好了，
//   否则这条付费证明不了什么）。
// 花钱后：节点恰好一次提交、结果带供应商任务号、成片 ffprobe 量过并在隔离副本删除前拷进证据目录（工作树 .tmp/ 下，不进仓库）；
// 证据摘要写 docs/evidence/2026-10-22-reference-leak-hotfix/paid/report.json。
//
// 探测模式（NOMI_PAID_PROBE_DIALOG=1，照 director-reference-attach.paid.mjs）：供应商的源不进放行名单，就算托管策略是「允许」、
// 点 ↑ 直接提交，网络闸也当场挡下，结构上花不了钱。走到确认框出现为止：截图、点「取消」、核对节点上没有提交记录。
// 注意：用环境变量里的 key 接入时，接入页若要验证 key 会真调一次文本模型；探测模式下这次调用会被网络闸挡下、走查当场失败并点名被挡主机——
// 遇到就直接跑正常模式（它在确认框之前同样会停下来做整套核对）。探测模式抓不到请求体（请求在确认之后才组装发出）。
//
// 凭据与护栏：全部走 tests/ux/_paidRun.mjs 的 openPaidWalk（CI 拒跑、没有 NOMI_SPEND_OK=1 拒跑、构建产物过期或不含本修复拒跑、
// 隔离资料目录、出网只放行授权供应商与当前托管中转、跑完删凭据副本）；key 只从环境变量读，不进报告 / 日志 / 截图。
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpeg from '@ffmpeg-installer/ffmpeg'
import { clickOrFail, expect, proveProbe } from './_assert.mjs'
import { SPEND_DIALOG, openPaidWalk } from './_paidRun.mjs'
import { VIDEO, cheapVideoNodeProblems, probeLandedMedia } from './_agentVideoPaid.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { bringButtonIntoReach, readButtonReach } from './_generateReach.mjs'
import { openCanvas, readProject } from './agent-runtime-walk-support.mjs'

const SCRIPT = 'reference-leak-hotfix.paid.mjs'
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs/evidence/2026-10-22-reference-leak-hotfix/paid')
const PROBE = process.env.NOMI_PAID_PROBE_DIALOG === '1'
const APIMART_HOST = 'api.apimart.ai'
const ARCHETYPE = 'seedance-2-apimart'
const REFERENCE_FILES = ['ref-1.png', 'ref-2.png', 'ref-3.png']
const FIRST_FILE = 'first.png'
const LAST_FILE = 'last.png'
// 本修复会原样进产物的字面量（主进程剥除守卫的诊断前缀）：产物里没有它 = 跑在旧构建上，拒跑。
const BUILD_MARKER = 'reference residue stripped before send'
const NODE_GENERATE = 'button[data-bar-segment="generate"]'
const VIDEO_LANDS_MS = stationTimeout({ turns: 4 })

const paid = await openPaidWalk(SCRIPT, 'reference-leak-hotfix', [VIDEO], {
  hostedUploads: true, // 本地参考图要先经应用的托管上传中转交给供应商：放行当前配置的那一个中转源
  vendorNetwork: !PROBE,
  recordAllowedBodies: true,
  buildMarkers: [BUILD_MARKER],
})
const { walk } = paid
const evidence = { script: SCRIPT, mode: PROBE ? 'probe-dialog' : 'paid', startedAt: new Date().toISOString(), model: `${VIDEO.vendorKey}/${VIDEO.modelKey} · fast · 480p · 4s · 无音频` }
let failure
try {
  const { win } = await walk.start({ first: true })
  await win.evaluate(() => window.localStorage.setItem('__nomiE2E', '1'))
  await win.reload({ waitUntil: 'domcontentloaded' })
  await paid.lockToAuthorizedModels(win)
  const { projectId, projectRoot } = await walk.newProject()
  await openCanvas(win)
  await win.waitForFunction(() => Boolean(window.__nomiCanvasStore), null, { timeout: stationTimeout({ operations: 2 }) })

  // 五张互不相同的合成图（ffmpeg testsrc + 不同色相，没有任何真实素材），放进项目素材目录。
  const assetDir = path.join(projectRoot, 'assets', 'imported')
  fs.mkdirSync(assetDir, { recursive: true })
  const urlOf = (file) => `nomi-local://asset/${projectId}/assets/imported/${file}`
  ;[...REFERENCE_FILES, FIRST_FILE, LAST_FILE].forEach((file, index) => {
    execFileSync(ffmpeg.path, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc=s=832x480:r=1,hue=h=${index * 72}`, '-frames:v', '1', '-y', path.join(assetDir, file)], { stdio: 'pipe' })
  })
  const fileByLocalUrl = new Map([...REFERENCE_FILES, FIRST_FILE, LAST_FILE].map((file) => [urlOf(file), file]))

  // 视频镜头：被授权的那一档，全能参考方式，3 张参考图（和真人从参考区拖进来写的是同一个存储键）。
  const shotId = await win.evaluate(({ meta }) => {
    const state = window.__nomiCanvasStore.getState()
    const shot = state.addNode({ kind: 'video', title: '参考残留核对', prompt: '一只橘猫从书桌上跳下，镜头缓慢跟随，写实', position: { x: 0, y: 0 }, select: false, meta })
    return shot.id
  }, {
    meta: {
      modelKey: VIDEO.modelKey, modelVendor: VIDEO.vendorKey, vendor: VIDEO.vendorKey,
      archetype: { id: ARCHETYPE, modeId: 'omni', variantId: 'fast' },
      duration: 4, resolution: '480p', generate_audio: false,
      referenceImageUrls: REFERENCE_FILES.map(urlOf),
    },
  })
  const storeNode = () => win.evaluate((id) => window.__nomiCanvasStore.getState().nodes.find((node) => node.id === id) ?? null, shotId)
  const nodeOnDisk = async () => ((await readProject(win, projectId)).payload.generationCanvas.nodes ?? []).find((node) => node.id === shotId)

  // 切到「首尾帧」：优先走生成框里的「生成方式」分段条（和真人同一个按钮）；分段条没出来就走它调用的同一个写口。
  await win.evaluate((id) => window.__nomiCanvasStore.getState().selectNode(id), shotId)
  const modeGroup = win.locator('.generation-canvas-v2-node__composer [role="group"][aria-label="生成方式"]').first()
  const modeBarShown = await modeGroup.waitFor({ state: 'visible', timeout: stationTimeout({ operations: 2 }) }).then(() => true).catch(() => false)
  if (modeBarShown) {
    await clickOrFail(modeGroup.locator('button', { hasText: '首尾帧' }), '生成方式「首尾帧」')
    evidence.modeSwitchVia = 'ui-mode-bar'
  } else {
    await win.evaluate((id) => {
      const state = window.__nomiCanvasStore.getState()
      const node = state.nodes.find((candidate) => candidate.id === id)
      state.updateNode(id, { meta: { ...node.meta, archetype: { ...node.meta.archetype, modeId: 'firstlast' } } })
    }, shotId)
    evidence.modeSwitchVia = 'store（分段条没出来；与 applyArchetypeModeSwitch 同样只改 modeId、参考图留在原键）'
  }
  await expect.poll(async () => (await storeNode())?.meta?.archetype?.modeId, { message: '切到首尾帧', timeout: stationTimeout({ operations: 1 }) }).toBe('firstlast')
  // 放首帧、尾帧（参考区上传写的就是这两个键）。
  await win.evaluate(({ id, first, last }) => {
    const state = window.__nomiCanvasStore.getState()
    const node = state.nodes.find((candidate) => candidate.id === id)
    state.updateNode(id, { meta: { ...node.meta, firstFrameUrl: first, lastFrameUrl: last } })
  }, { id: shotId, first: urlOf(FIRST_FILE), last: urlOf(LAST_FILE) })

  // ── 花钱之前的整套核对：任何一项不成立就停（一分钱没花）──
  const shot = await storeNode()
  const problems = [...cheapVideoNodeProblems(shot.meta)]
  if (shot.meta?.archetype?.modeId !== 'firstlast') problems.push(`当前方式是 ${shot.meta?.archetype?.modeId}，不是首尾帧`)
  if (shot.meta?.firstFrameUrl !== urlOf(FIRST_FILE) || shot.meta?.lastFrameUrl !== urlOf(LAST_FILE)) problems.push('首帧 / 尾帧没放上')
  const residue = Array.isArray(shot.meta?.referenceImageUrls) ? shot.meta.referenceImageUrls : []
  if (REFERENCE_FILES.some((file) => !residue.includes(urlOf(file)))) problems.push(`那 3 张参考不在节点上（场景没布好，这条付费证明不了什么）：${JSON.stringify(residue.map((url) => fileByLocalUrl.get(url) ?? 'other'))}`)
  if (problems.length) throw new Error(`花钱前核对没过（一分钱没花）：\n  ${problems.join('\n  ')}`)
  evidence.sceneBeforeSpend = { modeId: 'firstlast', frames: [FIRST_FILE, LAST_FILE], residueStillOnNode: REFERENCE_FILES }
  await walk.snap('01-zh-firstlast-with-residue-before-spend')

  const generateButton = win.locator(`[data-node-id="${shotId}"] ${NODE_GENERATE}`).first()
  walk.report.generateButtonBeforeClick = await bringButtonIntoReach(win, generateButton, '节点底栏的 ↑')
  const clickedAt = Date.now()
  await clickOrFail(generateButton, '节点底栏的 ↑（生成）', { noWaitAfter: true })
  walk.report.generateButtonAfterClick = await readButtonReach(generateButton)
  const dialog = win.locator(SPEND_DIALOG)

  if (PROBE) {
    const PROBE_MS = 180_000
    let dialogMs = null
    while (Date.now() - clickedAt < PROBE_MS) {
      if (await dialog.first().isVisible().catch(() => false)) { dialogMs = Date.now() - clickedAt; break }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    evidence.probe = { dialogMs, note: dialogMs === null ? '3 分钟内确认框没出现' : '确认框出现；已点取消，没点生成' }
    if (dialogMs === null) throw new Error(`探测：点 ↑ 之后 ${PROBE_MS / 1000} 秒内确认框一直没出现`)
    await walk.snap('probe-dialog-visible')
    await clickOrFail(dialog.locator('[data-spend-confirm-action="cancel"]'), '确认框「取消」（探测模式绝不点生成）', { noWaitAfter: true })
    await dialog.first().waitFor({ state: 'hidden', timeout: stationTimeout({ operations: 1 }) })
    const runsAfterCancel = (await nodeOnDisk())?.runs?.length ?? 0
    if (runsAfterCancel > 0) throw new Error(`探测模式取消之后镜头上有 ${runsAfterCancel} 条提交记录（不该有）`)
    evidence.verified = ['scene-armed-before-spend', 'generate-click-reaches-confirm-dialog', 'cancel-leaves-no-submission']
  } else {
    // 真正的等待：isVisible 不等待，框晚几百毫秒出现会被当成「没有框」（协调 10-22 实跑踩到）。
    if (await dialog.first().waitFor({ state: 'visible', timeout: stationTimeout({ operations: 1 }) }).then(() => true).catch(() => false)) {
      await proveProbe(dialog, '付费 / 托管披露确认框')
      await walk.snap('02-zh-confirm-dialog')
      await clickOrFail(dialog.locator('[data-spend-confirm-action="confirm"]'), '确认框「生成」', { noWaitAfter: true })
    }
    let submitted = false
    const submitDeadline = Date.now() + stationTimeout({ operations: 2 })
    while (!submitted && Date.now() < submitDeadline) {
      submitted = ((await nodeOnDisk())?.runs?.length ?? 0) > 0
      if (!submitted) await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    if (!submitted) {
      await walk.snap('fail-no-submission')
      throw new Error('点了生成但没有提交：30 秒内这个镜头没有出现提交记录（见 fail-no-submission 截图）')
    }
    // 请求体一提交就记下了：先核它（成片要等几分钟，这一步红了也照样等成片落地，钱已经花了，证据要齐）。
    const wire = readWireEvidence(paid.readAllowedRequests())
    evidence.request = wire.summary

    await expect.poll(async () => (await nodeOnDisk())?.result?.url ?? '', { message: '成片落在这个镜头上', timeout: VIDEO_LANDS_MS }).toMatch(/^nomi-local:\/\//)
    const done = await nodeOnDisk()
    evidence.providerTaskIds = [done.result?.taskId].filter(Boolean)
    const landed = await probeLandedMedia(projectRoot, projectId, done.result.url)
    const keptAt = path.join(walk.report.outputDir, 'result.mp4')
    fs.copyFileSync(landed.filePath, keptAt) // 隔离副本删除前先留下成片
    evidence.landed = { durationSeconds: landed.probe.durationSeconds ?? null, videoCodec: landed.probe.videoCodec ?? null, width: landed.probe.width ?? null, height: landed.probe.height ?? null, hasAudio: landed.probe.hasAudio, bytes: landed.bytes, keptAt: path.relative(REPO_ROOT, keptAt) }
    await walk.snap('03-zh-result-landed')

    expect(done.runs?.length, '镜头恰好一次提交').toBe(1)
    expect(done.runs[0].status, '那一次提交成功').toBe('success')
    expect(Boolean(done.result?.taskId), '结果带着供应商任务号').toBe(true)
    expect(landed.probe.durationSeconds ?? 0, '成片是一段真视频（ffprobe 量出时长）').toBeGreaterThan(1)
    if (wire.problems.length) throw new Error(`请求体核对没过：${wire.problems.join('；')}`)
    evidence.verified = ['scene-armed-before-spend', 'apimart-body-only-first-and-last-frame', 'residue-references-never-uploaded', 'one-provider-task', 'result-landed-and-probed']
  }
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await paid.finish(failure)
  writeEvidence(failure)
}

/** URL 去掉查询串（签名参数）后的样子；闸已经把查询串换成 `?<redacted>`。 */
function bareUrl(url) {
  return String(url).split('?')[0].split('#')[0]
}

function shortHash(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 12)
}

function urlsIn(value, out = []) {
  if (typeof value === 'string') { if (/^(https?:|data:)/i.test(value)) out.push(value) }
  else if (Array.isArray(value)) value.forEach((item) => urlsIn(item, out))
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => urlsIn(item, out))
  return out
}

/**
 * 从闸的账本里取出：发往 api.apimart.ai 的那一次创建请求、它带的图片地址、托管上传了哪些本地文件。
 * 主判据（不依赖地址能不能对回文件名）：①恰好一次创建请求；②请求体里恰好两张图；③托管上传的文件恰好是首帧、尾帧，那 3 张参考一张都没上传。
 * 能对回文件名的再逐张核：发出去的就是 first.png / last.png。
 */
function readWireEvidence(entries) {
  const problems = []
  const creates = entries.filter((entry) => entry.kind === 'allowed-request' && entry.host === APIMART_HOST && entry.method === 'POST' && /\/videos\/generations$/.test(new URL(entry.url).pathname))
  if (creates.length !== 1) problems.push(`发往 ${APIMART_HOST} 的视频创建请求有 ${creates.length} 次（应恰好 1 次）`)
  let body = null
  try { body = creates[0]?.body?.text ? JSON.parse(creates[0].body.text) : null } catch { problems.push('创建请求的请求体不是 JSON（或被截断）') }
  if (creates[0]?.body?.truncated) problems.push('创建请求的请求体超过记账上限被截断，图片地址可能没读全')
  const imageUrls = body ? urlsIn(body).filter((url) => !/\.(mp4|mov|webm|mp3|wav|m4a)(\?|$)/i.test(bareUrl(url))) : []
  // 托管上传：multipart 记了文件名；同一个 seq 的响应里带着公网地址。
  const uploads = entries.filter((entry) => entry.kind === 'allowed-request' && Array.isArray(entry.body?.form))
    .flatMap((entry) => entry.body.form.filter((part) => part.fileName).map((part) => ({ seq: entry.seq, fileName: part.fileName })))
  const fileByRemote = new Map()
  for (const upload of uploads) {
    const response = entries.find((entry) => entry.kind === 'allowed-response' && entry.seq === upload.seq)
    for (const url of String(response?.text ?? '').match(/https?:\/\/[^\s"'\\]+/g) ?? []) fileByRemote.set(bareUrl(url), upload.fileName)
  }
  const sent = imageUrls.map((url) => ({ file: fileByRemote.get(bareUrl(url)) ?? null, urlSha256: shortHash(bareUrl(url)) }))
  const uploadedFiles = [...new Set(uploads.map((upload) => upload.fileName))].sort()
  if (imageUrls.length !== 2) problems.push(`请求体里有 ${imageUrls.length} 张图（应恰好 2 张：首帧、尾帧）`)
  const leakedUploads = uploadedFiles.filter((file) => REFERENCE_FILES.includes(file))
  if (leakedUploads.length) problems.push(`界面上没在用的参考图被托管上传了：${leakedUploads.join('、')}`)
  if (uploadedFiles.length && JSON.stringify(uploadedFiles) !== JSON.stringify([FIRST_FILE, LAST_FILE].sort())) problems.push(`托管上传的文件是 ${uploadedFiles.join('、')}（应只有 ${FIRST_FILE}、${LAST_FILE}）`)
  const named = sent.filter((entry) => entry.file)
  if (named.some((entry) => ![FIRST_FILE, LAST_FILE].includes(entry.file))) problems.push(`请求体里出现了首尾帧以外的图：${named.map((entry) => entry.file).join('、')}`)
  return {
    problems,
    summary: {
      createRequests: creates.length,
      endpoint: creates[0] ? `${new URL(creates[0].url).host}${new URL(creates[0].url).pathname}` : null,
      imageUrlsInBody: sent,
      unmappedImageUrls: sent.filter((entry) => !entry.file).length,
      hostedUploads: uploadedFiles,
      problems,
    },
  }
}

function writeEvidence(error) {
  const report = {
    ...evidence,
    finishedAt: new Date().toISOString(),
    paidCalls: walk.report.paidCalls ?? null,
    spend: (walk.report.spend?.media ?? []).map(({ taskId, status, model, vendor }) => ({ taskId, status, model, vendor })),
    providerTaskIds: evidence.providerTaskIds ?? (walk.report.spend?.media ?? []).map((entry) => entry.taskId).filter(Boolean),
    networkAllowlist: walk.report.networkAllowlist ?? null,
    networkBlocked: walk.report.networkBlocked ?? [],
    walkOutputDir: walk.report.outputDir ? path.relative(REPO_ROOT, walk.report.outputDir) : null,
    failure: error ? String(error?.message ?? error).slice(0, 2000) : null,
  }
  // 证据摘要进仓库：落盘前最后一道，内容里不许有 key 原串（openPaidWalk 的证据目录自检管不到这里）。
  const key = String(process.env.APIMART_API_KEY ?? '').trim()
  const text = `${JSON.stringify(report, null, 2)}\n`
  if (key.length >= 8 && text.includes(key)) { console.error('[paid] 证据摘要里出现了 key 原串，拒绝写入仓库——请更换这把 key'); process.exitCode = 1; return }
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  const file = path.join(EVIDENCE_DIR, PROBE ? 'probe-report.json' : 'report.json')
  fs.writeFileSync(file, text)
  console.log(`[paid] 证据摘要：${path.relative(REPO_ROOT, file)}`)
}
