// AnchoredPopover 关掉之后焦点去哪（真 Chromium + 真 AnchoredPopover + 真 React Flow 空白处 + 设计系统 Tooltip）。
// 规矩在 src/design/AnchoredPopover.tsx：因点外面关闭不还焦点（还回去触发钮的悬停提示会挂着）；Esc / 选一项关闭还给打开前的元素。
// 「点外面」只记最近一下：调用方可以拒关（ClipNode 上传中），之后用户按 Esc / 在浮层里点一项或用键盘选一项关掉，焦点照旧回到触发钮。
// 独立验收 L-acc-opus-20261023 应修 1：标记只置真不复位时，后三条的焦点都落在 BODY。按清单遍历，多一种关法就加一行。
import { test } from 'vitest'
import { expect } from '@playwright/test'
import { chromium } from 'playwright'
import { expectAbsent, proveProbe } from './_assert.mjs'
import { useBrowserFixture } from './_browserFixture.mjs'

const ENTRY = 'tests/ux/fixtures/anchored-popover-focus-harness.html'
const fixture = useBrowserFixture({ entries: [ENTRY], browserType: chromium })

const POPOVER = '[data-focus-popover]'
const TRIGGER = '[data-focus-trigger]'

async function pressCanvasBlank(page) {
  const box = await page.locator('.react-flow__pane').boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

async function refuseOutsidePress(page) {
  await page.evaluate(() => window.popoverFocus.setBusy(true))
  await pressCanvasBlank(page)
  await expect(page.locator(POPOVER), '忙时点外面被调用方拒关，浮层应还开着').toBeVisible()
  await page.evaluate(() => window.popoverFocus.setBusy(false))
}

const CLOSES = [
  { name: '点画布空白关', focusBack: false, close: (page) => pressCanvasBlank(page) },
  { name: 'Esc 关', focusBack: true, close: (page) => page.keyboard.press('Escape') },
  {
    name: '点外面被拒关后按 Esc 关',
    focusBack: true,
    close: async (page) => { await refuseOutsidePress(page); await page.keyboard.press('Escape') },
  },
  {
    name: '点外面被拒关后在浮层里点一项关',
    focusBack: true,
    close: async (page) => { await refuseOutsidePress(page); await page.locator('[data-focus-item]').click() },
  },
  {
    name: '点外面被拒关后键盘选一项关',
    focusBack: true,
    close: async (page) => { await refuseOutsidePress(page); await page.locator('[data-focus-item]').focus(); await page.keyboard.press('Enter') },
  },
]

for (const item of CLOSES) test(`AnchoredPopover 关闭后的焦点：${item.name}`, async () => {
  const page = await fixture.browser.newPage({ viewport: { width: 1000, height: 700 } })
  try {
    await page.goto(fixture.url(ENTRY))
    await expect(page.locator('.react-flow__pane')).toBeVisible()
    // 提示探针是活的：悬停触发钮时看得到它。之后「没挂提示」才有意义。
    await page.locator(TRIGGER).hover()
    const tooltipProof = await proveProbe(page.getByRole('tooltip'), '悬停触发钮时的提示')
    await page.locator(TRIGGER).click()
    const popoverProof = await proveProbe(page.locator(POPOVER), '点触发钮后打开的浮层')

    await item.close(page)
    await expectAbsent(page.locator(POPOVER), { provenBy: popoverProof, message: `${item.name}：浮层该关了` })
    const triggerFocused = () => page.evaluate((selector) => document.activeElement === document.querySelector(selector), TRIGGER)
    if (item.focusBack) {
      // Radix FocusScope 在卸载后的下一个任务里还焦点，要等。
      await expect.poll(triggerFocused, { message: `${item.name}：焦点没回到触发钮`, timeout: 3000 }).toBe(true)
    } else {
      await expectAbsent(page.getByRole('tooltip'), { provenBy: tooltipProof, message: `${item.name}：触发钮上挂着悬停提示` })
      expect(await triggerFocused(), `${item.name}：焦点被塞回了触发钮`).toBe(false)
    }
  } finally {
    await page.close()
  }
}, 120000)
