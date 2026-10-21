// 设计实验室 · 写作区「选中文字 → AI 编辑」走查。零额度：纯本地渲染，模型一头是假桌面桥。
// 产出：`tests/ux/shots/design-lab-creation-ai-rewrite/<state>.png` + `_contact-sheet.png`。
// 其中 `rewrite-live-zh-light` 那一格由 Playwright 真选字、真点、真敲（见 assertState）。
import fs from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from './design-lab/labStates.mjs'
import { walkDesignLabScreen } from './design-lab/walkScreen.mjs'

const OUT_DIR = path.join(REPO_ROOT, 'tests/ux/shots/design-lab-creation-ai-rewrite')
const TARGET_ZH = '她盯着纸条看了很久，才慢慢展开。'
const REWRITTEN_ZH = '慢慢展开纸条。'

function expect(record, condition, message) {
  if (!condition) record(message)
}

/** 真键鼠走一遍：选字 → 点 AI 编辑 → 点「缩短」→ 看结果 → Enter 接受 → Ctrl+Z 撤回 → 再来一次后 Esc 放弃。 */
async function liveJourney(page, record) {
  // 读文档本身（编辑器里的真文字），不读屏幕上的字：结果态屏幕上有叠着的新旧对比，会把原句从中间切开。
  const text = () => page.evaluate(() => document.querySelector('.workbench-editor__content').editor.state.doc.textBetween(0, document.querySelector('.workbench-editor__content').editor.state.doc.content.size, ' '))
  const shot = (name) => page.locator('[data-design-lab-shot]').screenshot({ path: path.join(OUT_DIR, `${name}.png`), animations: 'disabled' })
  const paragraph = page.locator('.workbench-editor__content p', { hasText: TARGET_ZH })
  // 真用户的选法：点进这一行，End 到行尾，Shift+Home 选回行首（这一段正好一行）。
  const selectParagraph = async () => {
    await paragraph.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Shift+Home')
  }

  // ① 选中：浮条上出现「AI 编辑」。
  await selectParagraph()
  await page.locator('.workbench-selection-popover__tool--ai').waitFor({ state: 'visible' })
  expect(record, await page.locator('.workbench-selection-popover [aria-label]').count() >= 4, '浮条上原有的加粗 / 斜体 / 标题等按钮被挤没了')
  await shot('live-01-selected')

  // ② 点 AI 编辑 → 输入框 + 常用改法 + 用户已有的写作 Skill。
  await page.locator('.workbench-selection-popover__tool--ai').click()
  const bar = page.locator('.workbench-ai-rewrite-bar')
  await bar.waitFor({ state: 'visible' })
  const chips = (await bar.locator('button').allInnerTexts()).map((value) => value.trim())
  for (const label of ['改写', '缩短', '扩写', '改语气', '翻译']) expect(record, chips.includes(label), `常用改法缺「${label}」：${chips.join('|')}`)
  expect(record, chips.some((value) => value.includes('Kasdan')), `用户的写作 Skill 没出现在常用改法后面：${chips.join('|')}`)
  expect(record, (await page.locator('.workbench-ai-rewrite-bar input').evaluate((node) => document.activeElement === node)), '打开后焦点没在输入框')
  await shot('live-02-menu')

  // ③ 点「缩短」→ 原文划线、新字标出来、段尾只有两个小图标。
  await bar.getByRole('button', { name: '缩短' }).click()
  await page.locator('[data-rewrite-status="result"]').waitFor()
  expect(record, await page.locator('.nomi-ai-rewrite-del').count() > 0, '结果态没有划线的删除部分')
  expect(record, (await page.locator('[data-rewrite-add]').allInnerTexts()).join('').length > 0, '结果态没有标出来的新增部分')
  expect(record, await page.locator('[data-rewrite-action]').count() === 2, '段尾应当只有 ✓ ✕ 两个小图标')
  expect(record, await page.locator('.workbench-ai-rewrite-bar input').inputValue() === '缩短', '输入框没有保留这一次的要求')
  expect(record, await page.locator('.workbench-ai-rewrite-bar [aria-label="用原要求重来"]').count() === 1, '输入框右端没有 ↻')
  expect(record, (await text()).includes(TARGET_ZH), '接受之前原文就被改了')
  await page.locator('[data-rewrite-action="accept"]').hover()
  expect(record, await page.locator('[data-rewrite-action="accept"]').getByText(/Enter/).isVisible(), '悬停 ✓ 没有「接受 Enter」提示')
  await shot('live-03-result')

  // ④ Enter 接受：正文换掉，Ctrl+Z 一步撤回。
  await page.keyboard.press('Enter')
  await page.locator('.workbench-ai-rewrite-bar').waitFor({ state: 'detached' })
  const accepted = await text()
  expect(record, accepted.includes(REWRITTEN_ZH) && !accepted.includes(TARGET_ZH), `Enter 之后正文没有被换成新的：${accepted}`)
  await shot('live-04-accepted')
  await page.locator('.workbench-editor__content').click()
  await page.keyboard.press('Control+z')
  const undone = await text()
  expect(record, undone.includes(TARGET_ZH) && !undone.includes(REWRITTEN_ZH), `Ctrl+Z 没有撤回到改写前：${undone}`)
  await shot('live-05-undone')

  // ⑤ 再来一次，结果出来后 Esc 放弃：原文不变。
  await selectParagraph()
  await page.locator('.workbench-selection-popover__tool--ai').click()
  await page.locator('.workbench-ai-rewrite-bar').getByRole('button', { name: '缩短' }).click()
  await page.locator('[data-rewrite-status="result"]').waitFor()
  await page.keyboard.press('Escape')
  await page.locator('.workbench-ai-rewrite-bar').waitFor({ state: 'detached' })
  const discarded = await text()
  expect(record, discarded.includes(TARGET_ZH) && !discarded.includes(REWRITTEN_ZH), `Esc 之后原文变了：${discarded}`)
  await shot('live-06-discarded')

  // ⑥ 改了要求再 Enter = 追加要求；输入框右端 ↻ = 用原要求重来。
  await selectParagraph()
  await page.locator('.workbench-selection-popover__tool--ai').click()
  await page.locator('.workbench-ai-rewrite-bar').getByRole('button', { name: '缩短' }).click()
  await page.locator('[data-rewrite-status="result"]').waitFor()
  const input = page.locator('.workbench-ai-rewrite-bar input')
  await input.fill('缩短，再冷一点')
  await page.keyboard.press('Enter')
  await page.locator('[data-rewrite-status="result"]').waitFor()
  expect(record, await input.inputValue() === '缩短，再冷一点', '追加要求之后输入框没有留着新的要求')
  await page.locator('.workbench-ai-rewrite-bar [aria-label="用原要求重来"]').click()
  await page.locator('[data-rewrite-status="result"]').waitFor()
  expect(record, (await text()).includes(TARGET_ZH), '↻ 重来的时候原文被动了')
  await page.keyboard.press('Escape')
}

