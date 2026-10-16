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
import { expect, screenshotSettled, applyColorSchemeForShot, proveProbe, expectAbsent } from './_assert.mjs'
import { canvasFitViewButton, openRailDrawer, revealCanvasDock } from './_shell.mjs'
import { uiText } from './full-walk/invariants.mjs'
import { stationTimeout } from './_station-budget.mjs'

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
    id, kind, title: id, categoryId: type === 'audio' ? 'audio' : 'shots',
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
    { id: 'clip', kind: 'clip', title: 'clip', categoryId: 'shots', position: { x: 80, y: 690 }, exactPosition: true, size: { width: 760, height: 132 }, status: 'idle', meta: { clip: { nodeRole: 'clip', sourceNodeIds: [], clips: [] } } },
  ]
  const timeline = {
    version: 1, fps: 30, scale: 1, playheadFrame: 0,
    tracks: [
      { id: 'image-track', type: 'image', label: 'Image', clips: [{ id: 'baseline', sourceNodeId: 'legacy-output', type: 'image', url: url('frame-2.png'), label: 'baseline', startFrame: 0, endFrame: 60, frameCount: 60, offsetStartFrame: 0, offsetEndFrame: 0 }] },
      { id: 'video-track', type: 'video', label: 'Video', clips: [] },
      { id: 'audio-track', type: 'audio', label: 'Audio', clips: [] },
    ],
  }
  const generationCanvas = { nodes, edges: [], groups: [], selectedNodeIds: [], canvasZoom: 1, canvasPan: { x: 0, y: 0 } }
  const payload = { workbenchDocument: null, timeline, generationCanvas, storyboardPlan: null, storyboardPlanCommitted: false }
  const project = {
    id: projectId, name: `Timeline toolbar acceptance ${locale}`, version: 2, createdAt: 1, updatedAt: 1, savedAt: 1, revision: 1,
    lastKnownRootPath: projectRoot,
    ...payload, payload,
  }
  for (const relative of ['project.json', '.nomi/project.json']) fs.writeFileSync(path.join(projectRoot, relative), JSON.stringify(project))
  return { projectsDir, project, imageUrl2: url('frame-2.png') }
}

async function openProject(app, library, name, locale) {
  const card = library.locator('[data-project-card]', { hasText: name }).first()
  await expect(card).toBeVisible({ timeout: stationTimeout({ operations: 2 }) })
  await card.dblclick()
  let projectWin = library
  await expect.poll(() => {
    projectWin = app.windows().filter((candidate) => !candidate.isClosed()).find((candidate) => /projectId=/.test(candidate.url())) || library
    win = projectWin // Retain the actual scene for a startup-failure screenshot too.
    return /projectId=/.test(projectWin.url())
  }, { timeout: stationTimeout({ operations: 2 }) }).toBe(true)
  await projectWin.getByRole('button', { name: locale === 'en' ? 'Generate' : '生成', exact: true }).first().click()
  await expect(projectWin.locator('.generation-canvas-v2__stage')).toBeVisible()
  await expect(node(projectWin, 'image')).toBeAttached()
  await fit(projectWin)
  return projectWin
}

const node = (win, id) => win.locator(`article.generation-canvas-v2-node[data-node-id="${id}"]`)
// 旧版镜头 / 输出节点没有图片浮条（恢复原显示条件），入口是悬停把手；其余节点入口在浮条里。
const hasToolbar = (id) => !id.startsWith('legacy-')
const action = (win, id) => node(win, id).locator(hasToolbar(id)
  ? '[data-node-floating-toolbar] [data-toolbar-action="add-to-timeline"]'
  : '[data-node-timeline-hover-handle] [data-toolbar-action="add-to-timeline"]')
