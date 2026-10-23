// vitest 浏览器夹具测试起开发服务的唯一入口（2026-10-24）：真 Chromium + vite 开发服务加载 tests/ux/fixtures/*.html。
//
// 为什么只许走这里（eslint.config.mjs 的 browser-fixture/no-restricted-imports 在 tests/**/*.test.* 里拦直接 createServer）：
// 以前每个测试各抄一份 `createServer({ configFile: false, ... })`，有两件事各自都对、合起来按机器忙闲报红——
//   ① 依赖扫描没限定入口：vite 默认把根目录下所有 *.html 当入口（本仓 596 个：设计稿、官网、整个应用），
//      只为一张夹具页就把全仓的依赖爬一遍再预打包；
//   ② 冷编译算在用例的操作预算里：夹具页要一千多个模块，第一次 page.goto 就是在等开发服务现编，
//      却按「一次本地操作 15 秒」（或 Playwright 默认 30 秒）计时；机器一忙就超时，各测试只好各自把 goto 调到
//      90 / 120 秒、用例调到 240 秒。
// 实测（10 核机器 + 16 个占满 CPU 的进程 + 4 份并行）：冷 goto 17–20 秒；准备阶段先编一遍后，用例里的 goto 1.5–5 秒。
//
// 这里的规矩：
//   · 依赖扫描只认本测试要打开的入口页（optimizeDeps.entries）；
//   · 准备阶段把每个入口页在一次性浏览器上下文里完整加载一遍：load 事件（再加可选的 ready 选择器）= 这张页面编完了，
//     这是确定的「准备好」信号，不是赌秒数；
//   · 冷编译是构建，不是一次界面操作：它只受下面这一份构建余量约束，用例里的操作预算不再替它背锅；
//   · 只能导航到登记过（编过）的入口页，免得冷编译又溜回用例里；
//   · 夹具不替测试起浏览器：浏览器类型由测试文件 `import { chromium } from 'playwright'` 后传进来（browserType 必填）。
//     推送前的相关单测（scripts/pre-push-related-tests.mjs 的 startsBrowser）靠「测试文件自己 import playwright」认出
//     起浏览器的测试、只交给 CI；这里要是自己 import playwright，信号就被夹具带走，这些测试会被当快测试塞回推送前、
//     和 typecheck 并发冷启动（2026-10-24 本机 gates 的 check:claude-hooks 两条必红就是这么来的）。
//     所以本文件只在 JSDoc 里用 playwright 的类型，不 import 它的启动器；普查在 tests/ux/_browserFixture.test.mjs。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { afterAll, beforeAll } from 'vitest'
import { cleanupTestTemp, makeTempDir } from '../../scripts/_test-temp.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * 夹具冷编译的构建余量——安全网，不是完成条件（完成条件是上面的 load / ready）。
 * 取值依据（2026-10-24 实测，10 核 macOS）：单个夹具空闲 3–4 秒；16 个满载进程 + 4 份并行 11–15 秒；
 * 10 个夹具测试在同一次 vitest 里一起冷编译（整机负载 30–50）单文件 3–31 秒，负载 80+ 时一半超过原先 30 秒的钩子上限。
 * 原先散在各测试里的冷编译余量是 goto 90 秒、钩子 120 秒、用例 240 秒；这里统一成一份 120 秒，那些散值同提交删掉。
 */
export const FIXTURE_BUILD_BUDGET_MS = 120_000

/**
 * 在当前测试文件里登记一个只服务这些夹具入口页的开发服务 + 一个无头浏览器：beforeAll 里起服并把入口页编完，
 * afterAll 里关掉并删缓存目录。返回的句柄在 beforeAll 跑完后可用。准备阶段和用例用同一个浏览器。
 * @param {{ entries: string[], browserType: import('playwright').BrowserType, plugins?: import('vite').PluginOption[], ready?: string }} options
 *   entries：本测试会打开的入口页，相对仓库根的路径（不带查询串），例如 `tests/ux/fixtures/x.html`。
 *   browserType：必填。测试文件自己 `import { chromium } from 'playwright'` 后传进来（见文件头：起浏览器的信号留在测试文件里）。
 *   ready：可选的选择器。页面挂载还要按需加载模块时，编译阶段等到它可见才算编完（只等 load 不够）。
 * @returns {{ readonly browser: import('playwright').Browser, url: (entry: string, search?: string) => string }}
 */
