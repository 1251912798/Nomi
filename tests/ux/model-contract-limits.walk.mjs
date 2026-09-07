// Zero-spend journeys using the real NodeParameterControls and desktop catalog.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { launchNomiApp, repoRoot } from './_launchApp.mjs'
import { expect, expectAbsent, proveProbe } from './_assert.mjs'

const out = path.join(repoRoot, 'artifacts/chip-contract-limits')
fs.mkdirSync(out, { recursive: true })
const port = 5337
const url = `http://127.0.0.1:${port}/tests/ux/fixtures/model-contract-limits-harness.html`
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: repoRoot, stdio: 'ignore' })
let app
try {
  await expect.poll(async () => {
    try { return (await fetch(url)).ok } catch { return false }
  }, { timeout: 30_000 }).toBe(true)
  const launched = await launchNomiApp({ name: 'model-contract-limits', env: { NOMI_DESKTOP_DEV: '1', VITE_DEV_SERVER_URL: url }, syntheticCredentialStorage: true, settleMs: 0 })
  app = launched.app
  const win = launched.win
  win.on('pageerror', error => console.error(error.message))
  await expect(win.locator('[data-contract-stage]')).toBeVisible()
  await expect(win.getByRole('button', { name: '生成参数', exact: true })).toBeVisible()
  await win.getByRole('button', { name: '生成参数', exact: true }).click()
  const panel = win.locator('[data-agent-parameter-panel]')
  await expect(panel).toBeVisible()
  const durationProof = await proveProbe(panel.getByRole('radio', { name: '10', exact: true }), '768p offers ten seconds')
  await panel.getByRole('radio', { name: '1080p', exact: true }).click()
  await expectAbsent(panel.getByRole('radio', { name: '10', exact: true }), { provenBy: durationProof, message: '1080p removes ten seconds' })
  await expect(panel.getByRole('radio', { name: '6', exact: true })).toHaveAttribute('aria-checked', 'true')
  const readMeta = () => win.evaluate(async () => (await import('/src/workbench/generationCanvas/store/generationCanvasStore.ts')).useGenerationCanvasStore.getState().nodes[0].meta)
  await expect.poll(async () => (await readMeta()).duration).toBe(6)
  await win.keyboard.press('Escape')
  await expect(win.getByRole('button', { name: '生成参数', exact: true })).toHaveText('1080p · 6')
  await win.getByRole('button', { name: '生成参数', exact: true }).click()
  await win.screenshot({ path: path.join(out, 'hailuo-1080p-6s.png'), clip: { x: 16, y: 16, width: 600, height: 340 } })
  console.log('PASS: 1080p narrows the real panel to 6s and commits duration=6')
  await panel.getByRole('radio', { name: '768p', exact: true }).click()
  await expect(panel.getByRole('radio', { name: '10', exact: true })).toBeVisible()
  console.log('PASS: returning to 768p restores the 10s option')
  await win.keyboard.press('Escape')
  await win.evaluate(async () => {
    const { useGenerationCanvasStore } = await import('/src/workbench/generationCanvas/store/generationCanvasStore.ts')
    const store = useGenerationCanvasStore.getState()
    const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="gray"/></svg>')
    store.updateNode('contract-video', { meta: { modelKey: 'MiniMax-H3', vendor: 'apimart', archetype: { id: 'minimax-h3-apimart', modeId: 'ref' }, referenceImageUrls: Array.from({ length: 9 }, (_, i) => image + '#' + i), referenceAudioUrls: ['https://example.com/1.mp3', 'https://example.com/2.mp3'] } })
  })
  const addProof = await proveProbe(win.getByRole('button', { name: '加参考', exact: true }), 'eleven references leave one slot')
  await win.evaluate(async () => {
    const store = (await import('/src/workbench/generationCanvas/store/generationCanvasStore.ts')).useGenerationCanvasStore.getState()
    const node = store.nodes[0]
    store.updateNode(node.id, { meta: { ...node.meta, referenceAudioUrls: ['https://example.com/1.mp3', 'https://example.com/2.mp3', 'https://example.com/3.mp3'] } })
  })
  await expect(win.getByText('参考总数最多 12 个（图片、视频和音频合计）', { exact: true })).toBeVisible()
  await expectAbsent(win.getByRole('button', { name: '加参考', exact: true }), { provenBy: addProof, message: 'twelve references remove the add affordance' })
  await win.screenshot({ path: path.join(out, 'h3-total-12.png'), clip: { x: 16, y: 16, width: 950, height: 300 } })
  console.log('PASS: twelve references disable adding other media and explain the shared limit')
  await win.evaluate(async () => {
    const store = (await import('/src/workbench/generationCanvas/store/generationCanvasStore.ts')).useGenerationCanvasStore.getState()
    const node = store.nodes[0]
    store.updateNode(node.id, { meta: { ...node.meta, referenceAudioUrls: ['https://example.com/1.mp3', 'https://example.com/2.mp3'] } })
  })
  await expect(win.getByRole('button', { name: '加参考', exact: true })).toBeVisible()
  console.log('PASS: removing one reference restores the picker; no media silently discarded')
} finally {
  if (app) await app.close()
  vite.kill('SIGTERM')
}
