import fs from 'node:fs/promises'
import path from 'node:path'
import { launchNomiApp } from './_launchApp.mjs'
import { expect, expectVisible } from './_assert.mjs'
import { assertLabPortOwnership, labOriginFor } from './design-lab/labServer.mjs'

assertLabPortOwnership('visual')
const root = path.resolve('docs/plan/process-feedback-evidence')
const origin = labOriginFor('visual')
const application = await launchNomiApp({ name: 'nomi-process-feedback', env: { VITE_DEV_SERVER_URL: origin }, settleMs: 0 })
const receipt = []
try {
  const page = application.win
  await page.setViewportSize({ width: 900, height: 680 })
  await page.goto(`${origin}/design-lab.html?screen=process-feedback&frame=1&state=pf-zoom-60`)
  await expectVisible(page.locator('[data-process-lab-ready]'), 'Electron 加载真实节点与任务/时间轴宿主')
  await expectVisible(page.locator('[data-node-id] [data-generation-status]'), 'Electron 60% 状态条可见')
  await page.screenshot({ path: path.join(root, 'electron-zoom-60.png') })
  receipt.push({ surface: 'electron', check: 'zoom-60', result: 'green' })
  await page.goto(`${origin}/design-lab.html?screen=process-feedback&frame=1&state=pf-audio-generating`)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expectVisible(page.locator('[data-generation-waiting][data-process-motion=reduced]'), 'Electron 减弱动态效果已生效')
  await expect(page.locator('[data-process-dot]')).toHaveCSS('opacity', '1')
  await expect(page.locator('[data-process-sheen]')).toHaveCSS('transform', 'none')
  const messages = await Promise.all(['[data-node-id]', '[data-process-task]', '[data-process-timeline]'].map((selector) => page.locator(`${selector} [data-generation-message]`).innerText()))
  expect(new Set(messages).size).toBe(1)
  await page.screenshot({ path: path.join(root, 'electron-reduced-motion.png') })
  receipt.push({ surface: 'electron', check: 'reduced-motion', result: 'green', messages })
} finally {
  await fs.writeFile(path.join(root, 'electron-acceptance.json'), JSON.stringify(receipt, null, 2) + '\n')
  await application.close()
  await fs.rm(application.tempRoot, { recursive: true, force: true })
}
console.log('Electron process feedback walkthrough passed.')
