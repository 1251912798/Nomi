// Run from repository root with the isolated Electron build and Vite on :5273.
import fs from 'node:fs/promises'
import console from 'node:console'
import path from 'node:path'
import { launchNomiApp } from '../../../tests/ux/_launchApp.mjs'
import { expect } from '@playwright/test'
const root = path.resolve('docs/design/creation-columns-evidence')
const session = await launchNomiApp({ name: 'creation-columns', settleMs: 0,
  env: { VITE_DEV_SERVER_URL: 'http://127.0.0.1:5273', NOMI_DISABLE_AUTO_UPDATE: '1' },
  initialLocalStorage: { 'nomi-color-scheme': 'light', 'nomi:splash:v1': 'seen', 'nomi:journey-tour:v1': 'seen' } })
const page = session.win
const errors = []
page.on('pageerror', error => errors.push(String(error)))
try {
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByRole('button', { name: /新建空白项目/ })).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: /新建空白项目/ }).click()
  await expect(page.locator('[data-creation-editor] .tiptap')).toBeVisible()
  await page.locator('[data-creation-editor] .tiptap').fill('雨夜来信\n车站外，雨水沿着旧屋檐滴落。林望握着那封迟到了十年的信。')
  await page.locator('[data-creation-editor] .tiptap').blur()
  await page.screenshot({ path: path.join(root, 'production-before.png') })
  for (const state of ['columns-current', 'columns-specimen', 'columns-specimen-dark']) {
    await page.goto(`http://127.0.0.1:5273/design-lab.html?screen=creation-columns&state=${state}&frame=1`)
    await expect(page.locator('[data-creation-editor] .tiptap')).toBeVisible()
    await expect(page.locator('[data-v4-panel]')).toBeVisible()
    await page.evaluate(() => globalThis.document.fonts.ready)
    const measurements = await page.evaluate(() => {
      const read = selector => {
        const element = globalThis.document.querySelector(selector)
        if (!element) throw new Error(`Missing ${selector}`)
        const style = globalThis.getComputedStyle(element), r = element.getBoundingClientRect()
        return { selector, radius: style.borderRadius, border: [style.borderTop, style.borderRight, style.borderBottom, style.borderLeft], shadow: style.boxShadow,
          padding: style.padding, background: style.backgroundColor, x: r.x, y: r.y, width: r.width, height: r.height }
      }
      return { frame: [read('[data-creation-resource-tree]'), read('[data-creation-editor]'), read('[data-v4-panel]')],
        header: [read('[data-creation-resource-tree]>div:first-child'), read('.workbench-editor-toolbar'), read('[data-v4-panel]>header')],
        body: [read('[data-creation-resource-tree]>nav'), read('.tiptap'), read('[data-v4-flow]')] }
    })
    if (state !== 'columns-current') {
      expect(new Set(measurements.frame.map(x => x.y)).size).toBe(1)
      expect(new Set(measurements.frame.map(x => x.height)).size).toBe(1)
      expect(measurements.frame.map(x => x.radius)).toEqual(['10px', '10px', '10px'])
      expect(measurements.header.map(x => x.height)).toEqual([48, 48, 48])
      expect(measurements.frame[1].x - measurements.frame[0].x - measurements.frame[0].width).toBe(16)
      expect(measurements.frame[2].x - measurements.frame[1].x - measurements.frame[1].width).toBe(16)
      expect(measurements.frame.map(x => x.border.every(b => b.startsWith('1px solid')))).toEqual([true, true, true])
    }
    await fs.writeFile(path.join(root, `${state}.json`), JSON.stringify(measurements, null, 2) + '\n')
    await page.locator('[data-creation-columns]').screenshot({ path: path.join(root, `${state}.png`) })
    if (state === 'columns-specimen') {
      const html = await page.locator('[data-creation-columns]').evaluate(el => el.outerHTML)
      await fs.writeFile(path.join(root, 'specimen.html'), '<!doctype html><html lang="zh-CN" data-mantine-color-scheme="light"><meta charset="utf-8"><title>C76 三栏样张（待拍板）</title><link rel="stylesheet" href="../../../public/tailwind.generated.css"><link rel="stylesheet" href="../../../src/theme/nomi-tokens.css"><link rel="stylesheet" href="../../../src/workbench/workbench.css"><link rel="stylesheet" href="../../../node_modules/@fontsource-variable/inter/wght.css"><link rel="stylesheet" href="../../../node_modules/@fontsource-variable/fraunces/wght.css"><body>' + html + '</body></html>\n')
    }
    console.log(state, measurements.frame.map(x => ({ radius:x.radius, y:x.y, h:x.height })), measurements.header.map(x => x.height))
  }
  await fs.writeFile(path.join(root, 'receipt.json'), JSON.stringify({ runtime: 'isolated Electron', viewport: { width:1440, height:900 }, errors, paidCalls: 0 }, null, 2)+'\n')
  if (errors.length) throw new Error(errors.join('\n'))
} finally { await session.app.close() }