export function useBrowserFixture(options) {
  // 登记钩子之前就核：缺了在收集测试时当场红，不等到 beforeAll 才发现
  if (typeof options?.browserType?.launch !== 'function') {
    throw new Error("useBrowserFixture：browserType 必填——测试文件自己 import { chromium } from 'playwright'，再写 useBrowserFixture({ entries, browserType: chromium })。"
      + '夹具不替测试起浏览器：推送前靠测试文件里的 playwright import 认出它要起浏览器、只交给 CI。')
  }
  let opened
  let close
  // close 在起服第一步就交出来：构建余量用完、beforeAll 被判超时时，afterAll 照样能关掉已经起来的服务和浏览器。
  beforeAll(async () => { opened = await openBrowserFixture(options, (closer) => { close = closer }) }, FIXTURE_BUILD_BUDGET_MS)
  afterAll(async () => { await close?.() })
  const current = () => {
    if (!opened) throw new Error('useBrowserFixture：夹具还没准备好（只能在用例或之后登记的钩子里用）')
    return opened
  }
  return {
    get browser() { return current().browser },
    url: (entry, search) => current().url(entry, search),
  }
}

async function openBrowserFixture({ entries, browserType, plugins = [], ready }, exposeClose) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('useBrowserFixture：entries 至少要有一张入口页')
  for (const entry of entries) {
    if (typeof entry !== 'string' || entry.includes('?') || !fs.existsSync(path.join(repoRoot, entry))) {
      throw new Error(`useBrowserFixture：入口页不存在或带了查询串：${entry}（写相对仓库根的文件路径，查询串交给 url() 的第二个参数）`)
    }
  }
  const closers = []
  let closed = false
  const close = async () => {
    if (closed) return
    closed = true
    let failure
    for (const closer of closers.splice(0).reverse()) {
      try { await closer() } catch (error) { failure ??= error }
    }
    if (failure) throw failure
  }
  exposeClose(close)
  // 每起一样东西就登记它的关法；准备阶段已经被关掉（超时后 afterAll 先跑了）时，刚起来的这一样当场关掉。
  const own = async (closer) => {
    if (!closed) return void closers.push(closer)
    await closer()
    throw new Error('useBrowserFixture：准备阶段已被关掉（构建余量用完或测试文件提前结束）')
  }
  const cacheDir = makeTempDir('nomi-browser-fixture-')
  await own(async () => cleanupTestTemp(cacheDir))
  const server = await createServer({
    configFile: false,
    root: repoRoot,
    cacheDir,
    plugins,
    optimizeDeps: { entries },
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
  })
  await own(() => server.close())
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  const browser = await browserType.launch({ headless: true })
  await own(() => browser.close())
  // 一次性上下文：和用例的页面不共用存储，夹具在这里跑过一遍不会把状态留给用例。
  // 这里的等待不另设上限（timeout: 0），只受上面那份构建余量约束——一份安全网，不叠第二份。
  const warmup = await browser.newContext()
  try {
    for (const entry of entries) {
      const page = await warmup.newPage()
      await page.goto(`${origin}/${entry}`, { timeout: 0 })
      if (ready) await page.locator(ready).first().waitFor({ state: 'visible', timeout: 0 })
    }
  } finally {
    await warmup.close()
  }
  const url = (entry, search = '') => {
    if (!entries.includes(entry)) throw new Error(`useBrowserFixture：${entry} 没在 entries 里登记，没有预先编过，冷编译会算进用例的操作预算`)
    return `${origin}/${entry}${search}`
  }
  return { browser, url }
}
