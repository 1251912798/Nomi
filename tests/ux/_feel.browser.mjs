import { test } from 'node:test'
import { expect } from '@playwright/test'
import { chromium } from 'playwright'
import { scanFeel } from './_feel.mjs'

const cases = [
  ['text-overlap', '<div><span style="position:absolute;left:20px;top:20px">alpha</span></div><section><span style="position:absolute;left:20px;top:20px">bravo</span></section>', '<div>alpha</div><section>bravo</section>'],
  ['out-of-viewport', '<style>html,body{overflow:hidden}</style><span style="position:absolute;left:310px;width:100px">outside</span>', '<div style="overflow:auto;width:100px;height:60px"><div style="width:800px;height:400px;position:relative"><button style="position:absolute;left:500px">node</button></div></div>'],
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
      expect(failed.findings.some((finding) => finding.rule === rule), `missing ${rule}`).toBe(true)
      await page.setContent(green)
      const passed = await scanFeel(page)
      expect(passed.findings.some((finding) => finding.rule === rule), `false positive ${rule}`).toBe(false)
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
    expect(result.findings).toEqual([])
  } finally {
    await browser.close()
  }
})


test('text clipped by its own box cannot overlap the next control', async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.setContent('<div style="height:8px;overflow:hidden">Clipped content</div><button>Next</button>')
    const result = await scanFeel(page)
    expect(result.findings.some((finding) => finding.rule === 'clipped-content')).toBe(true)
    expect(result.findings.some((finding) => finding.rule === 'text-overlap')).toBe(false)
  } finally {
    await browser.close()
  }
})


test('ordinary document scrolling is not an out-of-viewport defect', async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 200 } })
    await page.setContent('<main style="height:1000px"><button style="margin-top:800px">Later</button></main>')
    const result = await scanFeel(page)
    expect(result.findings.some((finding) => finding.rule === 'out-of-viewport')).toBe(false)
    expect(result.findings.some((finding) => finding.rule === 'blocked-interaction')).toBe(false)
  } finally {
    await browser.close()
  }
})

// C66 class regression: nested ordinary text, equal hierarchy and semantic exceptions.
test('disclosure hierarchy compares computed lightness and weight', async () => {
  const { measureDisclosureHierarchy } = await import('./_feel.mjs')
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.setContent('<details open><summary style="color:oklch(.68 .01 80)">Process</summary><div style="color:oklch(.3 .01 80);font-weight:500">Read document</div></details>')
    expect((await measureDisclosureHierarchy(page.locator('details'))).violations).toHaveLength(1)
    await page.setContent('<details open style="color:oklch(.5 .01 80);font-weight:400"><summary>Process</summary><div><span>Read document</span></div><span data-status style="color:oklch(.3 .1 140)">Done</span></details>')
    expect((await measureDisclosureHierarchy(page.locator('details'), { exclude: '[data-status]' })).violations).toEqual([])
    await page.locator('details > div').evaluate(el => { el.style.fontWeight = '500' })
    expect((await measureDisclosureHierarchy(page.locator('details'), { exclude: '[data-status]' })).violations).toHaveLength(1)
  } finally { await browser.close() }
})
