import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { scanFeel } from './_feel.mjs'

const cases = [
  ['text-overlap', '<div><span style="position:absolute;left:20px;top:20px">alpha</span></div><section><span style="position:absolute;left:20px;top:20px">bravo</span></section>', '<div>alpha</div><section>bravo</section>'],
  ['out-of-viewport', '<span style="position:absolute;left:310px;width:100px">outside</span>', '<div style="overflow:auto;width:100px;height:60px"><div style="width:800px;height:400px;position:relative"><button style="position:absolute;left:500px">node</button></div></div>'],
  ['clipped-content', '<div style="height:5px;overflow:hidden">clipped text</div>', '<div style="height:5px;overflow:auto">scrollable text</div>'],
  ['font-size', '<span style="font-size:8px">tiny</span>', '<span style="font-size:16px">readable</span>'],
  ['unreachable-interaction', '<button style="pointer-events:none">go</button>', '<button>go</button>'],
  ['blocked-interaction', '<button style="position:absolute;left:20px;top:20px">go</button><div style="position:absolute;left:0;top:0;width:200px;height:100px;background:white"></div>', '<button>go</button>'],
]

for (const [rule, red, green] of cases) {
  test(`${rule}: red defect / green correction`, async () => {
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({ viewport: { width: 320, height: 200 } })
      await page.setContent(red)
      const failed = await scanFeel(page)
      assert.ok(failed.findings.some((finding) => finding.rule === rule), `missing ${rule}`)
      await page.setContent(green)
      const passed = await scanFeel(page)
      assert.ok(!passed.findings.some((finding) => finding.rule === rule), `false positive ${rule}`)
    } finally {
      await browser.close()
    }
  })
}

test('locator root excludes unrelated defects; ancestor text is not duplicated', async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.setContent('<main><p>readable <span>nested text</span></p></main><aside style="font-size:8px">tiny</aside>')
    const result = await scanFeel(page.locator('main'))
    assert.deepEqual(result.findings, [])
  } finally {
    await browser.close()
  }
})
