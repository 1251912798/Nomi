// Independent acceptance V-20261012-TIMELINE: real Electron, real local media, production UI.
// Prepare/build the production change first, then run:
//   node tests/ux/node-timeline-toolbar.walk.mjs
// This does not generate media or call a model. Project seeding is explicit; no product action is mocked.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { makeTempDir } from '../../scripts/_test-temp.mjs'
import { launchNomiApp, repoRoot } from './_launchApp.mjs'
import { expect, screenshotSettled, applyColorSchemeForShot } from './_assert.mjs'
import { canvasFitViewButton } from './_shell.mjs'

const require = createRequire(import.meta.url)
const output = path.join(repoRoot, 'tests/ux/shots/node-timeline-toolbar')
fs.mkdirSync(output, { recursive: true })
const sourceVideo = path.join(repoRoot, 'tests/ux/fixtures/real-shot-640x360.mp4')
const sourceAudio = path.join(repoRoot, 'tests/ux/fixtures/real-narration.mp3')
for (const file of [sourceVideo, sourceAudio]) assert.ok(fs.statSync(file).size > 1000, `Real fixture missing: ${file}`)
const ffmpeg = require('@ffmpeg-installer/ffmpeg').path
const receipt = {
  acceptanceLine: 'V-20261012-TIMELINE', state: 'running', platform: process.platform,
  paidCalls: 0, fixtureSource: ['video-ai-shot-640x360', 'image-ai-shot-frame-png', 'real-narration.mp3'],
  evidenceBoundary: 'Real Electron development build, persisted isolated project, local real AI shot and its extracted frames. No provider or packaged/Windows claim.',
  cases: [], screenshots: [], unverified: ['Packaged app', 'Windows'],
}
const record = (name, detail = {}) => {
  receipt.cases.push({ name, status: 'pass', ...detail })
  console.log(`PASS ${name}`)
}
const shot = async (win, name) => {
  const target = path.join(output, `${name}.png`)
  await screenshotSettled(win, { path: target })
  receipt.screenshots.push(target)
}

