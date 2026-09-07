#!/usr/bin/env node
// R13 / R16 走查 —— 深度视频节点的真实用户任务（计划 §12.8 的六张对账图）。
//
// 用法: pnpm run build && node tests/ux/video-depth-real-task.walk.mjs
// 产出: tests/ux/shots/video-depth-real-task/*.png
//
// 一句话的任务：
//   用户手上有一段 4 秒的真人动作素材（黄雨衣、举着手电、推门走进来）。他要把它变成一段
//   深度视频，拿去当动作参考喂给一个视频模型——只换人物、保住动作。做完发现连错了，⌘Z 撤销。
//
// 这条走查**跑的是真东西**，没有一处 mock：
//   · 真的下载 Depth Anything V2 Small 的 fp16 权重（约 50MB，隔离 profile 每次都从零下）；
//   · 真的用 ffmpeg 抽帧、真的在渲染层 WebGPU 上逐帧推理、真的用 ffmpeg 合成 mp4；
//   · 产物真的落成项目资产、真的能被连成参考边。
//   所以它慢（分钟级），也所以它是唯一能证明这条链在打包路径上活着的东西——
//   nomi-local 伺服 wasm 那一段在 dev 里根本复现不出来。
//
// **零额度**：全程不触发任何供应商生成。下游那个视频模型节点只连线、不点生成——
//   §12.8 要看的是「产物能被当参考消费」，不是「模型出片好不好」（那是另一场付费实验）。
//
// 素材是仓库里已有的那段真实镜头（tests/ux/fixtures/real-shot-640x360.mp4），
// 用 ffmpeg 裁到 4 秒放进项目。纯色板证明不了深度模型真的在看一个人。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { launchNomiApp, repoRoot } from './_launchApp.mjs'
import { addCanvasNodeFromRail } from './_canvasRail.mjs'
import { clickOrFail, expectVisible, proveProbe, screenshotSettled } from './_assert.mjs'

const require = createRequire(import.meta.url)
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path

const shotsDir = path.join(repoRoot, 'tests/ux/shots/video-depth-real-task')
fs.rmSync(shotsDir, { recursive: true, force: true })
fs.mkdirSync(shotsDir, { recursive: true })

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-video-depth-walk-'))
const userDataDir = path.join(tempRoot, 'user-data')
const settingsDir = path.join(tempRoot, 'settings')
const projectsDir = path.join(tempRoot, 'projects')
const capabilityDir = path.join(tempRoot, 'capability')
for (const dir of [userDataDir, settingsDir, projectsDir, capabilityDir]) fs.mkdirSync(dir, { recursive: true })

// ── 素材：把仓库里那段真实镜头裁到 4 秒放进项目 ────────────────────────────────
const SOURCE_FIXTURE = path.join(repoRoot, 'tests/ux/fixtures/real-shot-640x360.mp4')
if (!fs.existsSync(SOURCE_FIXTURE)) throw new Error(`真实素材不在仓库里：${SOURCE_FIXTURE}`)

const projectId = 'video-depth-real-task'
const projectName = '深度参考 · 黄雨衣'
const projectRoot = path.join(projectsDir, projectId)
const importedDir = path.join(projectRoot, 'assets', 'imported')
fs.mkdirSync(path.join(projectRoot, '.nomi'), { recursive: true })
fs.mkdirSync(importedDir, { recursive: true })

const CLIP_FILE = 'real-shot-4s.mp4'
const CLIP_SECONDS = 4
execFileSync(
  ffmpegPath,
  ['-v', 'error', '-y', '-i', SOURCE_FIXTURE, '-t', String(CLIP_SECONDS), '-c', 'copy', path.join(importedDir, CLIP_FILE)],
  { timeout: 120_000 },
)

