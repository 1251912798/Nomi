import { makeTempDir } from '../../scripts/_test-temp.mjs'
// 真实用户任务：在剪辑节点的时间轴上看片段小标签——任何状态（常态 / 悬停 / 选中）下，两侧的拖拽手柄都不许压住标签的字。
// 回归（2026-10-12）：英文暗色下 "Image" 显示成 "mage"，标签左内边距固定 6px，选中后的手柄有 16px 宽。
// 零模型额度：隔离项目 + 本地图片。用法：pnpm run build && node tests/ux/clip-label-under-handle.walk.mjs
import { launchNomiApp } from './_launchApp.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyColorSchemeForShot, screenshotSettled } from './_assert.mjs'
import { waitForCanvasViewportSettled } from './_canvasHit.mjs'
import { canvasResetView } from './_shell.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const root = makeTempDir('nomi-clip-label-walk-')
const settingsDir = path.join(root, 'settings')
const projectsDir = path.join(root, 'projects')
const projectId = 'clip-label-under-handle'
const projectRoot = path.join(projectsDir, `clip-label-${projectId}`)
const generatedAssetsDir = path.join(projectRoot, 'assets', 'generated')
fs.mkdirSync(path.join(projectRoot, '.nomi'), { recursive: true })
fs.mkdirSync(generatedAssetsDir, { recursive: true })
fs.copyFileSync(path.join(repoRoot, 'tests/ux/fixtures/test-upload.png'), path.join(generatedAssetsDir, 'fixture.png'))
const imageUrl = `nomi-local://asset/${encodeURIComponent(projectId)}/assets/generated/fixture.png`

const imageNode = {
  id: 'src-image', kind: 'image', categoryId: 'shots', title: 'Image',
  position: { x: 80, y: 100 }, exactPosition: true, size: { width: 260, height: 200 }, status: 'success',
  result: { id: 'src-image-result', type: 'image', url: imageUrl, createdAt: 1 },
}
// 标签是素材名：种一个大写首字母开头的（"Image"），首字符被盖住时一眼可见。
const clips = [
  { id: 'image-a', sourceNodeId: imageNode.id, type: 'image', label: 'Image', url: imageUrl, durationSeconds: 2, trimStart: 0, trimEnd: 2 },
  { id: 'image-b', sourceNodeId: imageNode.id, type: 'image', label: 'Image', url: imageUrl, durationSeconds: 2, trimStart: 0, trimEnd: 2 },
]
const clipNode = {
  id: 'clip-editor', kind: 'clip', categoryId: 'shots', title: 'Clip',
  position: { x: 450, y: 300 }, exactPosition: true, size: { width: 760, height: 140 }, status: 'idle',
  meta: { clip: { nodeRole: 'clip', sourceNodeIds: clips.map((clip) => clip.id), clips } },
}
const generationCanvas = {
  nodes: [imageNode, clipNode],
  edges: [{ id: 'edge-image-clip', source: imageNode.id, target: clipNode.id, mode: 'reference', order: 0 }],
  selectedNodeIds: [], groups: [], canvasZoom: 1, canvasPan: { x: 0, y: 0 },
}
const payload = { workbenchDocument: null, timeline: null, generationCanvas, storyboardPlan: null, storyboardPlanCommitted: false }
const project = {
  id: projectId, name: 'Clip label walk', version: 2, createdAt: 1, updatedAt: 1, savedAt: 1, revision: 1,
  lastKnownRootPath: projectRoot, ...payload, payload,
}
fs.writeFileSync(path.join(projectRoot, 'project.json'), JSON.stringify(project, null, 2))
fs.writeFileSync(path.join(projectRoot, '.nomi', 'project.json'), JSON.stringify(project, null, 2))

const shots = {
  zhLight: process.env.CLIP_LABEL_SHOT_ZH_LIGHT ?? path.join(os.tmpdir(), 'nomi-clip-label-zh-light.png'),
  enDark: process.env.CLIP_LABEL_SHOT_EN_DARK ?? path.join(os.tmpdir(), 'nomi-clip-label-en-dark.png'),
}
// 每个场景各起一次 app（语言 / 主题换了要整页重来，同一进程里 reload 会落在不同页面）。
let app
let win
async function launch() {
  const launched = await launchNomiApp({ name: 'clip-label-under-handle', userDataDir: settingsDir, settingsDir, projectsDir, settleMs: 1200 })
  app = launched.app
  win = launched.win
  await (await app.browserWindow(win)).evaluate((window) => { window.setIgnoreMouseEvents(true); window.setPosition(-12000, 0) })
}
async function closeApp() { await app?.close().catch(() => {}) }

