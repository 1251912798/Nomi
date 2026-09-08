import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { compareFeelBaseline, installFeelObserver } from './_feel-observer.mjs'

test('baseline accepts known counts, rejects increases and requires reductions to be recorded', () => {
  const baseline = { entries: [{ label: 'state', rule: 'text-overlap', count: 1, owner: 'test' }] }
  assert.deepEqual(compareFeelBaseline({ label: 'state', findings: [{ rule: 'text-overlap' }] }, baseline), [])
  assert.equal(compareFeelBaseline({ label: 'state', findings: [] }, baseline)[0].kind, 'reduced-update-baseline')
  assert.equal(compareFeelBaseline({ label: 'other', findings: [{ rule: 'font-size' }] }, baseline)[0].kind, 'new')
})

test('shared observer scans screenshots and completed state waits without author calls', async () => {
  const browser = await chromium.launch({ headless: true })
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feel-observer-'))
  try {
    const page = await browser.newPage()
    const observer = installFeelObserver(page, {
      name: 'fixture', outputDir: dir, baseline: { entries: [] }, exemptions: { entries: [] },
    })
    await page.setContent('<p>Readable</p>')
    await page.screenshot({ path: path.join(dir, 'clean.png') })
    await page.waitForFunction(() => document.readyState === 'complete')
    assert.equal(observer.records.length, 2)
    await page.setContent('<p style="font-size:8px">Tiny</p>')
    await assert.rejects(() => page.screenshot({ path: path.join(dir, 'bad.png') }), /Feel baseline drift/)
    const records = JSON.parse(fs.readFileSync(path.join(dir, 'contact-sheet.json'), 'utf8'))
    assert.equal(records.length, 3)
    assert.equal(records[2].findings[0].rule, 'font-size')
    assert.ok(fs.existsSync(records[2].screenshot))
  } finally {
    await browser.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
