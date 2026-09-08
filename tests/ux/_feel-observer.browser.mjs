import { test } from 'node:test'
import { expect } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { compareFeelBaseline, installFeelObserver } from './_feel-observer.mjs'

test('baseline accepts known counts and reports increases and reductions', () => {
  const baseline = { entries: [{ label: 'state', rule: 'text-overlap', count: 1, owner: 'test' }] }
  expect(compareFeelBaseline({ label: 'state', findings: [{ rule: 'text-overlap' }] }, baseline)).toEqual([])
  expect(compareFeelBaseline({ label: 'state', findings: [] }, baseline)[0].kind).toBe('reduced-update-baseline')
  expect(compareFeelBaseline({ label: 'other', findings: [{ rule: 'font-size' }] }, baseline)).toEqual([])
})

test('shared observer scans screenshots and completed state waits without author calls', async () => {
  const browser = await chromium.launch({ headless: true })
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feel-observer-'))
  try {
    const page = await browser.newPage()
    const observer = installFeelObserver(page, {
      name: 'fixture', outputDir: dir, baseline: { entries: ['fixture:screenshot:bad.png', 'fixture:screenshot:locator.png', 'fixture:waitForFunction'].map((label) => ({ label, rule: 'font-size', count: 0 })) }, exemptions: { entries: [] },
    })
    await page.setContent('<p>Readable</p>')
    await page.screenshot({ path: path.join(dir, 'clean.png') })
    await page.waitForFunction(() => document.readyState === 'complete')
    expect(observer.records.length).toBe(2)
    await page.setContent('<p style="font-size:8px">Tiny</p><button>Continue</button>')
    await page.screenshot({ path: path.join(dir, 'unregistered.png') })
    const surfaces = JSON.parse(fs.readFileSync(path.join(dir, 'new-surfaces.json'), 'utf8'))
    expect(surfaces[0]).toMatchObject({ mode: 'record', rule: 'font-size', findings: [{ text: ['Tiny'] }] })
    await expect(page.screenshot({ path: path.join(dir, 'bad.png') })).rejects.toThrow(/Feel baseline drift/)
    await expect(page.getByRole('button').first().screenshot({ path: path.join(dir, 'locator.png') })).rejects.toThrow(/Feel baseline drift/)
    await expect(page.waitForFunction(() => document.readyState === 'complete')).rejects.toThrow(/Feel baseline drift/)
    const records = JSON.parse(fs.readFileSync(path.join(dir, 'contact-sheet.json'), 'utf8'))
    expect(records.length).toBe(6)
    expect(records[2].findings[0].rule).toBe('font-size')
    expect(fs.existsSync(records[2].screenshot)).toBe(true)
    await page.setContent('<p>Readable again</p>')
    const reduced = installFeelObserver(await browser.newPage(), {
      name: 'reduction', outputDir: path.join(dir, 'reduction'),
      baseline: { entries: [{ label: 'state', rule: 'font-size', count: 1 }] }, exemptions: { entries: [] },
    })
    await reduced.checkpoint('state')
    expect(reduced.records[0].drift[0].kind).toBe('reduced-update-baseline')
  } finally {
    await browser.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