async function openCanvas({ locale, scheme }) {
  await win.evaluate(({ locale: nextLocale, scheme: nextScheme }) => {
    localStorage.setItem('nomi:locale:v1', nextLocale)
    localStorage.setItem('nomi-color-scheme', nextScheme)
    for (const key of ['nomi:splash:v1', 'nomi:journey-tour:v1', 'nomi:canvas-gesture-hint:v1']) localStorage.setItem(key, 'seen')
  }, { locale, scheme })
  await win.reload()
  await win.waitForLoadState('domcontentloaded')
  const clipNodeEl = win.locator('[data-clip-node="true"][data-node-id="clip-editor"]')
  if (!(await clipNodeEl.isVisible().catch(() => false))) {
    const projectCard = win.locator('[data-project-card]').first()
    await projectCard.waitFor({ state: 'visible' })
    await projectCard.hover()
    await projectCard.dblclick()
    await win.locator('button,[role="tab"]', { hasText: /^(生成|Generate)$/ }).first().click().catch(() => {})
  }
  await clipNodeEl.waitFor({ state: 'visible' })
  await waitForCanvasViewportSettled(win)
  await canvasResetView(win)
  await waitForCanvasViewportSettled(win)
  await applyColorSchemeForShot(win, scheme)
  return clipNodeEl
}

// 量一个片段的标签：首字符左边界（Range 量文字，不看盒子）与两侧手柄的内边缘、标签两侧内边距。
async function measure(clipItem) {
  return clipItem.evaluate((item) => {
    const label = item.querySelector('[data-clip-label="true"]')
    const left = item.querySelector('[data-clip-handle-edge="left"]')
    const right = item.querySelector('[data-clip-handle-edge="right"]')
    if (!label || !left || !right || !label.firstChild) return null
    const range = document.createRange()
    range.setStart(label.firstChild, 0)
    range.setEnd(label.firstChild, 1)
    const style = getComputedStyle(label)
    return {
      text: label.textContent,
      firstCharLeft: range.getBoundingClientRect().left,
      leftHandleRight: left.getBoundingClientRect().right,
      rightHandleLeft: right.getBoundingClientRect().left,
      labelRight: label.getBoundingClientRect().right,
      padLeft: Number.parseFloat(style.paddingLeft),
      padRight: Number.parseFloat(style.paddingRight),
      leftHandleWidth: left.getBoundingClientRect().width,
      rightHandleWidth: right.getBoundingClientRect().width,
    }
  })
}

const failures = []
const record = (name, ok, detail) => { if (!ok) failures.push(`${name} ${JSON.stringify(detail)}`) }

try {
  for (const scenario of [
    { locale: 'zh-CN', scheme: 'light', shot: shots.zhLight },
    { locale: 'en', scheme: 'dark', shot: shots.enDark },
  ]) {
    await launch()
    const node = await openCanvas(scenario)
    const items = node.locator('[data-clip-id]')
    await items.first().waitFor({ state: 'visible' })
    const first = items.nth(0)
    const second = items.nth(1)
    // 选中第一个（手柄加宽），悬停第二个（手柄浮现）。
    await first.click({ position: { x: 24, y: 12 } })
    await second.hover({ position: { x: 24, y: 12 } })
    for (const [name, item] of [['selected', first], ['hovered', second]]) {
      const m = await measure(item)
      const tag = `${scenario.locale}/${scenario.scheme}/${name}`
      record(`${tag}: 找到标签与手柄`, Boolean(m), m)
      if (!m) continue
      record(`${tag}: 首字符左边界 >= 左手柄右边界`, m.firstCharLeft >= m.leftHandleRight - 0.5, m)
      record(`${tag}: 左内边距 >= 左手柄宽`, m.padLeft >= m.leftHandleWidth - 0.5, m)
      record(`${tag}: 右内边距 >= 右手柄宽`, m.padRight >= m.rightHandleWidth - 0.5, m)
      record(`${tag}: 文字区没伸到右手柄下`, m.labelRight - m.padRight <= m.rightHandleLeft + 0.5, m)
    }
    await screenshotSettled(node, { path: scenario.shot })
    await closeApp()
  }
  console.log(JSON.stringify({ ok: failures.length === 0, failures, shots }, null, 2))
  await closeApp()
  process.exit(failures.length === 0 ? 0 : 1)
} catch (error) {
  console.error(error)
  await closeApp()
  process.exit(1)
}
