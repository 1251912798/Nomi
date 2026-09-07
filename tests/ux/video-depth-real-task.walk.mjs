#!/usr/bin/env node
// R13 / R16 走查 —— 「提取深度」的真实用户任务。
//
// 用法: pnpm run build && node tests/ux/video-depth-real-task.walk.mjs
// 产出: tests/ux/shots/video-depth-real-task/*.png
//
// 一句话的任务：
//   用户手上有一段 4 秒的真人动作素材（黄雨衣、举着手电、推门走进来）。他要把它变成一段
//   深度视频，拿去当动作参考喂给一个视频模型——只换人物、保住动作。做完发现连错了，⌘Z 撤销。
//
// 2026-09-07 改形态后这条走查跟着改了动线（用户看过独立节点那一版后拍板）：
//   旧：加号 →「更多」→ 新建一个深度节点 → 在它的表单里挑源、填七个参数 → 开始 → 产物落在同一张卡里。
//   新：选中那段视频 → 浮条「提取深度」→ 小面板只问「输出」→ 开始 → **旁边长出一张连好线的新卡**。
//   所以这里的断言也换了重点：动作找不找得到、第一屏问了几个问题、产物有没有带着出身落回画布。
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
import { clickOrFail, expectAbsent, expectVisible, proveProbe, screenshotSettled } from './_assert.mjs'

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

const PANEL = '[data-video-depth-panel="true"]'
const PANEL_ADVANCED = '[data-video-depth-advanced="true"]'
const PANEL_START = '[data-video-depth-start="true"]'
/** 派生节点上的进度遮罩就是现役那一个（GeneratingOverlay），不是深度专用的第二套。 */
const NODE_OVERLAY = '.generation-canvas-v2-node__generating-overlay'

