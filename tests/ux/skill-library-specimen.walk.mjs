import path from 'node:path'
import { launchNomiApp } from './_launchApp.mjs'
import { expect } from '@playwright/test'

// Start Vite separately; the specimen reads the real Electron host, not fabricated DTOs.
const base = process.env.NOMI_SKILL_UI_DEV_URL || 'http://127.0.0.1:5297'
const output = path.resolve('docs/design/verification/2026-09-09-skill-library')
const run = await launchNomiApp({ name: 'skill-library-specimen', settleMs: 0, env: { NOMI_RENDERER_URL: base, VITE_DEV_SERVER_URL: base } })
try {
  await run.win.getByRole('button', { name: '新建空白项目', exact: false }).first().waitFor({ timeout: 30000 })
  await run.win.goto(`${base}/docs/design/verification/2026-09-09-skill-library/specimen.html`)
  const window = await run.app.browserWindow(run.win)
  await window.evaluate(w => w.setBounds({ x: 0, y: 0, width: 1440, height: 900 }))
  const card = run.win.locator('[data-skill-card="skill:curated-multi-view"]')
  await card.scrollIntoViewIfNeeded({ timeout: 30000 })
  await expect.poll(() => card.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true)
  await run.win.screenshot({ path: path.join(output, 'specimen-library.png') })
  await card.click()
  await run.win.getByRole('heading', { name: '配方', exact: true }).waitFor()
  await run.win.screenshot({ path: path.join(output, 'specimen-detail.png') })
} finally { await run.close() }
