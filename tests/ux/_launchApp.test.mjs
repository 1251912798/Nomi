import { makeTempDir } from '../../scripts/_test-temp.mjs'
// 钉住启动器的核心不变量（替掉原 helpers/electronFixture.test.mjs，2026-08-11 收敛）。
// 这条不变量就是本次修复的根因：漏掉这两个 env，窗口起不来且**毫无提示**，只会干等到超时。
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import os from 'node:os'
import vm from 'node:vm'
import { spawn } from 'node:child_process'
import { describe, expect, test } from 'vitest'
import {
  buildNomiLaunchEnv,
  cleanupTempRoot,
  closeElectronWithin,
  descendantPids,
  configureSyntheticCredentialStorage,
  currentCatalogVersion,
  diagnoseLaunchFailure,
  isolatedCatalogHasSafeStorageCredentials,
  prepareIsolatedCatalog,
  prepareLocalStorageSeed,
  launchNomiApp,
  mainRequireArgs,
  withWalkOffscreen,
  repoRoot,
  registerTempRoot,
  requireBeforePackagedMain,
  withLinuxNoSandbox,
  withLinuxSyntheticCredentialStorage,
  withPackagedPlaywrightOrigin,
  seedSavedFixtureCredentials,
  isolatedHostConfigLeaks,
  prepareHostConfigDir,
  withIsolatedHostConfig,
} from './_launchApp.mjs'
import { MCP_CLIENT_HOST_ENV_VARS, mcpClientLocations, mcpClientPlatform, resolveMcpClientPath } from '../../electron/shared/mcpClientRegistry.ts'

describe('shared Electron temp-root lifecycle', () => {
  test('cleanup is idempotent for explicit and generated roots', () => {
    const root = makeTempDir('nomi-launch-cleanup-')
    registerTempRoot(root)
    expect(fs.existsSync(root)).toBe(true)
    cleanupTempRoot(root)
    cleanupTempRoot(root)
    expect(fs.existsSync(root)).toBe(false)
  })
})

const dirs = { userDataDir: '/tmp/case/user-data', settingsDir: '/tmp/case/settings', projectsDir: '/tmp/case/projects', hostConfigDir: '/tmp/case/host-config' }
const hostVarsUnder = (root) => Object.fromEntries(MCP_CLIENT_HOST_ENV_VARS.map((name) => [name, path.join(root, name)]))