const timeline = (win) => win.locator('.workbench-generation__timeline')
const timelineMime = 'application/x-tapcanvas-generation-node'
async function nativeToolbarDrag(win, source, target, { targetPosition, alt = false }) {
  const sourceTransform = () => source.evaluate((el) => el.closest('.react-flow__node')?.style.transform)
  const before = await sourceTransform()
  assert.ok(before, 'Native toolbar drag must start from an actual canvas node')
  await win.evaluate(() => {
    const events = []
    const root = document.getElementById('root')
    if (!root) throw new Error('Actual React root missing')
    const read = (event, phase) => events.push({
      type: event.type, phase, altKey: event.altKey,
      action: event.target.closest?.('[data-toolbar-action]')?.getAttribute('data-toolbar-action'),
      types: Array.from(event.dataTransfer?.types ?? []),
    })
    const capture = (event) => read(event, 'capture')
    const bubble = (event) => read(event, 'after-react-root')
    for (const type of ['dragstart', 'drop']) window.addEventListener(type, capture, true)
    root.addEventListener('dragstart', bubble)
    window.__nomiTimelineNativeDragProbe = { events, stop: () => {
      for (const type of ['dragstart', 'drop']) window.removeEventListener(type, capture, true)
      root.removeEventListener('dragstart', bubble)
    } }

  })
  let events
  try {
    if (alt) await win.keyboard.down('Alt')
    await source.dragTo(target, { targetPosition })
  } finally {
    if (alt) await win.keyboard.up('Alt')
    events = await win.evaluate(() => {
      const probe = window.__nomiTimelineNativeDragProbe
      probe.stop()
      delete window.__nomiTimelineNativeDragProbe
      return probe.events
    })
  }
  console.log('NOMI_NATIVE_PROBE', JSON.stringify({ events, before, after: await sourceTransform() }))
  assert.equal(events.filter((event) => event.type === 'dragstart' && event.action === 'add-to-timeline' && event.types.includes(timelineMime)).length, 1, 'The icon must start native HTML dragging with the production timeline MIME')
  assert.equal(events.filter((event) => event.type === 'drop' && event.types.includes(timelineMime)).length, 1, 'The native payload must reach a real drop target')
  assert.equal(await sourceTransform(), before, 'Dragging the toolbar action must leave its source node in place')
  return events
}
async function freeImageTrackPoint(win, track) {
  const baseline = timeline(win).locator('[data-clip-id="baseline"]')
  await expect(baseline).toBeVisible()
  const baselineRect = await baseline.boundingBox()
  const lane = await track.boundingBox()
  assert.ok(baselineRect && lane, 'A real baseline clip and track must establish drop geometry')
  const scale = baselineRect.width / 60
  const frame = 75
  const targetPosition = { x: scale * (frame + 0.5), y: 24 }
  const hittable = await track.evaluate((el, point) => {
    const rect = el.getBoundingClientRect()
    const x = rect.left + point.x, y = rect.top + point.y
    const hit = document.elementFromPoint(x, y)
    return x < innerWidth && y < innerHeight && el.contains(hit) && !hit.closest('[data-testid="timeline-clip"]')
  }, targetPosition)
  assert.ok(hittable, 'The requested free drop frame must be visible empty track space')
  assert.ok(lane.x + targetPosition.x > baselineRect.x + baselineRect.width, 'Free drop must be beyond the occupied baseline')
  assert.equal(Math.floor(targetPosition.x / scale), frame, 'Use the production floor(pixel / scale) frame convention')
  return { targetPosition, frame }
}
async function fit(win) {
  const fitButton = canvasFitViewButton(win)
  await revealCanvasDock(win, fitButton, 'fit persisted real-media canvas')
  await fitButton.click()
}
async function clearSelection(win) {
  // Category changes preserve selection outside the visible category. Clear it through
  // the real pane before selecting one media node; a multi-selection hides its toolbar.
  const pane = win.locator('.generation-canvas-v2__stage .react-flow__pane')
  const blank = await pane.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    for (const [x, y] of [[8, 8], [24, 24], [rect.width - 8, 8], [8, rect.height / 2], [rect.width - 8, rect.height / 2], [8, rect.height - 50]]) {
      if (document.elementFromPoint(rect.left + x, rect.top + y) === el) return { x, y }
    }
    return null
  })
  assert.ok(blank, 'Selection requires a genuinely empty, hittable canvas pane')
  await pane.click({ position: blank })
}
async function select(win, id) {
  if (await node(win, id).count() === 0) {
    await openRailDrawer(win, 'catalog')
    const category = win.locator(`[data-category-id="${id === 'audio' ? 'audio' : 'shots'}"]`)
    for (let attempt = 0; attempt < 2 && await category.getAttribute('data-active') !== 'true'; attempt++) await category.click()
    await expect(category).toHaveAttribute('data-active', 'true')
    await win.keyboard.press('Escape')
    await expect(node(win, id)).toBeAttached()
    await fit(win)
  }
  await clearSelection(win)
  const rect = await node(win, id).boundingBox()
  assert.ok(rect, `${id}: node must be rendered before selection`)
  // The sides belong to reference handles; video controls belong to its lower edge.
  // Select using a real interior hit, away from both existing interaction surfaces.
  await node(win, id).click({ position: { x: rect.width / 2, y: rect.height / 5 } })
  await expect(node(win, id)).toHaveAttribute('data-selected', 'true')
  await expect(win.locator('article.generation-canvas-v2-node[data-selected="true"]')).toHaveCount(1)
  const button = action(win, id)
  await expect(button).toHaveCount(1)
  await expect(button).toBeVisible()
  await expect(button.locator('.tabler-icon-timeline')).toHaveCount(1)
  assert.equal(await button.evaluate((el) => el.tagName), 'BUTTON', 'Keyboard semantics must use a real button')
  assert.equal(await button.getAttribute('draggable'), 'true', 'Icon must preserve native timeline dragging')
  await expectAbsent(node(win, id).locator(':scope > [role="button"][draggable="true"]'), {
    provenBy: await proveProbe(button, `${id}: real toolbar action is present`), message: `${id}: old direct-child notch is absent`,
  })
  return button
}
async function undo(win, locale) {
  await timeline(win).getByRole('button', { name: uiText(locale, 'timelineEditor.undo'), exact: true }).click()
}
async function collapseTimeline(win) {
  const collapse = timeline(win).locator('[data-timeline-collapse="true"]')
  if (await collapse.isVisible()) await collapse.click()
  await fit(win)
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
  await expect(bar.getByRole('button', { name: uiText(locale, 'generationCommon.provenance.view'), exact: true })).toHaveCount(1)
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
    {
      // Prove the persisted occupied track before testing append; normalization rejects incomplete clips.
      await win.locator('[data-timeline-strip]').click()
      await expect(timeline(win).locator('[data-clip-id="baseline"]')).toHaveCount(1)
      await expect(timeline(win).locator('[data-clip-id="baseline"]')).toBeVisible()
      await collapseTimeline(win)
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
        await expect(win.getByText(uiText(locale, 'timelineEditor.addedToEnd'), { exact: true }).first()).toBeVisible()
        await shot(win, `${locale}-click-${id}-applied`)
        const addedProof = await proveProbe(added, `${id}: added timeline clip exists before Undo`)
        await undo(win, locale)
        await expectAbsent(added, { provenBy: addedProof, message: `${id}: Undo removes the actual added clip` })
        await expect(timeline(win).locator('[data-clip-id="baseline"]')).toHaveCount(1)
        record(`${locale} ${id}: ${activation} appends on correct track, truthful receipt, one UI Undo restores baseline`)
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
      const latestProof = await proveProbe(latest, 'latest main result is present on the real timeline')
      await expectAbsent(timeline(win).locator('[data-testid="timeline-clip"][data-clip-id*="image-r1"]'), {
        provenBy: latestProof, message: 'Adoption consumes the latest result rather than the previous primary',
      })
      await undo(win, locale)
      await expectAbsent(latest, { provenBy: latestProof, message: 'Undo removes latest-result click adoption' })
      record(`${locale} Switch primary: click consumes latest real result`)

      // Observe real native events: a canvas-node pointer drag can also adopt, but is a different path.
      const source = await select(win, 'image')
      const imageTrack = timeline(win).locator('[data-track-type="image"] .workbench-timeline-track__clips')
      const defaultDrop = await freeImageTrackPoint(win, imageTrack)
      const appendEvents = await nativeToolbarDrag(win, source, imageTrack, defaultDrop)
      await expect(latest).toHaveCount(1)
      assert.ok((await latest.getAttribute('data-clip-id')).endsWith('-60'), 'Default native drag must use track-tail placement')
      const defaultDragProof = await proveProbe(latest, 'default native drag produced the latest-result timeline clip')
      await shot(win, `${locale}-native-drag-global-timeline-append`)
      await undo(win, locale)
      await expectAbsent(latest, { provenBy: defaultDragProof, message: 'One UI Undo removes default native drag adoption' })
      record(`${locale} Latest main result: default native icon drag appends, source stays still, one UI Undo restores baseline`, { nativeEvents: appendEvents })
      const freeDrop = await freeImageTrackPoint(win, imageTrack)
      const positionEvents = await nativeToolbarDrag(win, await select(win, 'image'), imageTrack, { ...freeDrop, alt: true })
      await expect(latest).toHaveCount(1)
      assert.ok((await latest.getAttribute('data-clip-id')).endsWith(`-${freeDrop.frame}`), 'Alt native drag must use the requested legal frame beyond the tail')
      const draggedProof = await proveProbe(latest, 'native drag produced the latest-result timeline clip')
      await expect(win.getByText(uiText(locale, 'timelineEditor.addedAtPosition'), { exact: true }).first()).toBeVisible()
      await shot(win, `${locale}-native-drag-global-timeline`)
      await undo(win, locale)
      await expectAbsent(latest, { provenBy: draggedProof, message: 'One UI Undo removes the native dragged clip' })
      record(`${locale} Latest main result: Alt native icon drag reaches frame 75, source stays still, one UI Undo restores baseline`, { nativeEvents: positionEvents })
      // 用户 10-12 拍板「悬停也能拖」：未选中（浮条不在）的节点，悬停就能把它拖进时间轴。
      await clearSelection(win)
      await expect(win.locator('article.generation-canvas-v2-node[data-selected="true"]')).toHaveCount(0)
      const hoverRect = await node(win, 'image').boundingBox()
      assert.ok(hoverRect, 'image node must be rendered for the hover-drag step')
      await node(win, 'image').hover({ position: { x: hoverRect.width / 2, y: hoverRect.height / 2 } })
      const hoverWrap = node(win, 'image').locator('[data-node-timeline-hover-handle]')
      await expect(hoverWrap).toHaveCSS('opacity', '1')
      await expect(node(win, 'image').locator('[data-node-floating-toolbar]')).toHaveCount(0)
      // 把手不许占节点本体：它的盒子与节点盒子不相交，节点上每一点的点选 / 框选 / 拖动都碰不到它。
      const [handleBox, nodeBox] = await Promise.all([hoverWrap.boundingBox(), node(win, 'image').locator('.generation-canvas-v2-node__preview').boundingBox()])
      assert.ok(handleBox && nodeBox, 'hover handle and node preview must both have boxes')
      assert.ok(handleBox.y + handleBox.height <= nodeBox.y + 1, 'Hover handle must sit entirely above the node body')
      const hoverSource = hoverWrap.locator('[data-toolbar-action="add-to-timeline"]')
      await expect(hoverSource).toHaveCount(1)
      // screenshotSettled 会把鼠标挪开，把手随之收起；这里要拍到悬停态，直接截当前画面。
      const hoverShot = path.join(output, `${locale}-hover-handle-unselected.png`)
      await win.screenshot({ path: hoverShot })
      receipt.screenshots.push(hoverShot)
      const hoverDrop = await freeImageTrackPoint(win, imageTrack)
      // 截图与量落点之间鼠标可能被挪开；真实用户是先悬停节点再抓把手，这里同样先回到节点上。
      await node(win, 'image').hover({ position: { x: hoverRect.width / 2, y: hoverRect.height / 2 } })
      const hoverEvents = await nativeToolbarDrag(win, hoverSource, imageTrack, hoverDrop)
      await expect(latest).toHaveCount(1)
      assert.ok((await latest.getAttribute('data-clip-id')).endsWith('-60'), 'Hover native drag must use track-tail placement')
      const hoverProof = await proveProbe(latest, 'hover native drag produced the latest-result timeline clip')
      await shot(win, `${locale}-hover-drag-global-timeline`)
      await undo(win, locale)
      await expectAbsent(latest, { provenBy: hoverProof, message: 'One UI Undo removes the hover-dragged clip' })
      record(`${locale} Unselected node: hover shows the drag handle, native drag appends, source stays still, one UI Undo restores baseline`, { nativeEvents: hoverEvents })
      await collapseTimeline(win)
      const clipTarget = node(win, 'clip').locator('[data-testid="clip-node-axis-content"]')
      const clipEvents = await nativeToolbarDrag(win, await select(win, 'image'), clipTarget, { targetPosition: { x: 120, y: 70 } })
      await expect(node(win, 'clip').locator('[data-testid="clip-node-clip"]')).toHaveCount(1)
      await expect(node(win, 'clip').locator('[data-testid="clip-node-clip"] img')).toHaveAttribute('src', fixture.imageUrl2)
      await shot(win, `${locale}-native-drag-clip-node`)
      record(`${locale} Latest main result: native icon drag reaches clip-node timeline, source stays still`, { nativeEvents: clipEvents })
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
    await fit(win)
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
    await expectAbsent(win.locator('[data-floating-toolbar-failed]'), {
      provenBy: await proveProbe(action(win, 'video'), 'actual video toolbar remains mounted'), message: 'No floating toolbar error-boundary fallback',
    })
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