fs.mkdirSync(OUT_DIR, { recursive: true })

await walkDesignLabScreen({
  screen: 'creation-ai-rewrite',
  title: '写作区 AI 编辑 ',
  role: 'walk-creation-ai-rewrite',
  cellWidth: 760,
  columns: 2,
  async assertState(page, state, record) {
    if (state.id === 'rewrite-live-zh-light') {
      await liveJourney(page, record)
      return
    }
    const status = state.id.split('-')[1]
    const has = (selector) => page.locator(selector).count()
    if (status === 'selected') expect(record, await has('.workbench-selection-popover__tool--ai') === 1, `${state.id} 浮条上没有 AI 编辑`)
    if (status === 'menu') {
      expect(record, await has('.workbench-ai-rewrite-bar input') === 1, `${state.id} 没有输入框`)
      expect(record, await has('.nomi-ai-rewrite-pending') > 0, `${state.id} 待改的字没有被标出来`)
      expect(record, await has('.workbench-ai-rewrite-bar .nomi-logo-mark') > 0, `${state.id} 输入框前没有 Nomi 标记`)
      expect(record, (await page.locator('.workbench-ai-rewrite-bar input').getAttribute('placeholder') ?? '').length > 0, `${state.id} 输入框占位文字不对`)
      expect(record, await has('.workbench-ai-rewrite-bar button[aria-label]') > 0, `${state.id} 菜单态没有发送钮`)
    }
    if (status === 'result') {
      expect(record, await has('.nomi-ai-rewrite-del') > 0 && await has('[data-rewrite-add]') > 0, `${state.id} 结果态没有新旧对比`)
      expect(record, await has('[data-rewrite-action]') === 2, `${state.id} 段尾应只有 ✓ ✕`)
    }
    if (status === 'accepted' || status === 'discarded') expect(record, await has('.workbench-ai-rewrite-bar') === 0 && await has('[data-rewrite-action]') === 0, `${state.id} 会话没有关干净`)
    if (status === 'failed') expect(record, await has('.workbench-ai-rewrite-bar [role="alert"]') === 1, `${state.id} 没有「没改成」提示`)
  },
})