function seedProject(root, locale) {
  const projectId = `node-timeline-toolbar-${locale}`
  const projectsDir = path.join(root, 'projects')
  const projectRoot = path.join(projectsDir, projectId)
  const mediaDir = path.join(projectRoot, 'assets/imported')
  fs.mkdirSync(path.join(projectRoot, '.nomi'), { recursive: true })
  fs.mkdirSync(mediaDir, { recursive: true })
  fs.copyFileSync(sourceVideo, path.join(mediaDir, 'real-shot.mp4'))
  fs.copyFileSync(sourceAudio, path.join(mediaDir, 'real-narration.mp3'))
  for (const [name, second] of [['frame-1.png', '0.5'], ['frame-2.png', '2']]) {
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', second, '-i', sourceVideo, '-frames:v', '1', path.join(mediaDir, name)])
    assert.ok(fs.statSync(path.join(mediaDir, name)).size > 200000, 'A real frame must not be a black/synthetic image')
  }
  const digest = (file) => createHash('sha256').update(fs.readFileSync(path.join(mediaDir, file))).digest('hex')
  assert.notEqual(digest('frame-1.png'), digest('frame-2.png'), 'Latest-result check requires two distinct real frames')
  const url = (name) => `nomi-local://asset/${projectId}/assets/imported/${name}`
  const result = (id, type, name, versionNo = 1) => ({ id, type, url: url(name), createdAt: versionNo, versionNo, ...(type !== 'audio' ? { thumbnailUrl: url(type === 'image' ? name : 'frame-1.png') } : {}) })
  const image1 = result('image-r1', 'image', 'frame-1.png')
  const image2 = result('image-r2', 'image', 'frame-2.png', 2)
  const mediaNode = (id, kind, type, name, x, y) => ({
    id, kind, title: id, categoryId: type === 'audio' ? 'audio' : 'assets',
    position: { x, y }, exactPosition: true, size: { width: 280, height: type === 'audio' ? 80 : 190 },
    status: 'success', result: result(`${id}-r1`, type, name),
    meta: { imageWidth: 640, imageHeight: 360, videoWidth: 640, videoHeight: 360 },
  })
  const nodes = [
    { ...mediaNode('image', 'image', 'image', 'frame-1.png', 80, 120), result: image1, history: [image1, image2] },
    mediaNode('video', 'video', 'video', 'real-shot.mp4', 440, 120),
    mediaNode('asset', 'asset', 'image', 'frame-1.png', 80, 400),
    mediaNode('audio', 'audio', 'audio', 'real-narration.mp3', 440, 400),
    mediaNode('legacy-shot', 'shot', 'image', 'frame-1.png', 800, 120),
    mediaNode('legacy-output', 'output', 'image', 'frame-2.png', 800, 400),
    { id: 'clip', kind: 'clip', title: 'clip', categoryId: 'assets', position: { x: 80, y: 690 }, exactPosition: true, size: { width: 760, height: 132 }, status: 'idle', meta: { clip: { nodeRole: 'clip', sourceNodeIds: [], clips: [] } } },
  ]
  const timeline = {
    version: 1, fps: 30, scale: 1, playheadFrame: 0,
    tracks: [
      { id: 'image-track', type: 'image', label: 'Image', clips: [{ id: 'baseline', type: 'image', url: url('frame-2.png'), label: 'baseline', startFrame: 0, endFrame: 60, frameCount: 60, offsetStartFrame: 0, offsetEndFrame: 0 }] },
      { id: 'video-track', type: 'video', label: 'Video', clips: [] },
      { id: 'audio-track', type: 'audio', label: 'Audio', clips: [] },
    ],
  }
  const generationCanvas = { nodes, edges: [], groups: [], selectedNodeIds: [], canvasZoom: 1, canvasPan: { x: 0, y: 0 } }
  const project = {
    id: projectId, name: `Timeline toolbar acceptance ${locale}`, version: 2, createdAt: 1, updatedAt: 1, savedAt: 1, revision: 1,
    lastKnownRootPath: projectRoot,
    payload: { workbenchDocument: null, timeline, generationCanvas, storyboardPlan: null, storyboardPlanCommitted: false },
  }
  for (const relative of ['project.json', '.nomi/project.json']) fs.writeFileSync(path.join(projectRoot, relative), JSON.stringify(project))
  return { projectsDir, project, imageUrl2: url('frame-2.png') }
}

async function openProject(app, library, name, locale) {
  const card = library.locator('[data-project-card]', { hasText: name }).first()
  await expect(card).toBeVisible({ timeout: 30000 })
  await card.dblclick()
  let win = library
  await expect.poll(() => {
    win = app.windows().filter((candidate) => !candidate.isClosed()).find((candidate) => /projectId=/.test(candidate.url())) || library
    return /projectId=/.test(win.url())
  }, { timeout: 30000 }).toBe(true)
  await win.getByRole('button', { name: locale === 'en' ? 'Generate' : '生成', exact: true }).first().click()
  await expect(win.locator('.generation-canvas-v2__stage')).toBeVisible()
  await canvasFitViewButton(win).click()
  return win
}

const node = (win, id) => win.locator(`article.generation-canvas-v2-node[data-node-id="${id}"]`)
const action = (win, id) => node(win, id).locator('[data-node-floating-toolbar] [data-toolbar-action="add-to-timeline"]')
const timeline = (win) => win.locator('.workbench-generation__timeline')
async function select(win, id) {
  const rect = await node(win, id).boundingBox()
  assert.ok(rect, `${id}: node must be rendered before selection`)
  await node(win, id).click({ position: { x: Math.min(20, rect.width / 3), y: rect.height / 2 } })
  await expect(node(win, id)).toHaveAttribute('data-selected', 'true')
  const button = action(win, id)
  await expect(button).toHaveCount(1)
  await expect(button).toBeVisible()
  assert.equal(await button.evaluate((el) => el.tagName), 'BUTTON', 'Keyboard semantics must use a real button')
  assert.equal(await button.getAttribute('draggable'), 'true', 'Icon must preserve native timeline dragging')
  await expect(node(win, id).locator(':scope > [role="button"][draggable="true"]')).toHaveCount(0)
  return button
}
async function undo(win, locale) {
  await timeline(win).getByRole('button', { name: locale === 'en' ? 'Undo timeline edit' : '撤销时间轴编辑', exact: true }).click()
}
async function collapseTimeline(win) {
  const collapse = timeline(win).locator('[data-timeline-collapse="true"]')
  if (await collapse.isVisible()) await collapse.click()
  await canvasFitViewButton(win).click()
}

