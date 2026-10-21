import { makeTempDir } from './_test-temp.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const outputs = ['dist', 'dist-electron']
const stampName = 'build-stamp.json'
const hint = '构建产物缺失、过期或构建失败；先 `pnpm build`。'

/**
 * 戳的版本。v2：指纹只算会影响构建产物的输入（见 NON_INPUTS），不再带 HEAD / dirty；v1 戳一律作废。
 */
const STAMP_VERSION = 2

/**
 * 能证明不进 dist / dist-electron 的路径（默认一切都算输入，只有这里列出的才排除；失败时偏安全）。
 * 每一项的证据（2026-10-22 在 src/、electron/、vite.config.ts、tailwind.config.ts、scripts/build-*.mjs、
 * scripts/write-intake-config.mjs、package.json 里 grep，含 ?raw 导入、import.meta.glob、new URL、构建期 fs 读取）：
 *   · .github/、.claude/、.agents/  —— 构建链与源码里没有任何引用（只有提示文案里的提及）。
 *   · 根目录 *.md（AGENTS / CLAUDE / README* / Design / CHANGELOG / CLA / CODEX-* / MARKET-RESEARCH）—— 没有被导入或读取。
 *   · docs/ —— 除 docs/release-notes/：src/devlab 以 ?raw 导入 docs/release-notes/*.md，进产物，见 KEEP_INSIDE_EXCLUDED。
 *   · tests/ —— 除 tests/ux/fixtures/：src/devlab 以 new URL(...) 引用 tests/ux/fixtures 里的视频，进产物，见 KEEP_INSIDE_EXCLUDED。
 * 不能排除的（有引用）：evals/（src/devlab 导入）、skills/、agent-skills/（?raw）、src 下所有 *.md。
 * 加排除项前先重做同样的 grep；有引用就不能加。
 */
const NON_INPUTS = ['.github', '.claude', '.agents', 'docs', 'tests']
const NON_INPUT_GLOBS = ['*.md'] // 仓库根目录的 md（glob 里 * 不跨目录）
const KEEP_INSIDE_EXCLUDED = ['docs/release-notes', 'tests/ux/fixtures']

export function sourceIdentity(root) {
  const scratch = makeTempDir('nomi-build-index-')
  const env = { ...process.env, GIT_INDEX_FILE: path.join(scratch, 'index') }
  const git = (args) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  try {
    git(['read-tree', '--empty'])
    git(['add', '-A', '--', '.', ...NON_INPUTS.map(dir => `:(exclude)${dir}`), ...NON_INPUT_GLOBS.map(glob => `:(exclude,glob)${glob}`)])
    for (const dir of KEEP_INSIDE_EXCLUDED) if (fs.existsSync(path.join(root, dir))) git(['add', '-A', '--', dir])
    return { tree: git(['write-tree']) }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true })
  }
}

export function invalidateBuild(root) {
  for (const output of outputs) fs.rmSync(path.join(root, output, stampName), { force: true })
}

export function verifyBuild(root) {
  const current = sourceIdentity(root)
  for (const output of outputs) {
    let stamp
    try { stamp = JSON.parse(fs.readFileSync(path.join(root, output, stampName), 'utf8')) }
    catch { throw new Error(`${output}: ${hint}`) }
    if (stamp.version !== STAMP_VERSION || Object.keys(current).some(key => stamp[key] !== current[key])) {
      throw new Error(`${output}: ${hint}`)
    }
  }
  return current
}

/**
 * 走查 / e2e / 性能驱动 / MCP 真机起跑前的唯一构建核对（G-walk-build）：它们跑的都是 dist / dist-electron，
 * 构建比源码旧，「通过」和截图就不反映新代码。戳缺失或和当前源码树不一致一律拒跑；没有跳过开关。
 * 打包形态跑的是安装包自带产物，不看仓库里的 dist，调用方不调本函数。
 */
export function assertFreshBuild(root) {
  try { return verifyBuild(root) }
  catch (error) {
    throw new Error(`构建产物比源码旧（或没有构建），先跑 pnpm run build——否则走查 / e2e / 性能量到的是旧代码。（${error.message}）`)
  }
}

export function stampedBuild(root, build) {
  invalidateBuild(root)
  const before = sourceIdentity(root)
  build()
  if (JSON.stringify(before) !== JSON.stringify(sourceIdentity(root))) throw new Error(`构建期间源码变化；${hint}`)
  // Never manufacture missing output directories after an incomplete build.
  for (const output of outputs) {
    if (!fs.statSync(path.join(root, output)).isDirectory()) throw new Error(hint)
  }
  try {
    for (const output of outputs) fs.writeFileSync(path.join(root, output, stampName), JSON.stringify({ version: STAMP_VERSION, ...before }) + '\n')
  } catch (error) {
    invalidateBuild(root)
    throw error
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd()
  try {
    const command = process.argv[2]
    if (command === 'verify') {
      console.log('PASS package build stamp', verifyBuild(root))
    } else if (command === 'invalidate') invalidateBuild(root)
    else if (command === 'build') stampedBuild(root, () => {
      for (const script of ['check:electron-install', 'build:renderer', 'build:electron']) {
        const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', script], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
        if (result.error || result.status !== 0) throw new Error(`Build failed: ${script}; ${hint}`)
      }
    })
    else throw new Error('Usage: package-build-stamp.mjs build|verify|invalidate')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
