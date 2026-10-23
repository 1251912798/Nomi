// 类回归：Electron 主进程正忙时，Playwright 的主进程 evaluate 必须拿到真实结果，不许丢回包。
//
// 根因（docs/fixes/2026-10-22-playwright-main-evaluate-promise-collected.root-cause.json）：
// Playwright 每次 evaluate 都带 awaitPromise:true；V8 调试器把返回值包成 promise、只弱引用它，等微任务回调再回包。
// Electron 主进程的 Node 调试器在 JS 正忙时用中断插队执行 evaluate，回包要等那段同步代码跑完；
// 这期间一次 GC 就把 promise 收掉，协议回 "Promise was collected"，Playwright 又把它改写成
// 「Execution context was destroyed, most likely because of a navigation.」——打包冒烟 10-18 起间歇红就是这个。
// 修在共享边界：patches/playwright-core@1.60.0.patch 让注入的 UtilityScript 把结果强引用到落定后的下一个宏任务，
// 并让改写后的报错带上原始协议消息。所有主进程 evaluate 入口（app.evaluate / browserWindow / 主进程句柄）都过这一处。
//
// 判据（补丁前实测 30/30 红，补丁后 0）：
//   1) 装好的 playwright-core 确实带补丁（保活 + 原始协议消息）；
//   2) 主进程持续忙时，四种结果形态各跑若干次，全部拿到正确结果：同步值、异步值、句柄上 evaluate、函数里抛错（原样冒出）。
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { closeNomiApp, launchNomiApp } from './_launchApp.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const ROUNDS = 12
const failures = []

function installedPlaywrightCoreBundle() {
  const playwrightEntry = require.resolve('playwright')
  const corePackage = require.resolve('playwright-core/package.json', { paths: [path.dirname(playwrightEntry)] })
  return fs.readFileSync(path.join(path.dirname(corePackage), 'lib', 'coreBundle.js'), 'utf8')
}

const bundle = installedPlaywrightCoreBundle()
if (!bundle.includes('_retainUntilDelivered(value)')) {
  failures.push('装好的 playwright-core 没有结果保活补丁（patches/playwright-core@1.60.0.patch 没打上？跑 pnpm install）')
}
if (!bundle.includes('most likely because of a navigation. [protocol: " + error.message')) {
  failures.push('装好的 playwright-core 改写报错时没带原始协议消息')
}

let gui = null
try {
  gui = await launchNomiApp({
    name: 'playwright-main-evaluate',
    mainRequire: [path.join(here, 'playwright-main-evaluate.busy-main.cjs')],
    waitForWindow: false,
  })
  const { app } = gui
  const electronApp = await app.evaluateHandle(({ app: electronAppModule }) => electronAppModule)
  await app.evaluate(() => globalThis.__nomiBusyMainProbe.start())

  const cases = [
    ['同步值', async (round) => {
      const value = await app.evaluate((_electron, n) => n * 2, round)
      if (value !== round * 2) throw new Error(`expected ${round * 2}, got ${value}`)
    }],
    ['异步值', async (round) => {
      const value = await app.evaluate(async (_electron, n) => n + 1, round)
      if (value !== round + 1) throw new Error(`expected ${round + 1}, got ${value}`)
    }],
    ['句柄上 evaluate', async () => {
      const ready = await electronApp.evaluate((electronAppModule) => electronAppModule.isReady())
      if (ready !== true) throw new Error(`expected app.isReady() === true, got ${ready}`)
    }],
    ['函数里抛错原样冒出', async (round) => {
      const error = await app.evaluate((_electron, n) => { throw new Error(`boom-${n}`) }, round).then(() => null, (caught) => caught)
      if (!error || !String(error.message).includes(`boom-${round}`)) throw new Error(`expected boom-${round}, got ${error?.message ?? 'no error'}`)
    }],
  ]
  const tally = Object.fromEntries(cases.map(([label]) => [label, 0]))
  for (let round = 1; round <= ROUNDS; round++) {
    for (const [label, run] of cases) {
      try {
        await run(round)
        tally[label]++
      } catch (error) {
        failures.push(`${label} 第 ${round} 次：${String(error?.message ?? error).split('\n')[0]}`)
      }
    }
  }
  await app.evaluate(() => globalThis.__nomiBusyMainProbe.stop()).catch(() => undefined)
  console.log(`[playwright-main-evaluate] 主进程持续忙：${cases.map(([label]) => `${label} ${tally[label]}/${ROUNDS}`).join('，')}`)
} catch (error) {
  failures.push(`启动或探针失败：${String(error?.message ?? error).split('\n')[0]}`)
} finally {
  if (gui) await gui.close().catch(() => closeNomiApp(gui.app))
}

if (failures.length) {
  console.error(`❌ playwright-main-evaluate：${failures.length} 处失败`)
  for (const failure of failures) console.error(`   - ${failure}`)
  process.exitCode = 1
} else {
  console.log('✅ playwright-main-evaluate：主进程忙时 evaluate 结果全部送达，补丁在位')
}
