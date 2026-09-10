import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { runMultiNodeDrag } from './dragScenarios.mjs'

test('selection workload reaches both cards without activating an occluding action', async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
    await page.setContent(`
      <style>
        body { margin: 0 }
        .generation-canvas-v2__stage { position: relative; width: 1000px; height: 700px }
        .generation-canvas-v2-node { position: absolute; top: 100px; width: 320px; height: 180px; background: #ddd }
        button { position: absolute; top: 0; left: 100px; width: 120px; height: 40px }
      </style>
      <main class="generation-canvas-v2__stage">
        <div class="generation-canvas-v2-node" data-node-id="first" style="left:100px"><button>Timeline action</button></div>
        <div class="generation-canvas-v2-node" data-node-id="second" style="left:500px"><button>Timeline action</button></div>
      </main>
      <script>
        window.actionCount = 0
        document.querySelectorAll('button').forEach(button => button.addEventListener('click', () => window.actionCount++))
        document.querySelectorAll('.generation-canvas-v2-node').forEach(node => node.addEventListener('pointerdown', event => {
          if (event.shiftKey && !event.target.closest('button')) node.dataset.selected = 'true'
        }))
      </script>
    `)
    // The old x=45%, y=14 input lands on an action in this real DOM.
    assert.equal(await page.evaluate(() => document.elementFromPoint(244, 114)?.tagName), 'BUTTON')
    const result = await runMultiNodeDrag(page)
    assert.equal(result.requested, 2)
    assert.equal(result.selected, 2)
    assert.equal(await page.evaluate(() => window.actionCount), 0)
  } finally {
    await browser.close()
  }
})