const assetUrl = `nomi-local://asset/${encodeURIComponent(projectId)}/assets/imported/${encodeURIComponent(CLIP_FILE)}`
const sourceNode = {
  id: 'source-shot',
  kind: 'video',
  categoryId: 'shots',
  title: '推门走进来',
  prompt: '推门走进来',
  position: { x: 120, y: 140 },
  status: 'success',
  result: { id: 'source-shot-result', type: 'video', url: assetUrl, createdAt: 1, durationSeconds: CLIP_SECONDS },
}
const generationCanvas = { nodes: [sourceNode], edges: [], selectedNodeIds: [], groups: [] }
const workbenchDocument = { version: 1, title: projectName, updatedAt: 1, contentJson: { type: 'doc', content: [] } }
const timeline = {
  version: 1,
  fps: 30,
  scale: 1.5,
  playheadFrame: 0,
  tracks: [
    { id: 'imageTrack', type: 'image', label: '图片轨', clips: [] },
    { id: 'videoTrack', type: 'video', label: '视频轨', clips: [] },
    { id: 'audioTrack', type: 'audio', label: '音频轨', clips: [] },
  ],
  textClips: [],
  transitions: [],
}
const payload = { workbenchDocument, timeline, generationCanvas, storyboardPlan: null, storyboardPlanCommitted: false }
const project = {
  id: projectId,
  name: projectName,
  version: 2,
  createdAt: 1,
  updatedAt: 1,
  savedAt: 1,
  revision: 1,
  lastKnownRootPath: projectRoot,
  workbenchDocument,
  timeline,
  generationCanvas,
  payload,
}
fs.writeFileSync(path.join(projectRoot, 'project.json'), JSON.stringify(project, null, 2))
fs.writeFileSync(path.join(projectRoot, '.nomi', 'project.json'), JSON.stringify(project, null, 2))

// ── 判据与情绪摩擦日志 ────────────────────────────────────────────────────────────
const verdicts = []
const friction = []
/**
 * 参数顺序是 (ok, name)——**判据在前**。写反了不会报错，只会让每一条都恒真：
 * 一句非空的中文断言名当成 ok 永远是真，于是这条走查会全绿地什么都没验。
 * 2026-09-07 第一趟就是这么假绿的，所以这里把顺序写死并在下面逐条对齐。
 */
function check(ok, name, detail = '') {
  verdicts.push([name, ok, detail])
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}
/** 不是断言，是「这一步舒不舒服」的人话记录，和截图一起交付（docs/lessons/experiential-qa-emotion-log）。 */
function note(step, feeling) {
  friction.push([step, feeling])
  console.log(`  · 「${step}」${feeling}`)
}

let shotIndex = 0
async function snap(win, name) {
  shotIndex += 1
  const file = path.join(shotsDir, `${String(shotIndex).padStart(2, '0')}-${name}.png`)
  await screenshotSettled(win, { path: file })
  console.log(`  · shot ${path.basename(file)}`)
  return file
}
/** 进度这一族**不能等静止**——等到静止这一段就过去了。所以单独截，不走 settle。 */
async function snapLive(win, name) {
  shotIndex += 1
  const file = path.join(shotsDir, `${String(shotIndex).padStart(2, '0')}-${name}.png`)
  await win.screenshot({ path: file })
  console.log(`  · shot ${path.basename(file)} (live)`)
  return file
}

const DEPTH_PANEL = '[data-node-video-depth]'
const PROGRESS = '[data-video-depth-progress]'

const { app, win } = await launchNomiApp({
  name: 'video-depth-real-task',
  userDataDir,
  settingsDir,
  projectsDir,
  capabilityDir,
  timeout: 300_000,
  settleMs: 1200,
  args: ['--no-proxy-server'],
  env: { NOMI_DISABLE_AUTO_UPDATE: '1' },
})
win.setDefaultTimeout(30_000)
win.on('pageerror', (error) => console.log(`[renderer:pageerror] ${error.message}`))

