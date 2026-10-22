// P-library-2 N2 截图走查（隔离 profile，不碰真实资料）：一个项目的 .nomi 被挪到项目根外再用 junction 接回，
// 项目库整页照常出，邻居正常；这张卡置灰、不可点、悬停说清原因，没有「在文件夹中显示」。中英各截一张。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
// 仓库根按脚本位置推（docs/evidence/<目录>/walk/ 往上四层），换工作树也能跑。用法：node <本文件> <截图输出目录>
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const fromRepo = (rel) => pathToFileURL(path.join(repo, rel)).href
const { launchNomiApp } = await import(fromRepo('tests/ux/_launchApp.mjs'))
const { expectVisible, clickOrFail } = await import(fromRepo('tests/ux/_assert.mjs'))
const { backToLibrary, newProjectEntry, setAppLanguage } = await import(fromRepo('tests/ux/_shell.mjs'))

const out = process.argv[2]
fs.mkdirSync(out, { recursive: true })
const run = await launchNomiApp({
  name: 'plibrary2-unreadable-card',
  settleMs: 800,
  initialLocalStorage: { 'nomi-color-scheme': 'light', 'nomi:splash:v1': 'seen', 'nomi:journey-tour:v1': 'seen' },
})
const page = run.win
const results = []
let junction = null
try {
  await page.waitForTimeout(1500)
  for (let i = 0; i < 2; i += 1) {
    await clickOrFail(newProjectEntry(page), `新建项目 ${i + 1}`)
    await expectVisible(page.locator('[data-workspace-mode]').first(), '没进工作区')
    await backToLibrary(page)
  }
  const cards = page.locator('[data-project-card="true"]')
  await page.waitForFunction(() => document.querySelectorAll('[data-project-card="true"]').length === 2)
  const ids = await cards.evaluateAll((els) => els.map((el) => el.getAttribute('data-project-id')))
  const dirs = fs.readdirSync(run.projectsDir).map((name) => path.join(run.projectsDir, name))
  const victim = dirs.find((dir) => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, '.nomi', 'project.json'), 'utf8')).id === ids[0] } catch { return false }
  })
  if (!victim) throw new Error('找不到第一张卡的项目目录')
  const outside = path.join(run.tempRoot, 'outside-metadata')
  fs.renameSync(path.join(victim, '.nomi'), outside)
  junction = path.join(victim, '.nomi')
  fs.symlinkSync(outside, junction, 'junction')
  // 触发项目库重读（SWR revalidateOnFocus 有 5s 节流，轮询补发）
  const bad = page.locator(`[data-project-card="true"][data-project-id="${ids[0]}"]`)
  for (let i = 0; i < 12; i += 1) {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.waitForTimeout(1000)
    if (await bad.getAttribute('title')) break
  }
  const good = page.locator(`[data-project-card="true"][data-project-id="${ids[1]}"]`)
  results.push(['邻居卡照常可点', (await good.getAttribute('role')) === 'button'])
  results.push(['坏卡不可点', (await bad.getAttribute('role')) === null])
  results.push(['坏卡 title 写下一步', Boolean(await bad.getAttribute('title'))])
  results.push(['坏卡没有同步角标（弹层里的打开文件夹 / 重新检查对它只会报失败）', (await bad.locator('[data-sync-status]').count()) === 0])
  results.push(['邻居卡同步角标照常', (await good.locator('[data-sync-status]').count()) === 1])
  for (const [locale, label] of [['zh-CN', '项目数据指向文件夹外，已停止读取'], ['en', 'Project data points outside its folder; reading stopped']]) {
    await setAppLanguage(page, locale)
    await bad.hover()
    await page.waitForTimeout(400)
    results.push([`${locale} 悬停标签`, await bad.getByText(label).isVisible()])
    results.push([`${locale} 无「在文件夹中显示」`, (await bad.locator('button[aria-label*="older"], button[aria-label*="文件夹"]').count()) === 0])
    results.push([`${locale} title`, await bad.getAttribute('title')])
    await page.screenshot({ path: path.join(out, `unreadable-card-${locale}.png`) })
  }
} catch (error) {
  results.push(['走查中断', String(error?.message || error)])
  await page.screenshot({ path: path.join(out, '99-failure.png') }).catch(() => {})
} finally {
  if (junction) { try { fs.unlinkSync(junction) } catch {} }
  await run.close()
}
for (const row of results) console.log(JSON.stringify(row))