// board:NodeTimelineToolbar/toolbar.retained
// Positive retained-function checks: moving timeline adoption must not remove existing actions.
async function retainedActions(win, id, locale) {
  if (!['image', 'video', 'audio'].includes(id)) return
  const bar = node(win, id).locator('[data-node-floating-toolbar]')
  const icons = id === 'image'
    ? ['copy', 'scissors', 'brush', 'maximize', 'download', 'info-circle']
    : id === 'video'
      ? ['copy', 'shadow', 'maximize', 'download', 'info-circle']
      : ['copy', 'download', 'info-circle']
  for (const icon of icons) await expect(bar.locator(`.tabler-icon-${icon}`)).toHaveCount(1)
  const menus = id === 'image' ? ['more-effects', 'refine', 'grid'] : id === 'video' ? ['capture-frame', 'break-down'] : []
  for (const menu of menus) await expect(bar.locator(`[data-toolbar-action-menu="${menu}"]`)).toHaveCount(1)
  if (id === 'video') await expect(bar.locator('[data-toolbar-action="trim"]')).toHaveCount(1)
  if (id === 'image') await expect(node(win, id).locator('[data-version-badge]')).toHaveCount(1)
  await expect(bar.getByRole('button', { name: locale === 'en' ? 'Download' : '下载', exact: true })).toHaveCount(1)
  await expect(bar.getByRole('button', { name: locale === 'en' ? 'View generation record' : '查看生成记录', exact: true })).toHaveCount(1)
  record(`board:NodeTimelineToolbar/toolbar.retained ${locale} ${id}`)
}