try {
  const browserWindow = await app.browserWindow(win)
  await browserWindow.evaluate((windowRef) => windowRef.setBounds({ x: 0, y: 0, width: 1680, height: 1020 }))
  await win.evaluate(() => {
    window.localStorage.setItem('__nomiE2E', '1')
    for (const key of ['nomi:splash:v1', 'nomi:journey-tour:v1', 'nomi:canvas-gesture-hint:v1', 'nomi-onboarding-checklist:v1']) {
      window.localStorage.setItem(key, 'seen')
    }
  })
  await win.reload()
  await win.waitForLoadState('domcontentloaded')

  const projectCard = win.locator('[data-project-card="true"]').filter({ hasText: projectName }).first()
  await expectVisible(projectCard, '项目卡没出现', 60_000)
  await projectCard.hover()
  await clickOrFail(projectCard.getByRole('button', { name: /继续创作/ }).first(), `打开${projectName}`)
  await win.locator('[aria-label="工作区切换"]').first().waitFor({ timeout: 60_000 })
  await win.locator('[aria-label="工作区切换"]').getByText('生成', { exact: true }).click({ timeout: 10_000 })
  await win.locator('.generation-canvas-v2-toolbar').first().waitFor({ timeout: 60_000 })
  await win.waitForTimeout(800)

  // ── ① 加节点：它必须真的在加号的「更多」里，不是只写在计划里 ────────────────
  const placement = await addCanvasNodeFromRail(win, 'video_depth_process')
  check(placement === 'more', '深度视频节点挂在加号的「更多」组里（§12.5）', `实际：${placement}`)
  await win.waitForTimeout(1200)

  const panel = win.locator(DEPTH_PANEL).first()
  await expectVisible(panel, '深度节点的正文没渲染出来', 30_000)
  const depthNodeId = await panel.getAttribute('data-node-video-depth')
  check(Boolean(depthNodeId), '深度节点建出来了', String(depthNodeId))

  // 未跑之前就该看见两件事：这次要下多少 MB，以及这东西做不到什么。
  const downloadHint = panel.locator('text=/模型权重/').first()
  await proveProbe(downloadHint, '首次下载体积提示')
  const limitsProbe = panel.locator('text=/手指细节/').first()
  await proveProbe(limitsProbe, '诚实边界（§12.4）常驻在卡片上')
  check(true, '① 未下载态：体积提示与失效边界同屏可见')
  await snap(win, 'idle-not-downloaded')
  note('第一次打开这张卡', '一眼看到「要下 47MB」和「不承载手指细节」，没有被藏进折叠里——不用点开就知道自己在换什么')

  // ── 选源 + 调参数 ────────────────────────────────────────────────────────────
  await panel.getByRole('button', { name: '源视频' }).first().click({ timeout: 10_000 })
  await win.getByText('推门走进来', { exact: false }).last().click({ timeout: 10_000 })
  await win.waitForTimeout(600)

  // 12fps：4 秒 = 48 帧。走查要的是「这条链活着」，不是最高画质；30fps 会把这一趟拖成三倍。
  await panel.getByRole('button', { name: '帧率' }).first().click({ timeout: 10_000 })
  await win.getByText('12', { exact: true }).last().click({ timeout: 10_000 })
  await win.waitForTimeout(600)

  const persistedSettings = async () => {
    const record = await win.evaluate((id) => window.nomiDesktop.projects.readAsync(id), projectId)
    const nodes = record?.payload?.generationCanvas?.nodes ?? []
    return nodes.find((node) => node.kind === 'video_depth_process')?.meta?.videoDepth ?? null
  }
  const beforeRun = await persistedSettings()
  check(beforeRun?.processingFps === 12, '参数落进 meta 并持久化（可撤销、重启还在）', JSON.stringify(beforeRun))
  check(Boolean(beforeRun?.sourceVideoRef?.sourceNodeId), '源视频引用存进 meta', beforeRun?.sourceVideoRef?.title ?? '')

  // ── ② / ③ 真跑：下载 → 抽帧 → 预热 → 推理 → 合成 ────────────────────────────
  await clickOrFail(panel.getByRole('button', { name: /开始处理/ }).first(), '开始处理')

  await win.locator(`${PROGRESS}[data-video-depth-progress="downloading"]`).first().waitFor({ timeout: 60_000 })
  check(true, '② 下载阶段真的出现了（隔离 profile，权重从零下）')
  await snapLive(win, 'downloading')
  note('等下载', '进度条上有真的字节数，不是一个转圈——知道它在动、也知道还要多久')

  const processing = win.locator(`${PROGRESS}[data-video-depth-progress="processing"]`).first()
  await processing.waitFor({ timeout: 600_000 })
  const cancelButton = panel.locator('[data-video-depth-cancel="true"]').first()
  await proveProbe(cancelButton, '处理中可取消')
  const processingText = (await processing.textContent()) ?? ''
  check(/\d+\s*\/\s*\d+/.test(processingText), '③ 处理中报的是真帧数，不是一个空转圈', processingText.trim())
  check(/预计|测速/.test(processingText), '③ 预估时间在场（测出来之前明说「正在测速」，不编数字）', processingText.trim())
  await snapLive(win, 'processing')
  note('推理中', '帧数在走、还剩多久看得见、取消就在旁边——不用猜它是不是卡死了')

  // ── ④ 产物落画布 ────────────────────────────────────────────────────────────
  const resultVideo = panel.locator('[data-video-depth-result="true"]').first()
  await resultVideo.waitFor({ timeout: 900_000 })
  await expectVisible(resultVideo, '深度产物没落到卡片上', 30_000)
  const persistedResult = await win.evaluate((id) => {
    const record = window.nomiDesktop.projects.readAsync(id)
    return Promise.resolve(record).then((value) => {
      const nodes = value?.payload?.generationCanvas?.nodes ?? []
      const node = nodes.find((candidate) => candidate.kind === 'video_depth_process')
      return node?.result ?? null
    })
  }, projectId)
  check(persistedResult?.type === 'video', '④ 产物是画布上的普通视频资产', JSON.stringify(persistedResult))
  check(
    typeof persistedResult?.url === 'string' && persistedResult.url.startsWith('nomi-local://'),
    '④ 产物落进项目素材（本地 URL，不是外链）',
    String(persistedResult?.url),
  )
  await snap(win, 'result-on-canvas')
  note('出片那一刻', '产物直接在卡片里能播，不用先去素材库找它')

  // ── ⑤ 拖进任意视频模型的参考槽（连线，不生成）────────────────────────────────
  await addCanvasNodeFromRail(win, 'video')
  await win.waitForTimeout(1200)
  const videoNodeId = await win.evaluate(
    (depthId) =>
      Array.from(document.querySelectorAll('.react-flow__node[data-id]'))
        .map((node) => node.getAttribute('data-id'))
        .find((id) => id && id !== depthId && !document.querySelector(`[data-node-video-depth="${id}"]`)) ?? null,
    depthNodeId,
  )
  check(Boolean(videoNodeId), '下游视频模型节点建出来了', String(videoNodeId))

  const depthCard = win.locator(`.react-flow__node[data-id="${depthNodeId}"]`)
  await depthCard.click({ position: { x: 36, y: 16 } })
  await win.waitForTimeout(500)
  const handleBox = await depthCard.locator('.generation-canvas-react-flow__handle[data-side="right"]').last().boundingBox()
  const targetBox = await win.locator(`.react-flow__node[data-id="${videoNodeId}"]`).boundingBox()
  if (!handleBox || !targetBox) throw new Error('连接握把或目标节点量不到（fail-closed）')
  await win.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await win.mouse.down()
  await win.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 14 })
  await win.waitForTimeout(300)
  await win.mouse.up()
  await win.waitForTimeout(1200)

  const edgesAfterConnect = await win.evaluate((id) => {
    const record = window.nomiDesktop.projects.readAsync(id)
    return Promise.resolve(record).then((value) => value?.payload?.generationCanvas?.edges ?? [])
  }, projectId)
  check(
    edgesAfterConnect.some((edge) => edge.source === depthNodeId && edge.target === videoNodeId),
    '⑤ 深度产物真的被连成了下游模型的参考（不做任何供应商特供接线）',
    JSON.stringify(edgesAfterConnect),
  )
  await snap(win, 'result-into-reference-slot')
  note('连线那一下', '深度产物和别的视频节点没有任何区别——不用先导出再导入，直接拉一条线')

  // ── ⑥ ⌘Z：连错了，撤销 ──────────────────────────────────────────────────────
  await win.keyboard.press('Meta+z')
  await win.waitForTimeout(1500)
  const edgesAfterUndo = await win.evaluate((id) => {
    const record = window.nomiDesktop.projects.readAsync(id)
    return Promise.resolve(record).then((value) => value?.payload?.generationCanvas?.edges ?? [])
  }, projectId)
  check(edgesAfterUndo.length === 0, '⑥ ⌘Z 撤掉了那条参考边', JSON.stringify(edgesAfterUndo))
  const resultSurvivedUndo = await win.evaluate((id) => {
    const record = window.nomiDesktop.projects.readAsync(id)
    return Promise.resolve(record).then((value) => {
      const nodes = value?.payload?.generationCanvas?.nodes ?? []
      return Boolean(nodes.find((node) => node.kind === 'video_depth_process')?.result?.url)
    })
  }, projectId)
  check(resultSurvivedUndo, '⑥ 撤销只退回连线那一步，跑了几分钟的产物没被一起撤掉')
  await snap(win, 'after-undo')
  note('撤销', '撤的是刚做错的那一下，不是把整趟处理一起吞掉——这条要是反了会很痛')
} finally {
  console.log('\n── 情绪摩擦日志 ──')
  for (const [step, feeling] of friction) console.log(`  「${step}」${feeling}`)
  console.log('\n── 判据 ──')
  for (const [name, ok, detail] of verdicts) console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
  console.log(`\n截图：${shotsDir}`)
  await app.close().catch(() => {})
}

const failed = verdicts.filter(([, ok]) => !ok)
if (failed.length > 0) {
  console.error(`\n${failed.length} 条判据没过`)
  process.exit(1)
}
console.log('\n全部判据通过')
