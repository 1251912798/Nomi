import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { labOriginFor, labPortFor, assertLabPortOwnership } from './design-lab/labServer.mjs'
import { launchNomiApp } from './_launchApp.mjs'
import { expect, proveProbe, expectAbsent } from './_assert.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { runNodeLabelProjectJourney } from './node-label-project-journey.mjs'

const role = 'walk-canvas-frame'
const origin = labOriginFor(role)
const ownership = assertLabPortOwnership(role)
if (!['free', 'ours'].includes(ownership.status)) throw new Error('Cannot prove lab server ownership')
const server = ownership.status === 'free' ? spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(labPortFor(role)), '--strictPort'], { stdio: 'ignore' }) : null
await expect.poll(async () => { try { return (await fetch(`${origin}/design-lab.html`)).ok } catch { return false } }, { timeout: stationTimeout({ operations: 4 }) }).toBe(true)
if (assertLabPortOwnership(role).status !== 'ours') throw new Error('Lab server does not belong to this worktree')
const out = path.resolve('docs/plan/2026-09-09-node-label-evidence')
fs.mkdirSync(out, { recursive: true })
const { app, win } = await launchNomiApp({ name: 'node-label-outside', env: { VITE_DEV_SERVER_URL: origin } })
try {
  await win.goto(`${origin}/design-lab.html?screen=canvas-frame&frame=1&state=canvas-frame-shot-label-outside`)
  await expect(win.locator('[data-label-stage] .generation-canvas-v2-node')).toBeVisible()
  const mutate = async (kind, zoom = 1, selected = false, details = false) => win.evaluate(async (detail) => {
    const { setShotLabelFixture } = await import('/src/devlab/designLab/canvasFrame/shotLabelFixture.ts')
    setShotLabelFixture(detail)
  }, { kind, zoom, selected, details })
  const measure = () => win.locator('.generation-canvas-v2-node').evaluate((node) => {
    const media = node.querySelector('.generation-canvas-v2-node__preview').getBoundingClientRect()
    const label = node.querySelector('[data-shot-number]')
    const rect = label.getBoundingClientRect()
    const area = Math.max(0, Math.min(media.right, rect.right) - Math.max(media.left, rect.left)) * Math.max(0, Math.min(media.bottom, rect.bottom) - Math.max(media.top, rect.top))
    return { area, top: rect.top, bottom: rect.bottom, mediaTop: media.top }
  })
  for (const kind of ['empty', 'image']) {
    await mutate(kind)
    if (kind === 'image') await expect(win.locator('.generation-canvas-v2-node__preview img')).toBeVisible()
    await win.screenshot({ path: path.join(out, `${process.env.LABEL_RED ? 'before' : 'after'}-${kind}.png`) })
    console.log(kind, await measure())
  }
  await expect.poll(async () => (await measure()).area, '常驻镜头标签遮挡媒体面积必须为零').toBe(0)
  await expect.poll(async () => { const m = await measure(); return m.bottom <= m.mediaTop }).toBe(true)
  const receipts = []
  for (const kind of ['empty', 'image', 'video']) {
    for (const zoom of [0.2, 0.4, 1, 2]) {
      await mutate(kind, zoom, true)
      const row = win.locator('[data-node-label-row]')
      if (zoom < 0.4) await expect(row).toBeHidden()
      else await expect(row).toBeVisible()
      const toolbar = win.locator('[data-node-floating-toolbar]')
      await expect(toolbar).toBeVisible()
      if (kind === 'image') await expect(win.locator('.generation-canvas-v2-node__preview img')).toBeVisible()
      if (kind === 'video') {
        await expect.poll(() => win.locator('[data-node-preview-video]').evaluate((v) => v.readyState)).toBeGreaterThanOrEqual(2)
        await win.mouse.move(1200, 900)
        await expect.poll(() => win.locator('[data-node-preview-video]').evaluate((v) => v.controls)).toBe(false)
      }
      const geometry = await win.locator('.generation-canvas-v2-node').evaluate((node) => {
        const media = node.querySelector('.generation-canvas-v2-node__preview').getBoundingClientRect()
        const row = node.querySelector('[data-node-label-row]')
        const r = row.getBoundingClientRect()
        const t = node.querySelector('[data-node-floating-toolbar]').getBoundingClientRect()
        const overlaps = [...row.querySelectorAll('*')].filter((e) => getComputedStyle(e).visibility !== 'hidden').map((e) => {
          const b = e.getBoundingClientRect()
          return Math.max(0, Math.min(media.right, b.right) - Math.max(media.left, b.left)) * Math.max(0, Math.min(media.bottom, b.bottom) - Math.max(media.top, b.top))
        })
        return { area: overlaps.reduce((sum, n) => sum + n, 0), rowBottom: r.bottom, mediaTop: media.top, toolbarBottom: t.bottom, rowTop: r.top, rowLeft: r.left, mediaLeft: media.left }
      })
      expect(geometry.area).toBe(0)
      expect(geometry.rowBottom).toBeLessThanOrEqual(geometry.mediaTop)
      expect(geometry.toolbarBottom).toBeLessThan(geometry.rowTop)
      expect(geometry.rowLeft).toBe(geometry.mediaLeft)
      receipts.push({ kind, zoom, ...geometry })
      await win.screenshot({ path: path.join(out, `${kind}-selected-${zoom}.png`) })
    }
  }
  for (const kind of ['image', 'video']) {
    await mutate(kind, 1, false, true)
    await expect(win.locator('[data-node-mount-badges]')).toBeVisible()
    const selector = kind === 'image' ? '[data-generation-status]' : '[data-decon-node-badge]'
    await expect(win.locator(selector)).toBeVisible()
    const bounds = await win.locator('[data-node-label-row]').evaluate((row) => {
      const media = document.querySelector('.generation-canvas-v2-node__preview').getBoundingClientRect()
      return [...row.querySelectorAll('*')].map((e) => e.getBoundingClientRect().bottom - media.top)
    })
    expect(Math.max(...bounds)).toBeLessThanOrEqual(0)
    await win.screenshot({ path: path.join(out, `${kind}-metadata.png`) })
  }
  await mutate('scene', 1, false)
  const sceneInfo = win.locator('[data-node-scene-info]')
  await expect(sceneInfo).toBeAttached()
  await win.mouse.move(1200, 900)
  await expect(sceneInfo).toHaveCSS('opacity', '0')
  await win.locator('.generation-canvas-v2-node').hover()
  await expect(sceneInfo).toHaveCSS('opacity', '1')
  await win.mouse.move(1200, 900)
  await expect(sceneInfo).toHaveCSS('opacity', '0')
  await mutate('video', 1, false)
  const video = win.locator('[data-node-preview-video]')
  await video.hover()
  await expect.poll(() => video.evaluate((v) => v.controls)).toBe(true)
  await win.mouse.move(1200, 900)
  await expect.poll(() => video.evaluate((v) => v.controls)).toBe(false)
  await video.focus()
  await expect.poll(() => video.evaluate((v) => v.controls)).toBe(true)
  await video.evaluate((v) => v.blur())
  await expect.poll(() => video.evaluate((v) => v.controls)).toBe(false)
  await mutate('image', 1, false)
  await win.locator('.generation-canvas-v2-node__preview').dblclick()
  const dialogProof = await proveProbe(win.getByRole('dialog'), '双击图片确实打开预览')
  await win.screenshot({ path: path.join(out, 'image-expanded.png') })
  await win.keyboard.press('Escape')
  await expectAbsent(win.getByRole('dialog'), { provenBy: dialogProof, message: 'Escape 关闭预览' })
  await mutate('empty', 1, false)
  await expect(win.locator('[data-node-empty-state]')).toBeVisible()
  await win.locator('[data-design-lab-shot="canvas-frame-shot-label-outside"]').screenshot({ path: path.join(out, 'specimen.png') })
  await runNodeLabelProjectJourney(origin, out)
  await runNodeLabelProjectJourney(origin, out, { largeCanvas: true })
  fs.writeFileSync(path.join(out, 'geometry.json'), JSON.stringify(receipts, null, 2) + '\n')
} finally { await app.close(); server?.kill() }