let active
let win
try {
  for (const locale of ['zh-CN', 'en']) {
    const root = makeTempDir(`nomi-timeline-toolbar-${locale}-`)
    const fixture = seedProject(root, locale)
    active = await launchNomiApp({
      name: `node-timeline-toolbar-${locale}`, tempRoot: root, projectsDir: fixture.projectsDir,
      viewportSize: { width: 1680, height: 1050 }, settleMs: 0,
      initialLocalStorage: {
        'nomi:locale:v1': locale, 'nomi-color-scheme': 'light', 'nomi:splash:v1': 'seen',
        'nomi:journey-tour:v1': 'seen', 'nomi:canvas-gesture-hint:v1': 'seen',
      },
    })
    win = await openProject(active.app, active.win, fixture.project.name, locale)
    await expect(node(win, 'image').locator('.generation-canvas-v2-node__preview img')).toBeVisible()
    await expect.poll(() => node(win, 'image').locator('.generation-canvas-v2-node__preview img').evaluate((img) => img.naturalWidth)).toBe(640)
    for (const id of ['image', 'video', 'asset', 'audio', 'legacy-shot', 'legacy-output']) {
      const button = await select(win, id)
      const expected = locale === 'en' ? /Add to timeline/i : /加入时间轴/
      assert.match(await button.getAttribute('aria-label'), expected)
      await retainedActions(win, id, locale)
      await button.hover()
      await shot(win, `${locale}-light-${id}`)
      record(`${locale} ${id}: one accessible draggable toolbar icon, no notch`)
    }
    if (locale === 'zh-CN') {
      for (const [id, type] of [['image', 'image'], ['video', 'video'], ['asset', 'image'], ['audio', 'audio'], ['legacy-shot', 'image'], ['legacy-output', 'image']]) {
        const button = await select(win, id)
        const activation = id === 'legacy-shot' ? 'Enter' : id === 'legacy-output' ? 'Space' : 'click'
        if (activation === 'click') await button.click()
        else {
          await button.focus()
          await win.keyboard.press(activation)
        }
        const resultId = id === 'image' ? 'image-r1' : `${id}-r1`
        const added = timeline(win).locator(`[data-testid="timeline-clip"][data-clip-id*="${resultId}"]`)
        await expect(added).toHaveCount(1)
        await expect(added).toHaveAttribute('data-clip-type', type)
        if (type === 'image') assert.ok((await added.getAttribute('data-clip-id')).endsWith('-60'), 'Click must append after existing image clip, not the playhead')
        await expect(win.getByText('已加入时间轴末尾', { exact: true }).first()).toBeVisible()
        await shot(win, `zh-click-${id}-applied`)
        await undo(win, locale)
        await expect(added).toHaveCount(0)
        await expect(timeline(win).locator('[data-clip-id="baseline"]')).toHaveCount(1)
        record(`${id}: ${activation} appends on correct track, truthful receipt, one UI Undo restores baseline`)
        await collapseTimeline(win)
      }

      // Change the main version through the existing version-card UI, then consume the current result.
      await select(win, 'image')
      await node(win, 'image').locator('[data-version-badge]').click()
      const second = node(win, 'image').locator('[data-version-identity="image-r2"]')
      await second.hover()
      await second.locator('[data-toolbar-action="set-primary"]').click()
      await win.keyboard.press('Escape')
      await expect(node(win, 'image').locator('.generation-canvas-v2-node__preview img')).toHaveAttribute('src', fixture.imageUrl2)
      await (await select(win, 'image')).click()
      const latest = timeline(win).locator('[data-testid="timeline-clip"][data-clip-id*="image-r2"]')
      await expect(latest).toHaveCount(1)
      await expect(timeline(win).locator('[data-testid="timeline-clip"][data-clip-id*="image-r1"]')).toHaveCount(0)
      await undo(win, locale)
      await expect(latest).toHaveCount(0)
      record('Switch primary: click consumes latest real result')

      // dragTo produces native Chromium drag events; do not synthesize a DataTransfer payload.
      const source = await select(win, 'image')
      const imageTrack = timeline(win).locator('[data-track-type="image"] .workbench-timeline-track__clips')
      await source.dragTo(imageTrack, { targetPosition: { x: 200, y: 24 } })
      await expect(latest).toHaveCount(1)
      await expect(win.getByText('已加入时间轴指定位置', { exact: true }).first()).toBeVisible()
      await shot(win, 'zh-native-drag-global-timeline')
      await undo(win, locale)
      await expect(latest).toHaveCount(0)
      record('Latest main result: native icon drag reaches global timeline and one UI Undo restores baseline')
      await collapseTimeline(win)
      const clipTarget = node(win, 'clip').locator('[data-testid="clip-node-axis-content"]')
      await (await select(win, 'image')).dragTo(clipTarget, { targetPosition: { x: 120, y: 70 } })
      await expect(node(win, 'clip').locator('[data-testid="clip-node-clip"]')).toHaveCount(1)
      await shot(win, 'zh-native-drag-clip-node')
      record('Latest main result: native icon drag reaches clip-node timeline')
    }
    await collapseTimeline(win)
    await applyColorSchemeForShot(win, 'dark')
    for (const id of ['image', 'video']) {
      await select(win, id)
      await shot(win, `${locale}-dark-${id}`)
    }
    const bw = await active.app.browserWindow(win)
    await bw.evaluate((window) => window.setContentSize(1000, 800))
    await win.setViewportSize({ width: 1000, height: 800 })
    await canvasFitViewButton(win).click()
    for (const id of ['image', 'video']) {
      const button = await select(win, id)
      const reachable = await button.evaluate((el) => {
        const rect = el.getBoundingClientRect()
        return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
          && el.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2))
      })
      assert.ok(reachable, `${locale} ${id}: icon must remain hittable in a narrow dark window`)
      await shot(win, `${locale}-dark-narrow-${id}`)
    }
    record(`${locale}: light/dark, image/video, 1000px narrow toolbar stays hittable`)
    await expect(win.locator('[data-floating-toolbar-failed]')).toHaveCount(0)
    await active.close()
    active = null
  }
  receipt.state = 'passed'
} catch (error) {
  receipt.state = 'failed'
  receipt.error = String(error.stack || error)
  if (win && !win.isClosed()) await shot(win, 'FAIL').catch(() => {})
  throw error
} finally {
  fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2))
  if (active) await active.close()
}
