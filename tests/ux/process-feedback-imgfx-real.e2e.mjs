import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { launchNomiApp } from './_launchApp.mjs'
import { expect, expectVisible } from './_assert.mjs'
import { findCanvasBlankPoint } from './_canvasHit.mjs'
import { createProcessFixture } from './process-feedback-real-fixture.mjs'

const root = path.resolve('.')
const evidence = path.join(root, 'docs/plan/process-feedback-evidence/imgfx/real')
await fs.mkdir(evidence, { recursive: true })
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nomi-imgfx-real-'))
const settingsDir = path.join(tempRoot, 'settings')
const fixture = await createProcessFixture(root, settingsDir)
const { app, win: page } = await launchNomiApp({ name: 'imgfx-real', tempRoot, settingsDir, settleMs: 0,
  env: { NOMI_DISABLE_AUTO_UPDATE: '1' }, args: ['--no-proxy-server'] })
const receipt = { paidCalls: 0, screenshots: [], checks: [], errors: [] }
page.on('pageerror', error => receipt.errors.push(String(error)))
async function shot(name) {
  await page.screenshot({ path: path.join(evidence, `${name}.png`) })
  receipt.screenshots.push(name)
}
try {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expectVisible(page.getByRole('button', { name: /新建空白项目/ }), '隔离实例项目库', 30000)
  await page.evaluate(() => {
    for (const key of ['nomi:splash:v1', 'nomi:journey-tour:v1', 'nomi:canvas-gesture-hint:v1']) localStorage.setItem(key, 'seen')
    localStorage.setItem('__nomiE2E', '1')
  })
  const skip = page.locator('[data-splash-skip=true]')
  if (await skip.isVisible()) await skip.click()
  await page.getByRole('button', { name: /新建空白项目/ }).click()
  await page.getByRole('button', { name: '生成', exact: true }).click()
  await expectVisible(page.locator('.generation-canvas-v2__stage'), '真实生成画布')
  const blank = await findCanvasBlankPoint(page)
  expect(blank).toBeTruthy()
  await page.mouse.click(blank.x, blank.y, { button: 'right' })
  await page.locator('.generation-canvas-v2__context-node-menu [role=menuitem]').filter({ hasText: '图片' }).first().click()
  const node = page.locator('article[data-node-id]').first()
  await expectVisible(node, '真实新建图片节点')
  await node.click({ position: { x: 40, y: 15 } })
  await page.locator('[contenteditable=true]:visible').first().fill('傍晚河边，一位女孩望向远处的桥，电影画面。')
  await page.getByRole('button', { name: '生成素材', exact: true }).click()
  await expectVisible(page.getByText('开始生成', { exact: true }), '生产确认漏斗')
  await page.getByRole('button', { name: '生成', exact: true }).last().click()
  await expect.poll(() => fixture.jobs.length, { timeout: 30000 }).toBe(1)
  await expect(node.locator('[data-generation-message]')).toContainText('生成中', { timeout: 30000 })
  await expectVisible(node.locator('[data-process-fx]'), '生成中真实动效')
  await expect(node.locator('[data-process-fx]')).toHaveAttribute('data-image-count', '0')
  await shot('pf-fx-generating')
  const nodeId = await node.getAttribute('data-node-id')
  const preview = `data:image/jpeg;base64,${(await fs.readFile(path.join(root, 'resources/onboarding-demo/shot-4.jpg'))).toString('base64')}`
  const window = await app.browserWindow(page)
  await window.evaluate((target, { nodeId, preview }) => {
    target.webContents.send('nomi:tasks:comfyui:progress', { nodeId, kind: 'progress', startedNodes: 12, totalNodes: 20 })
    target.webContents.send('nomi:tasks:comfyui:progress', { nodeId, kind: 'preview', previewDataUrl: preview })
  }, { nodeId, preview })
  await expect(node.locator('[data-process-fx]')).toHaveAttribute('data-cycle-phase', 'reveal')
  await expectVisible(node.locator('[data-process-preview-scrim]'), '生产 IPC 预览桥进入真实瞬态 store')
  await expect.poll(() => node.locator('.image-gen-shader').evaluate(el => Number(el.style.opacity))).toBeLessThan(0.75)
  await shot('pf-fx-preview-reveal')
  await expect(node.locator('[data-process-fx]')).toHaveAttribute('data-cycle-phase', 'visible')
  // Observe actual terminal state and overlay removal in one renderer clock domain.
  await page.evaluate(id => {
    const state = { terminalAt: null, removedAt: null }
    window.__pfFxReceipt = state
    const observer = new MutationObserver(() => {
      const node = window.__nomiCanvasStore.getState().nodes.find(n => n.id === id)
      if (node?.status === 'success' && state.terminalAt === null) state.terminalAt = performance.now()
      if (state.terminalAt !== null && !document.querySelector(`article[data-node-id="${id}"] [data-generation-waiting]`)) {
        state.removedAt = performance.now()
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true })
  }, nodeId)
  fixture.jobs[0].done = true
  await expect.poll(() => page.evaluate(id => window.__nomiCanvasStore.getState().nodes.find(n => n.id === id)?.status, nodeId), { timeout: 30000 }).toBe('success')
  await expect(node.locator('[data-process-fx]')).toHaveAttribute('data-cycle-phase', 'reveal')
  await expect.poll(() => node.locator('.image-gen-shader').evaluate(el => Number(el.style.opacity))).toBeLessThan(0.75)
  await shot('pf-fx-final-reveal')
  await expect(node.locator('[data-generation-waiting]')).toHaveCount(0, { timeout: 2000 })
  await expect(node.locator('[data-generating-placement]')).toHaveCount(0)
  await expect(node.locator('canvas')).toHaveCount(0)
  const timing = await page.evaluate(() => window.__pfFxReceipt)
  expect(timing.removedAt).not.toBeNull()
  expect(timing.removedAt - timing.terminalAt).toBeLessThanOrEqual(1200)
  await expectVisible(node.locator('img').first(), '最终真实媒体裸露')
  await page.clock.install()
  await page.clock.runFor(2000)
  await shot('pf-fx-done-clean')
  receipt.checks.push({ criterion: 'real-task-final-clean', result: 'green', ...timing, overlayDurationMs: timing.removedAt - timing.terminalAt })
  expect(receipt.errors).toEqual([])
} catch (error) {
  receipt.failure = String(error)
  await shot('FAIL')
  throw error
} finally {
  await fs.writeFile(path.join(evidence, 'acceptance.json'), JSON.stringify(receipt, null, 2))
  await app.close()
  await fixture.close()
}