/** 从磁盘读回这个项目的画布。落盘是防抖的，所以调用点一律用 waitForFunction 轮到为止。 */
const readCanvasWhen = (predicateSource, arg, timeout) =>
  win
    .waitForFunction(predicateSource, arg, { timeout })
    .then((handle) => handle.jsonValue())

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

  // ── ① 动作挂在素材上：选中那段视频，浮条上就有「提取深度」 ──────────────────
  //
  // 2026-09-07 改形态前这里是「去加号菜单的『更多』里找一个深度节点」。用户看完那一版的原话是
  // 「不够简单、丑、不知道怎么用」——根子就在这一步：他手上明明就有那段片子，却要先去别处
  // 新建一个空节点，再回头把片子挑给它。现在动作长在片子上。
  const sourceCard = win.locator('.react-flow__node[data-id="source-shot"]')
  await expectVisible(sourceCard, '源视频节点没出现在画布上', 60_000)
  await sourceCard.click({ position: { x: 40, y: 16 } })
  await win.waitForTimeout(600)
  const depthAction = win.getByRole('button', { name: '提取深度' }).first()
  await proveProbe(depthAction, '选中视频 → 浮条上就有「提取深度」')
  check(true, '① 动作就地挂在源素材上，不用先去加号菜单里新建一个空节点')
  await snap(win, 'action-on-source')
  note('看到这个动作', '选中片子它就在那儿，和抽首帧/拆解排在一起——不用先猜这功能叫什么、住在哪')

  // ── ② 小面板：只问一个问题 ──────────────────────────────────────────────────
  await clickOrFail(depthAction, '提取深度')
  const panel = win.locator(PANEL).first()
  await expectVisible(panel, '小面板没浮出来', 20_000)
  await proveProbe(panel.locator(PANEL_START).first(), '开始按钮')
  await snap(win, 'panel')
  note('点开面板', '就一个选择加一颗按钮，不用先读四行说明再填七个框')

  // ── ③ 高级：需要的人点得开，不需要的人看不见 ────────────────────────────────
  //
  // 「默认收起」这条断言的证法：先展开、证明这个选择器**测得到东西**，再收回去、
  // 证明它真的不在（expectAbsent 强制先有基线）。直接写 `count() === 0` 是空话——
  // 选择器写错时它同样恒真（docs/lessons/expect-absent-passes-too-early）。
  const advancedToggle = panel.getByRole('button', { name: '高级' }).first()
  await clickOrFail(advancedToggle, '展开高级')
  const advancedProof = await proveProbe(panel.locator(PANEL_ADVANCED).first(), '展开后「高级」里那几行参数在')
  await clickOrFail(advancedToggle, '收起高级')
  await expectAbsent(panel.locator(PANEL_ADVANCED), {
    provenBy: advancedProof,
    message: '② 第一屏只有「输出」三选一 + 一颗开始，「高级」默认收起',
  })
  check(true, '② 第一屏只问一个问题：分辨率/帧率/平滑/范围全在「高级」后面')
  await clickOrFail(advancedToggle, '再次展开高级')
  await expectVisible(panel.locator(PANEL_ADVANCED).first(), '「高级」没展开', 10_000)
  // 12fps：4 秒 = 48 帧。走查要的是「这条链活着」，不是最高画质；30fps 会把这一趟拖成三倍。
  await panel.getByRole('button', { name: '帧率' }).first().click({ timeout: 10_000 })
  await win.getByText('12', { exact: true }).last().click({ timeout: 10_000 })
  await win.waitForTimeout(600)
  const limitsLine = panel.locator('text=/手指/').first()
  await proveProbe(limitsLine, '诚实边界（§12.4）没被删，只是收进了「高级」')
  await snap(win, 'panel-advanced')

  // ── ④ 按下开始：旁边立刻长出一张连好线的新卡 ────────────────────────────────
  await clickOrFail(panel.locator(PANEL_START).first(), '开始')
  const canvasAfterStart = await readCanvasWhen(
    async (id) => {
      const value = await window.nomiDesktop.projects.readAsync(id)
      const canvas = value?.payload?.generationCanvas
      return canvas && canvas.nodes.length >= 2 ? canvas : null
    },
    projectId,
    60_000,
  )
  const derived = canvasAfterStart.nodes.find((node) => node.id !== 'source-shot')
  const derivedNodeId = derived?.id
  check(Boolean(derivedNodeId), '④ 按下开始，画布上立刻多了一张卡（占位先到、内容后填）', String(derivedNodeId))
  check(derived?.kind === 'video', '④ 它是一个**普通视频节点**，不是第三种节点类型', String(derived?.kind))
  check(/·\s*深度$/.test(derived?.title ?? ''), '④ 标题里带着出身（源名 · 输出）', String(derived?.title))
  check(
    canvasAfterStart.edges.some((edge) => edge.source === 'source-shot' && edge.target === derivedNodeId),
    '④ 产物与源之间自动连好线，用户不用自己记它是从哪来的',
    JSON.stringify(canvasAfterStart.edges),
  )
  note('按下开始', '一张新卡立刻出现在旁边、线已经连好——不用盯着一个「处理中」的全局提示猜是哪一条在跑')

  const derivedCard = win.locator(`.react-flow__node[data-id="${derivedNodeId}"]`)
  const overlay = derivedCard.locator(NODE_OVERLAY).first()
  await expectVisible(overlay, '派生节点上没有进度遮罩', 60_000)
  await derivedCard.locator('text=/正在下载模型权重/').first().waitFor({ timeout: 120_000 })
  check(true, '⑤ 下载阶段真的出现了（隔离 profile，权重从零下），而且是报在那张卡上')
  await snapLive(win, 'downloading')
  note('等下载', '进度就在这张卡上，按钮里也同步说了要下多少 MB——不用去别处找它在干嘛')

  await derivedCard.locator('text=/正在逐帧推理/').first().waitFor({ timeout: 900_000 })
  const overlayText = (await overlay.textContent()) ?? ''
  check(/预计还要\s*\d+:\d\d/.test(overlayText), '⑥ 处理中报的是预计剩余时间，不是一个空转圈', overlayText.trim())
  await proveProbe(derivedCard.getByRole('button', { name: /取消/ }).first(), '处理中可取消（就在遮罩里）')
  await snapLive(win, 'processing')
  note('推理中', '还剩多久看得见、取消就在旁边，遮罩里还滚着刚算出来的那一帧——不用猜它是不是卡死了')

  // ── ⑦ 产物：一个能播、能连、能再加工的普通视频 ──────────────────────────────
  const finished = await readCanvasWhen(
    async (input) => {
      const value = await window.nomiDesktop.projects.readAsync(input.projectId)
      const node = (value?.payload?.generationCanvas?.nodes ?? []).find((item) => item.id === input.derivedNodeId)
      return node?.result?.url ? node : null
    },
    { projectId, derivedNodeId },
    900_000,
  )
  check(finished.result.type === 'video', '⑦ 产物是画布上的普通视频资产', JSON.stringify(finished.result))
  check(
    typeof finished.result.url === 'string' && finished.result.url.startsWith('nomi-local://'),
    '⑦ 产物落进项目素材（本地 URL，不是外链）',
    String(finished.result.url),
  )
  check(
    finished.meta?.videoDepth?.processingFps === 12,
    '⑦ 这次用的参数写在产物身上——出身不只是标题里那半句',
    JSON.stringify(finished.meta?.videoDepth ?? null),
  )
  await snap(win, 'result-on-canvas')
  note('出片那一刻', '它就在源片旁边播着，标题写着从哪来——不用先去素材库里认哪个是哪个')

  // ── ⑧ 拖进任意视频模型的参考槽（连线，不生成）────────────────────────────────
  await addCanvasNodeFromRail(win, 'video')
  await win.waitForTimeout(1200)
  const videoNodeId = await win.evaluate(
    (known) =>
      Array.from(document.querySelectorAll('.react-flow__node[data-id]'))
        .map((node) => node.getAttribute('data-id'))
        .find((id) => id && !known.includes(id)) ?? null,
    ['source-shot', derivedNodeId],
  )
  check(Boolean(videoNodeId), '下游视频模型节点建出来了', String(videoNodeId))

  await derivedCard.click({ position: { x: 36, y: 16 } })
  await win.waitForTimeout(500)
  const handleBox = await derivedCard.locator('.generation-canvas-react-flow__handle[data-side="right"]').last().boundingBox()
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
    edgesAfterConnect.some((edge) => edge.source === derivedNodeId && edge.target === videoNodeId),
    '⑧ 深度产物真的被连成了下游模型的参考（不做任何供应商特供接线）',
    JSON.stringify(edgesAfterConnect),
  )
  await snap(win, 'result-into-reference-slot')
  note('连线那一下', '深度产物和别的视频节点没有任何区别——不用先导出再导入，直接拉一条线')

  // ── ⑨ ⌘Z：连错了，撤销 ──────────────────────────────────────────────────────
  await win.keyboard.press('Meta+z')
  await win.waitForTimeout(1500)
  const edgesAfterUndo = await win.evaluate((id) => {
    const record = window.nomiDesktop.projects.readAsync(id)
    return Promise.resolve(record).then((value) => value?.payload?.generationCanvas?.edges ?? [])
  }, projectId)
  // 撤销只该撤掉刚连的那一条。**源 → 产物**那条派生边必须还在——它不是用户刚做的动作，
  // 是这次处理的出身记录，被一起撤掉等于把「它从哪来的」也撤没了。
  check(
    !edgesAfterUndo.some((edge) => edge.source === derivedNodeId && edge.target === videoNodeId),
    '⑨ ⌘Z 撤掉了刚连的那条参考边',
    JSON.stringify(edgesAfterUndo),
  )
  check(
    edgesAfterUndo.some((edge) => edge.source === 'source-shot' && edge.target === derivedNodeId),
    '⑨ 派生边没被一起撤掉（它是出身记录，不是刚做的那一步）',
    JSON.stringify(edgesAfterUndo),
  )
  const resultSurvivedUndo = await win.evaluate((input) => {
    const record = window.nomiDesktop.projects.readAsync(input.projectId)
    return Promise.resolve(record).then((value) => {
      const nodes = value?.payload?.generationCanvas?.nodes ?? []
      return Boolean(nodes.find((node) => node.id === input.derivedNodeId)?.result?.url)
    })
  }, { projectId, derivedNodeId })
  check(resultSurvivedUndo, '⑨ 撤销只退回连线那一步，跑了几分钟的产物没被一起撤掉')
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