describe('initial local storage fixture', () => {
  test('seeds missing preferences while preserving explicit values and excluding subframes', () => {
    const root = makeTempDir('nomi-storage-seed-')
    try {
      const args = prepareLocalStorageSeed(root, { 'nomi:splash:v1': 'seen', 'nomi-color-scheme': 'light' })
      let listener
      let registration
      vm.runInNewContext(fs.readFileSync(args[1], 'utf8'), {
        require: () => ({ app: { once: (event, callback) => {
          expect(event).toBe('session-created')
          listener = callback
        } } }),
      })
      listener({ registerPreloadScript: (value) => { registration = value } })
      expect(args[0]).toBe('-r')
      expect(registration.type).toBe('frame')
      const values = new Map([['nomi-color-scheme', 'dark']])
      const context = {
        process: { isMainFrame: false },
        window: { localStorage: {
          getItem: (key) => values.get(key) ?? null,
          setItem: (key, value) => values.set(key, value),
        } },
      }
      const script = fs.readFileSync(registration.filePath, 'utf8')
      vm.runInNewContext(script, context)
      expect(values.has('nomi:splash:v1')).toBe(false)
      context.process.isMainFrame = true
      vm.runInNewContext(script, context)
      expect(Object.fromEntries(values)).toEqual({ 'nomi-color-scheme': 'dark', 'nomi:splash:v1': 'seen' })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('refuses to seed a real profile before launching Electron', async () => {
    await expect(launchNomiApp({ executablePath: 'unused-by-isolation-guard', isolate: false, initialLocalStorage: { 'nomi:splash:v1': 'seen' } }))
      .rejects.toThrow('requires an isolated Nomi profile')
  })
})

describe('mainRequire（主进程入口前的 -r 模块）', () => {
  test('每个绝对路径拼成一对 -r，顺序保持', () => {
    const root = makeTempDir('nomi-main-require-')
    try {
      const first = path.join(root, 'guard.cjs')
      const second = path.join(root, 'probe.cjs')
      fs.writeFileSync(first, '')
      fs.writeFileSync(second, '')
      expect(mainRequireArgs([first, second])).toEqual(['-r', first, '-r', second])
      expect(mainRequireArgs(undefined)).toEqual([])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('NOMI_WALK_OFFSCREEN=1 才补屏外模块；已经带了不重复；没设就原样', () => {
    const guard = path.join(repoRoot, 'scripts', 'walkthrough-network-guard.cjs')
    expect(withWalkOffscreen(undefined, {})).toEqual([])
    expect(withWalkOffscreen([guard], {})).toEqual([guard])
    const withOffscreen = withWalkOffscreen([guard], { NOMI_WALK_OFFSCREEN: '1' })
    expect(withOffscreen).toHaveLength(2)
    expect(withOffscreen[1]).toMatch(/_offscreenWindows.cjs$/)
    expect(withWalkOffscreen(withOffscreen, { NOMI_WALK_OFFSCREEN: '1' })).toEqual(withOffscreen)
    expect(mainRequireArgs(withOffscreen)).toHaveLength(4)
  })

  test('相对路径与不存在的文件当场拒（相对路径会被 Node 当包名去找，闸就静默没装上）', () => {
    expect(() => mainRequireArgs(['scripts/walkthrough-network-guard.cjs'])).toThrow('absolute module paths')
    expect(() => mainRequireArgs([path.join(os.tmpdir(), 'nomi-no-such-guard.cjs')])).toThrow('does not exist')
  })

  test('不许装进真实 profile', async () => {
    await expect(launchNomiApp({ executablePath: 'unused-by-isolation-guard', isolate: false, mainRequire: [path.join(repoRoot, 'scripts', 'walkthrough-network-guard.cjs')] }))
      .rejects.toThrow('mainRequire requires an isolated Nomi profile')
  })

  // 打包好的 App 静默忽略 `-r`：闸没装上、请求直奔真网。打包形态必须在主入口第一行之前真的装上。
  test('打包形态：模块在 app.asar/dist-electron/main.js 第一行之前就已加载', async () => {
    const root = makeTempDir('nomi-packaged-premain-')
    const entryDir = path.join(root, 'resources', 'app.asar', 'dist-electron')
    fs.mkdirSync(entryDir, { recursive: true })
    const guard = path.join(root, 'guard.cjs')
    const seen = path.join(root, 'seen.txt')
    fs.writeFileSync(guard, 'globalThis.__nomiGuard = "installed-before-main"\n')
    fs.writeFileSync(path.join(entryDir, 'main.js'), `require('node:fs').writeFileSync(${JSON.stringify(seen)}, String(globalThis.__nomiGuard))\n`)
    const port = await new Promise((resolve) => {
      const server = net.createServer().listen(0, '127.0.0.1', () => { const { port: free } = server.address(); server.close(() => resolve(free)) })
    })
    const child = spawn(process.execPath, [`--inspect-brk=127.0.0.1:${port}`, path.join(entryDir, 'main.js')], { stdio: 'ignore' })
    const exited = new Promise((resolve) => child.once('exit', resolve))
    try {
      await requireBeforePackagedMain({ port, modules: [guard], timeout: 20_000 })
      await exited
      expect(fs.readFileSync(seen, 'utf8')).toBe('installed-before-main')
    } finally {
      child.kill()
      fs.rmSync(root, { recursive: true, force: true })
    }
  }, 30_000)
})

describe('prepareIsolatedCatalog', () => {
  test('quarantines a seed newer than the tested app instead of letting it enter Electron', () => {
    const root = makeTempDir('nomi-catalog-seed-red-')
    const catalog = path.join(root, 'model-catalog.json')
    const future = { version: 12, futureOnlyField: 'preserve-me', vendors: [], models: [], mappings: [], apiKeysByVendor: {} }
    fs.writeFileSync(catalog, JSON.stringify(future))

    const result = prepareIsolatedCatalog(root, { testedCatalogVersion: 11 })

    expect(result.status).toBe('quarantined')
    expect(fs.existsSync(catalog)).toBe(false)
    expect(JSON.parse(fs.readFileSync(result.quarantinePath, 'utf8'))).toEqual(future)
  })

  test('keeps current and older seeds for the app migration chain', () => {
    for (const diskVersion of [currentCatalogVersion(), currentCatalogVersion() - 1]) {
      const root = makeTempDir('nomi-catalog-seed-compatible-')
      const catalog = path.join(root, 'model-catalog.json')
      fs.writeFileSync(catalog, JSON.stringify({ version: diskVersion, vendors: [], models: [], mappings: [], apiKeysByVendor: {} }))

      expect(prepareIsolatedCatalog(root)).toMatchObject({ status: 'compatible', diskVersion })
      expect(JSON.parse(fs.readFileSync(catalog, 'utf8')).version).toBe(diskVersion)
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('buildNomiLaunchEnv', () => {
  test('钉死必需 env 并隔离每个可写路径', () => {
    expect(buildNomiLaunchEnv({ ...dirs, baseEnv: {} })).toEqual({
      NOMI_E2E: '1',
      NOMI_E2E_ALLOW_MULTI_INSTANCE: '1',
      // 走查环境里主进程日志必须看得见（否则 CI 的 job 日志里一条 WARN 都没有）。
      NOMI_LOG_STDERR: '1',
      NOMI_ELECTRON_USER_DATA_DIR: dirs.userDataDir,
      NOMI_SETTINGS_DIR: dirs.settingsDir,
      NOMI_PROJECTS_DIR: dirs.projectsDir,
      // 宿主自己的配置位置变量（CLAUDE_CONFIG_DIR / CODEX_HOME，名单在注册表）也指进隔离目录。
      ...hostVarsUnder(dirs.hostConfigDir),
    })
  })

  test('调用方覆盖不掉这两条——本次修复的根因就在这里', () => {
    // 走查作者可能出于任何理由传进来（复制粘贴、想「测生产行为」……）。
    // 覆盖成功 = 窗口起不来 + 零提示，所以启动器必须无视它。
    const env = buildNomiLaunchEnv({
      ...dirs,
      baseEnv: {},
      extraEnv: { NOMI_E2E: '0', NOMI_E2E_ALLOW_MULTI_INSTANCE: undefined },
    })
    expect(env.NOMI_E2E).toBe('1')
    expect(env.NOMI_E2E_ALLOW_MULTI_INSTANCE).toBe('1')
  })

  test('额外 env 照常透传（走查各自的开关不受影响）', () => {
    const env = buildNomiLaunchEnv({ ...dirs, baseEnv: { PATH: '/usr/bin' }, extraEnv: { NOMI_TEST_SYSTEM_LOCALE: '1' } })
    expect(env.NOMI_TEST_SYSTEM_LOCALE).toBe('1')
    expect(env.PATH).toBe('/usr/bin')
  })

  test('假凭据（syntheticCredentialStorage: true）默认关在本机：产品测试网闸打开，走查要放行只能显式覆盖', () => {
    // 夜跑 run 40035294026：占位 key 保存时被产品的免费验证发到真供应商，401 →「密钥验证失败」，四条走查当场红。
    expect(buildNomiLaunchEnv({ ...dirs, baseEnv: {}, fixtureCredentials: true }).NOMI_TEST_NETWORK_GUARD).toBe('1')
    expect(buildNomiLaunchEnv({ ...dirs, baseEnv: {} }).NOMI_TEST_NETWORK_GUARD).toBeUndefined()
    expect(buildNomiLaunchEnv({ ...dirs, baseEnv: {}, fixtureCredentials: true, extraEnv: { NOMI_TEST_NETWORK_GUARD: '' } }).NOMI_TEST_NETWORK_GUARD).toBe('')
  })

  test('启动器把显式的 syntheticCredentialStorage: true（且只有它）接成假凭据', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'tests/ux/_launchApp.mjs'), 'utf8')
    expect(source).toMatch(/buildNomiLaunchEnv\(\{[^}]*fixtureCredentials: options\.syntheticCredentialStorage === true/)
  })

  test('seedSavedFixtureCredentials 只给显式的隔离假凭据用，且两次起 App 必须同一组目录，否则当场拒绝', async () => {
    const root = makeTempDir('nomi-seed-guard-')
    const dirs = { settingsDir: path.join(root, 'settings'), userDataDir: path.join(root, 'user-data') }
    await expect(seedSavedFixtureCredentials(dirs, ['apimart'])).rejects.toThrow(/syntheticCredentialStorage: true/)
    await expect(seedSavedFixtureCredentials({ syntheticCredentialStorage: true, settingsDir: dirs.settingsDir }, ['apimart'])).rejects.toThrow(/userDataDir/)
  })

  test('隔离能力核目录也随 env 传入且不与 settings 混用', () => {
    const env = buildNomiLaunchEnv({ ...dirs, capabilityDir: '/tmp/case/capability', baseEnv: {} })
    expect(env.NOMI_CAPABILITY_DIR).toBe('/tmp/case/capability')
    expect(env.NOMI_SETTINGS_DIR).toBe(dirs.settingsDir)
  })
})

// 2026-10-24：隔离起的 App 显示「Claude Code 的配置里已有 Nomi」——读到了本机真实的 ~/.claude.json。
// 门岗：隔离起 App 时，宿主配置路径解析进用户真实的宿主位置（主目录默认位置，或用户自己的 CLAUDE_CONFIG_DIR / CODEX_HOME）就判红。
// 判据按注册表逐条来（electron/shared/mcpClientRegistry.ts），新加一个带位置变量的宿主不用改这里。
describe('宿主配置隔离：隔离起的 App 读写不到用户真实的 Claude Code / Codex 配置', () => {
  const platform = mcpClientPlatform(process.platform)
  const realHome = '/Users/real-person'
  const developerShell = { HOME: realHome, USERPROFILE: realHome, CLAUDE_CONFIG_DIR: `${realHome}/.claude-work`, CODEX_HOME: `${realHome}/.codex-alt` }
  const appHome = (env) => (platform === 'win32' ? env.USERPROFILE : env.HOME) || realHome
  const inside = (root, target) => { const rel = path.relative(root, target); return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel) }
  const resolvedFor = (env) => mcpClientLocations()
    .filter((entry) => entry.platform === platform && entry.location.hostEnv)
    .map(({ client, location }) => ({ client, path: resolveMcpClientPath(location, { platform, env, homedir: appHome(env), join: path.join }) }))

  test('每个宿主位置变量都指进 hostConfigDir，带变量的宿主路径一条不剩地落在隔离目录里（开发者 shell 里继承的值被换掉）', () => {
    const env = buildNomiLaunchEnv({ ...dirs, baseEnv: developerShell })
    expect(MCP_CLIENT_HOST_ENV_VARS.length).toBeGreaterThan(0)
    for (const name of MCP_CLIENT_HOST_ENV_VARS) expect(env[name], name).toBe(path.join(dirs.hostConfigDir, name))
    const resolved = resolvedFor(env)
    expect(resolved.length).toBeGreaterThan(0)
    for (const entry of resolved) expect(inside(dirs.hostConfigDir, entry.path), `${entry.client} → ${entry.path}`).toBe(true)
  })

  test('调用方换了主目录（假 HOME 里摆好了 ~/.claude.json）：继承来的宿主变量一律摘掉，宿主默认位置落在假主目录下', () => {
    const fakeHome = '/tmp/case/fake-home'
    const env = buildNomiLaunchEnv({ ...dirs, baseEnv: developerShell, extraEnv: { HOME: fakeHome, USERPROFILE: fakeHome } })
    for (const name of MCP_CLIENT_HOST_ENV_VARS) expect(Object.hasOwn(env, name), name).toBe(false)
    for (const entry of resolvedFor(env)) expect(inside(fakeHome, entry.path), `${entry.client} → ${entry.path}`).toBe(true)
    expect(isolatedHostConfigLeaks(env, { baseEnv: developerShell, accountHome: realHome }).leaks).toEqual([])
  })

  test('调用方自己给的宿主变量照用；指回用户真实的宿主位置就当场拒（App 起不来，而不是去读真配置）', () => {
    const own = '/tmp/case/own-claude'
    expect(buildNomiLaunchEnv({ ...dirs, baseEnv: developerShell, extraEnv: { CLAUDE_CONFIG_DIR: own } }).CLAUDE_CONFIG_DIR).toBe(own)
    expect(() => buildNomiLaunchEnv({ ...dirs, baseEnv: developerShell, extraEnv: { CLAUDE_CONFIG_DIR: developerShell.CLAUDE_CONFIG_DIR } })).toThrow(/真实的宿主配置/)
    expect(() => buildNomiLaunchEnv({ ...dirs, baseEnv: developerShell, extraEnv: { CODEX_HOME: `${realHome}/.codex` } })).toThrow(/codex/)
    // 主目录里的默认位置同样是真配置（用户自己没设变量的那一份）。
    expect(() => buildNomiLaunchEnv({ ...dirs, baseEnv: { HOME: realHome, USERPROFILE: realHome }, extraEnv: { CLAUDE_CONFIG_DIR: `${realHome}/.claude` } })).toThrow(/claude/)
  })

  test('门岗本身：宿主变量没换掉（=没隔离），按注册表逐条核出来的就是漏口', () => {
    const notIsolated = { ...developerShell, NOMI_E2E: '1' }
    const { leaks } = isolatedHostConfigLeaks(notIsolated, { baseEnv: developerShell, accountHome: realHome })
    expect(leaks.length).toBe(resolvedFor(notIsolated).length)
    expect([...new Set(leaks.map((leak) => leak.client))].sort()).toEqual([...new Set(resolvedFor(notIsolated).map((entry) => entry.client))].sort())
    expect(() => withIsolatedHostConfig(developerShell, { hostConfigDir: dirs.hostConfigDir, baseEnv: developerShell })).not.toThrow()
  })

  test('只给了 Nomi 自己的隔离目录、没给 hostConfigDir：当场拒，不让 App 带着真宿主配置起来', () => {
    expect(() => buildNomiLaunchEnv({ ...dirs, hostConfigDir: undefined, baseEnv: {} })).toThrow(/hostConfigDir/)
  })

  test('isolate:false（真实 profile，ui-driver / --real-connect 的既定设计）不动宿主变量', () => {
    const env = buildNomiLaunchEnv({ userDataDir: null, settingsDir: null, projectsDir: null, capabilityDir: null, hostConfigDir: null, baseEnv: developerShell })
    for (const name of MCP_CLIENT_HOST_ENV_VARS) expect(env[name], name).toBe(developerShell[name])
  })

  test('launchNomiApp 把 hostConfigDir 接进同一个 env 构造，并在起 App 前把目录建好（Codex 要求 CODEX_HOME 已存在）', () => {
    const launcher = fs.readFileSync(path.join(repoRoot, 'tests/ux/_launchApp.mjs'), 'utf8')
    expect(launcher).toMatch(/buildNomiLaunchEnv\(\{[^}]*hostConfigDir[^}]*\}\)/)
    expect(launcher).toMatch(/if \(isolate\) prepareHostConfigDir\(hostConfigDir, extraEnv\)/)
    const root = makeTempDir('nomi-host-config-')
    try {
      const made = prepareHostConfigDir(root)
      expect(made).toEqual(MCP_CLIENT_HOST_ENV_VARS.map((name) => path.join(root, name)))
      for (const dir of made) expect(fs.statSync(dir).isDirectory()).toBe(true)
      expect(prepareHostConfigDir(root, { HOME: path.join(root, 'fake-home') })).toEqual([])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('现在挡不住的（只认主目录、没有位置变量的宿主），名单钉死：要挡它得产品侧隔离实例不读真主目录（交协调拍板）', () => {
    const env = buildNomiLaunchEnv({ ...dirs, baseEnv: { HOME: realHome, USERPROFILE: realHome } })
    const { leaks, residual } = isolatedHostConfigLeaks(env, { baseEnv: { HOME: realHome, USERPROFILE: realHome }, accountHome: realHome })
    expect(leaks).toEqual([])
    const fixedOnly = [...new Set(mcpClientLocations().filter((entry) => entry.platform === platform && !entry.location.hostEnv).map((entry) => entry.client))].sort()
    expect(residual).toEqual(fixedOnly)
    expect(residual).toEqual(platform === 'linux' ? ['cursor', 'workbuddy'] : ['claude-desktop', 'cursor', 'workbuddy'])
  })
})

describe('closeElectronWithin', () => {
  const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }

  test('descendantPids：按 ps 的父子关系收整棵子孙树', () => {
    const ps = () => ['  10     1', '  11    10', '  12    11', '  13    10', '  20     1', ''].join('\n')
    expect(descendantPids(10, ps).sort()).toEqual([11, 12, 13])
    expect(descendantPids(20, ps)).toEqual([])
  })

  test('优雅关闭到上限没结束：杀掉关之前拍下的整棵树、放掉管道（Linux 上帮手进程攥着管道的最小复现）', async () => {
    // 主进程忽略 SIGTERM 且常驻；孙进程继承它的 stdout / stderr——Electron 的帮手进程就是这样让 Playwright 的 close 永远等不到管道关。
    const grandchild = 'process.on("SIGTERM", () => {}); process.stdout.write("grandchild-ready\\n"); setInterval(() => {}, 1000)'
    const script = `process.on('SIGTERM', () => {}); require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'inherit' }); setInterval(() => {}, 1000)`
    const child = spawn(process.execPath, ['-e', script], { stdio: ['pipe', 'pipe', 'pipe'] })
    await new Promise((resolve) => { let seen = ''; child.stdout.on('data', (chunk) => { seen += chunk; if (seen.includes('grandchild-ready')) resolve() }) })
    const tree = descendantPids(child.pid)
    expect(tree.length).toBeGreaterThan(0)
    // 关闭永远不回（new Promise(() => {})）：closeElectronWithin 照样返回，上限就生效了；挂住的话这条测试自己超时变红。
    // 不量墙钟（check:test-waits 的 wallclock-budget-assertion：判据要和机器快慢无关）。
    await closeElectronWithin({ process: () => child }, () => new Promise(() => {}), 300)
    await expect.poll(() => [child.pid, ...tree].filter(alive).length, { timeout: 5000 }).toBe(0)
    expect(child.stdout.destroyed && child.stderr.destroyed).toBe(true)
  })

  test('攥着管道的进程已经不在树里（被过继走了）：照样把管道放掉，走查进程不被它拖住', async () => {
    // 中间进程起一个继承了 stdout / stderr 的常驻进程后立刻退出 → 常驻进程被过继给 init，按父子关系找不到它了。
    const holder = 'process.on("SIGTERM", () => {}); process.stdout.write("holder-ready " + process.pid + "\\n"); setInterval(() => {}, 1000)'
    const middle = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(holder)}], { stdio: 'inherit', detached: true }).unref()`
    const script = `process.on('SIGTERM', () => {}); require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(middle)}], { stdio: 'inherit' }); setInterval(() => {}, 1000)`
    const child = spawn(process.execPath, ['-e', script], { stdio: ['pipe', 'pipe', 'pipe'] })
    const holderPid = await new Promise((resolve) => { let seen = ''; child.stdout.on('data', (chunk) => { seen += chunk; const m = /holder-ready (\d+)/.exec(seen); if (m) resolve(Number(m[1])) }) })
    try {
      await expect.poll(() => descendantPids(child.pid).includes(holderPid), { timeout: 5000 }).toBe(false)
      await closeElectronWithin({ process: () => child }, () => new Promise(() => {}), 300)
      expect(alive(child.pid)).toBe(false)
      expect(child.stdout.destroyed && child.stderr.destroyed).toBe(true)
    } finally {
      try { process.kill(holderPid, 'SIGKILL') } catch { /* 已经没了 */ }
    }
  })

  test('已经关过的 app 再关一次（process() 会抛）：不抛、照样走 close——走查先 app.close() 再 close() 是常见写法', async () => {
    let closes = 0
    const closedApp = { process: () => { throw new TypeError("Cannot read properties of undefined (reading '_object')") } }
    await expect(closeElectronWithin(closedApp, async () => { closes += 1 }, 300)).resolves.toBeUndefined()
    expect(closes).toBe(1)
  })

  test('优雅关闭在上限内结束：什么都不杀', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
    try {
      await closeElectronWithin({ process: () => child }, async () => undefined, 300)
      expect(alive(child.pid)).toBe(true)
    } finally {
      child.kill('SIGKILL')
    }
  })
})

describe('withLinuxNoSandbox', () => {
  test('Linux direct spawns disable the unavailable setuid sandbox once', () => {
    expect(withLinuxNoSandbox(['.', '--disable-gpu'], 'linux')).toEqual(['.', '--disable-gpu', '--no-sandbox', '--enable-unsafe-swiftshader'])
    expect(withLinuxNoSandbox(['.', '--no-sandbox'], 'linux')).toEqual(['.', '--no-sandbox', '--enable-unsafe-swiftshader'])
  })

  test('Linux spawns opt in to SwiftShader WebGL exactly once (Chromium >=139 removed the fallback)', () => {
    expect(withLinuxNoSandbox(['.', '--enable-unsafe-swiftshader'], 'linux'))
      .toEqual(['.', '--enable-unsafe-swiftshader', '--no-sandbox'])
  })

  test('non-Linux spawns keep their original arguments', () => {
    expect(withLinuxNoSandbox(['.', '--disable-gpu'], 'darwin')).toEqual(['.', '--disable-gpu'])
    expect(withLinuxNoSandbox(['.', '--disable-gpu'], 'win32')).toEqual(['.', '--disable-gpu'])
  })
})

describe('isolatedCatalogHasSafeStorageCredentials', () => {
  // 2026-10-08 Linux CI：夹具用合成后端加密了 apimart 占位 key，被测 App 却没开同一个后端 →
  // 模型在渲染层「当前不可用」、付费卡一颗参数 chip 都没有。起 App 的后端必须从盘上的 catalog 推出来。
  // 不是凭据：只是 catalog 里那一格的形状（值从不被解密）。
  const placeholder = 'not-a-secret'
  const withCatalog = (catalog, run) => {
    const root = makeTempDir('nomi-synthetic-cred-')
    try {
      if (catalog !== undefined) fs.writeFileSync(path.join(root, 'model-catalog.json'), typeof catalog === 'string' ? catalog : JSON.stringify(catalog))
      return run(root)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }

  test('a fixture catalog with a safeStorage-encrypted key needs the synthetic backend', () => {
    withCatalog({ apiKeysByVendor: {
      'agent-runtime-loopback': { apiKey: placeholder, enc: 'plain' },
      apimart: { apiKey: placeholder, enc: 'safeStorage' },
    } }, (root) => expect(isolatedCatalogHasSafeStorageCredentials(root)).toBe(true))
  })

  test('plain-only, missing or unreadable catalogs do not switch the backend', () => {
    withCatalog({ apiKeysByVendor: { 'agent-runtime-loopback': { apiKey: placeholder, enc: 'plain' } } },
      (root) => expect(isolatedCatalogHasSafeStorageCredentials(root)).toBe(false))
    withCatalog(undefined, (root) => expect(isolatedCatalogHasSafeStorageCredentials(root)).toBe(false))
    withCatalog('{not json', (root) => expect(isolatedCatalogHasSafeStorageCredentials(root)).toBe(false))
  })
})

describe('withLinuxSyntheticCredentialStorage', () => {
  test('isolated synthetic fixtures get a deterministic Linux backend exactly once', () => {
    expect(withLinuxSyntheticCredentialStorage(['.'], true, 'linux'))
      .toEqual(['.', '--password-store=basic'])
    expect(withLinuxSyntheticCredentialStorage(['.', '--password-store=basic'], true, 'linux'))
      .toEqual(['.', '--password-store=basic'])
  })

  test('real credential journeys and non-Linux hosts keep their storage backend', () => {
    expect(withLinuxSyntheticCredentialStorage(['.'], false, 'linux')).toEqual(['.'])
    expect(withLinuxSyntheticCredentialStorage(['.'], true, 'darwin')).toEqual(['.'])
    expect(() => withLinuxSyntheticCredentialStorage(['.', '--password-store=gnome-libsecret'], true, 'linux'))
      .toThrow('synthetic credential storage conflicts')
  })

  test('activates and verifies Electron safeStorage only for opted-in Linux fixtures', async () => {
    const calls = []
    const app = {
      evaluate: async (callback) => callback({
        safeStorage: {
          setUsePlainTextEncryption: (enabled) => calls.push(enabled),
          isEncryptionAvailable: () => true,
        },
      }),
    }

    await expect(configureSyntheticCredentialStorage(app, true, 'linux')).resolves.toBe(true)
    await expect(configureSyntheticCredentialStorage(app, false, 'linux')).resolves.toBe(false)
    await expect(configureSyntheticCredentialStorage(app, true, 'darwin')).resolves.toBe(false)
    expect(calls).toEqual([true])
  })

  test('fails at the launcher boundary when the Linux fallback is still unavailable', async () => {
    const app = {
      evaluate: async (callback) => callback({
        safeStorage: {
          setUsePlainTextEncryption: () => undefined,
          isEncryptionAvailable: () => false,
        },
      }),
    }

    await expect(configureSyntheticCredentialStorage(app, true, 'linux'))
      .rejects.toThrow('could not initialize an in-memory safeStorage key')
  })

  test('every literal fixture credential explicitly opts into isolated synthetic storage', () => {
    const sources = ['tests/ux', 'scripts'].flatMap((directory) =>
      fs.readdirSync(path.join(repoRoot, directory), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
        .map((entry) => path.join(entry.parentPath, entry.name)),
    )
    const offenders = sources
      .filter((file) => {
        const source = fs.readFileSync(file, 'utf8')
        return source.includes('upsertVendorApiKey') && /apiKey:\s*['"]/.test(source) &&
          !/syntheticCredentialStorage:\s*true/.test(source)
      })
      .map((file) => path.relative(repoRoot, file))

    expect(offenders).toEqual([])
  })
})

describe('withPackagedPlaywrightOrigin', () => {
  test('packaged E2E admits the Playwright DevTools websocket exactly once', () => {
    expect(withPackagedPlaywrightOrigin(['--user-data-dir=/tmp/case'], true))
      .toEqual(['--user-data-dir=/tmp/case', '--remote-allow-origins=*'])
    expect(withPackagedPlaywrightOrigin(['--remote-allow-origins=*'], true))
      .toEqual(['--remote-allow-origins=*'])
  })

  test('development launches do not broaden the DevTools origin policy', () => {
    expect(withPackagedPlaywrightOrigin(['.', '--disable-gpu'], false)).toEqual(['.', '--disable-gpu'])
  })
})

describe('diagnoseLaunchFailure', () => {
  test('extracts the real main-process stderr from Playwright Call log and filters debugger noise', () => {
    const error = new Error([
      'electron.launch: Timeout 30000ms exceeded.',
      'Call log:',
      '  - <launching> /Applications/Nomi.app/Contents/MacOS/Nomi',
      '  - <launched> pid=4242',
      '  - [pid=4242][err] Debugger listening on ws://127.0.0.1:9229/abc',
      '  - [pid=4242][err] Debugger attached.',
      '  - [pid=4242][err] DevTools listening on ws://127.0.0.1:31337/devtools/browser/abc',
      '  - [pid=4242][err] fatal: catalog migration failed',
    ].join('\n'))

    const report = diagnoseLaunchFailure('Electron launch timed out', 'synthetic-launch', error, [])

    expect(report).toContain('fatal: catalog migration failed')
    expect(report).not.toContain('Debugger listening')
    expect(report).not.toContain('Debugger attached')
    expect(report).not.toContain('DevTools listening')
  })

  test('an empty capture reports only that the launcher did not capture output', () => {
    const report = diagnoseLaunchFailure(
      'Electron launch timed out',
      'no-output-launch',
      new Error('electron.launch: Timeout 30000ms exceeded.'),
      [],
    )

    expect(report).toContain('启动器未捕获到主进程输出')
    expect(report).not.toContain('压根没起来')
  })
})
