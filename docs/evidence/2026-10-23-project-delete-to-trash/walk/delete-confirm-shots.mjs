// ⑭ 删项目进回收站：确认框中英截图（隔离 profile；只打开确认框再取消，不往真机系统回收站里放任何东西）。
// 用法：node <本文件> <截图输出目录>
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const fromRepo = (rel) => pathToFileURL(path.join(repo, rel)).href
const { launchNomiApp } = await import(fromRepo('tests/ux/_launchApp.mjs'))
const { expectVisible, clickOrFail } = await import(fromRepo('tests/ux/_assert.mjs'))
const { backToLibrary, newProjectEntry, setAppLanguage } = await import(fromRepo('tests/ux/_shell.mjs'))

const out = process.argv[2]
fs.mkdirSync(out, { recursive: true })
const run = await launchNomiApp({
  name: 'plibrary2-delete-confirm',
  settleMs: 800,
  initialLocalStorage: { 'nomi-color-scheme': 'light', 'nomi:splash:v1': 'seen', 'nomi:journey-tour:v1': 'seen' },
})
const page = run.win
const results = []
try {
  await page.waitForTimeout(1500)
  await clickOrFail(newProjectEntry(page), '新建项目')
  await expectVisible(page.locator('[data-workspace-mode]').first(), '没进工作区')
  await backToLibrary(page)
  const card = page.locator('[data-project-card="true"]').first()
  await expectVisible(card, '项目库里没有卡片')
  for (const locale of ['zh-CN', 'en']) {
    await setAppLanguage(page, locale)
    await card.hover()
    await clickOrFail(card.locator('button').first(), '点删除按钮')
    const dialog = page.locator('[data-confirm-dialog]')
    await page.waitForTimeout(500)
    const text = await page.locator('[role="dialog"]').last().innerText()
    results.push([`${locale} 确认框文字`, text.replace(/\s+/g, ' ')])
    results.push([`${locale} 提到回收站`, locale === 'en' ? /Recycle Bin|Trash/.test(text) : /回收站|废纸篓/.test(text)])
    results.push([`${locale} 不再说永久删除`, !/永久删除|permanently deleted/.test(text)])
    await page.screenshot({ path: path.join(out, `delete-confirm-${locale}.png`) })
    await page.keyboard.press('Escape') // 取消：不真的删
    await page.waitForTimeout(400)
    results.push([`${locale} 取消后卡片还在`, await card.isVisible()])
    void dialog
  }
} catch (error) {
  results.push(['走查中断', String(error?.message || error)])
  await page.screenshot({ path: path.join(out, '99-failure.png') }).catch(() => {})
} finally {
  await run.close()
}
for (const row of results) console.log(JSON.stringify(row))
