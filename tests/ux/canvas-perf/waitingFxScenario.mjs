import { expect } from '../_assert.mjs'

export async function prepareWaitingFx(page) {
  await expect.poll(() => page.evaluate(() => Boolean(window.__nomiCanvasStore))).toBe(true)
  await page.evaluate(() => {
    const store = window.__nomiCanvasStore
    const template = store.getState().nodes.find(node => node.kind === 'image')
    if (!template) throw new Error('Waiting performance fixture requires a real image node')
    const now = Date.now()
    const nodes = Array.from({ length: 8 }, (_, index) => ({
      ...template, id: `waiting-perf-${index}`, kind: 'image', status: 'running', result: undefined, results: [],
      position: { x: 60 + (index % 4) * 290, y: 40 + Math.floor(index / 4) * 230 }, size: { width: 260, height: 180 },
      progress: { phase: 'generating', updatedAt: now },
      runs: [{ id: `waiting-run-${index}`, status: 'running', startedAt: now, updatedAt: now }],
    }))
    store.setState({ nodes, edges: [], groups: [], selectedNodeIds: [] })
  })
  await expect(page.locator('[data-generation-waiting]')).toHaveCount(8)
  if (process.env.PF_FX_BASELINE !== '1') {
    await expect(page.locator('[data-process-fx]')).toHaveCount(4)
    await expect(page.locator('[data-process-static-band]')).toHaveCount(4)
  }
  await page.evaluate(() => new Promise(resolve => {
    let frames = 0
    const frame = () => { if (++frames >= 60) resolve(); else requestAnimationFrame(frame) }
    requestAnimationFrame(frame)
  }))
}

export async function sampleWaitingFx(page) {
  const effectCount = await page.locator('[data-process-fx]').count()
  const staticCount = await page.locator('[data-process-static-band]').count()
  await page.evaluate(() => new Promise(resolve => {
    let frames = 0
    const frame = () => { if (++frames >= 180) resolve(); else requestAnimationFrame(frame) }
    requestAnimationFrame(frame)
  }))
  return { effectCount, staticCount }
}

export async function cleanupWaitingFx(page) {
  await page.evaluate(() => window.__nomiCanvasStore.setState({ nodes: [], edges: [], groups: [], selectedNodeIds: [] }))
  await expect(page.locator('[data-generation-waiting]')).toHaveCount(0)
  await expect(page.locator('.generation-canvas-v2__stage canvas')).toHaveCount(0)
}
