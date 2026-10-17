#!/usr/bin/env node
// 教程站构建胶水：跑 marketing-docs/（Astro Starlight，独立子项目、自己的 lockfile、不进根依赖），
// 把产物搬进 marketing/，再写页面清单（marketing/data/docs-pages.json，sitePages() 读它）。
//
//   node scripts/build-marketing-docs.mjs           构建并写盘
//   node scripts/build-marketing-docs.mjs --check   构建到临时目录，和磁盘上已入库的教程页逐字比对（门岗用）
//
// 搬运规则见 scripts/marketing/docs-site.mjs：只搬教程页 HTML（站内链接改成无 .html 的干净地址）、_astro/、pagefind/；
// Astro 自带的 sitemap、404、favicon 都不搬（官网的 sitemap 由 build-marketing-sitemap.mjs 统一出）。
// 截图和动图不走这里：它们由 tests/ux/docs-media.record.mjs 从真 App 录进 marketing/docs-media/。
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DOCS_ASSET_DIRS,
  DOCS_MANIFEST,
  cleanInternalLinks,
  formatManifest,
  isDocsHtml,
  logicalAssetName,
  manifestFromHtmlPaths,
  missingAstroReferences,
  missingPagefindReferences,
  normalizeBundlerHashes,
} from './marketing/docs-site.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const docsProject = path.join(root, 'marketing-docs')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function run(args, options = {}) {
  const result = spawnSync(pnpm, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', ...options })
  if (result.status !== 0) throw new Error(`pnpm ${args.join(' ')} 失败（退出码 ${result.status}）`)
}

/** 依赖按 marketing-docs 自己的 lockfile 装（冻结，不改 lockfile）；已装好就跳过。 */
function ensureDependencies() {
  if (fs.existsSync(path.join(docsProject, 'node_modules', 'astro'))) return
  run(['--dir', 'marketing-docs', 'install', '--frozen-lockfile', '--ignore-scripts'])
}

function walk(directory, base = directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(file, base) : [path.relative(base, file).split(path.sep).join('/')]
  })
}

/** Astro 产物目录 → 应该落进 marketing/ 的文件：{ 相对 marketing/ 的路径 → Buffer | string }。 */
export function collectOutputs(distDir) {
  const outputs = new Map()
  for (const relativePath of walk(distDir)) {
    const buffer = fs.readFileSync(path.join(distDir, relativePath))
    if (isDocsHtml(relativePath)) outputs.set(relativePath, cleanInternalLinks(buffer.toString('utf8').replaceAll('\r\n', '\n')))
    else if (DOCS_ASSET_DIRS.some((dir) => relativePath.startsWith(`${dir}/`))) outputs.set(relativePath, buffer)
  }
  if (![...outputs.keys()].some(isDocsHtml)) throw new Error('Astro 没有产出任何教程页（docs.html）——检查 marketing-docs/src/content/docs')
  return outputs
}

function buildInto(outDir) {
  ensureDependencies()
  // 直接用 node 跑 astro 的入口，不经 pnpm 的 .cmd 外壳（Windows 下从 Git Bash 起时找不到它）。
  const astro = path.join(docsProject, 'node_modules', 'astro', 'bin', 'astro.mjs')
  const result = spawnSync(process.execPath, [astro, 'build', '--outDir', outDir], { cwd: docsProject, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`astro build 失败（退出码 ${result.status}）`)
  return collectOutputs(outDir)
}

const docsHtmlOnDisk = () => walk(path.join(root, 'marketing')).filter((relativePath) => isDocsHtml(relativePath))

function writeOutputs(outputs) {
  const marketing = path.join(root, 'marketing')
  // 先清旧（加新必删旧）：教程页、_astro、pagefind 整个换掉，改名或删掉的页面不会留在站上。
  for (const relativePath of docsHtmlOnDisk()) fs.rmSync(path.join(marketing, relativePath))
  for (const dir of DOCS_ASSET_DIRS) fs.rmSync(path.join(marketing, dir), { recursive: true, force: true })
  for (const [relativePath, contents] of outputs) {
    const target = path.join(marketing, relativePath)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, contents)
  }
  const htmlPaths = [...outputs.keys()].filter(isDocsHtml)
  const manifestTarget = path.join(root, DOCS_MANIFEST)
  fs.mkdirSync(path.dirname(manifestTarget), { recursive: true })
  fs.writeFileSync(manifestTarget, formatManifest(manifestFromHtmlPaths(htmlPaths)))
  console.log(`Generated ${htmlPaths.length} docs pages, ${outputs.size - htmlPaths.length} assets, ${DOCS_MANIFEST}`)
}

/** 门岗：重建一遍，教程页 HTML 和页面清单必须和磁盘上入库的逐字一致；_astro / pagefind 只核文件在不在（索引内容不比）。 */
function checkOutputs(outputs) {
  const stale = []
  const marketing = path.join(root, 'marketing')
  const assetsOnDisk = DOCS_ASSET_DIRS.flatMap((dir) => (fs.existsSync(path.join(marketing, dir)) ? walk(path.join(marketing, dir)).map((file) => `${dir}/${file}`) : []))
  const astroOnDisk = assetsOnDisk.filter((file) => file.startsWith('_astro/')).map((file) => file.slice('_astro/'.length))
  const logicalOnDisk = new Set(assetsOnDisk.map(logicalAssetName))
  for (const [relativePath, contents] of outputs) {
    const target = path.join(marketing, relativePath)
    if (logicalAssetName(relativePath) !== relativePath) {
      // 打包产物的哈希名随平台变（见 logicalAssetName），只核逻辑文件在不在；引用得上由下面的 missing*References 核。
      if (!logicalOnDisk.has(logicalAssetName(relativePath))) stale.push(`${relativePath}（磁盘上没有）`)
      continue
    }
    if (!fs.existsSync(target)) { stale.push(`${relativePath}（磁盘上没有）`); continue }
    if (isDocsHtml(relativePath)) {
      const onDisk = fs.readFileSync(target, 'utf8').replaceAll('\r\n', '\n')
      // 打包器的哈希（文件名哈希、样式作用域类）不比，其余逐字比（见 normalizeBundlerHashes）。
      if (normalizeBundlerHashes(onDisk) !== normalizeBundlerHashes(contents)) stale.push(relativePath)
    }
  }
  const expectedLogical = new Set([...outputs.keys()].map(logicalAssetName))
  for (const file of assetsOnDisk) if (!expectedLogical.has(logicalAssetName(file))) stale.push(`${file}（源码里已经没有这个文件）`)
  const entryFile = path.join(marketing, 'pagefind', 'pagefind-entry.json')
  if (fs.existsSync(entryFile)) stale.push(...missingPagefindReferences(fs.readFileSync(entryFile, 'utf8'), assetsOnDisk.filter((file) => file.startsWith('pagefind/')).map((file) => file.slice('pagefind/'.length))))
  else stale.push('pagefind/pagefind-entry.json（磁盘上没有）')
  const htmlOnDisk = new Map(docsHtmlOnDisk().map((file) => [file, fs.readFileSync(path.join(marketing, file), 'utf8')]))
  stale.push(...missingAstroReferences(htmlOnDisk, astroOnDisk))
  const expectedHtml = new Set([...outputs.keys()].filter(isDocsHtml))
  for (const relativePath of docsHtmlOnDisk()) if (!expectedHtml.has(relativePath)) stale.push(`${relativePath}（源码里已经没有这一页）`)
  const manifestTarget = path.join(root, DOCS_MANIFEST)
  const manifest = formatManifest(manifestFromHtmlPaths([...expectedHtml]))
  if (!fs.existsSync(manifestTarget) || fs.readFileSync(manifestTarget, 'utf8').replaceAll('\r\n', '\n') !== manifest) stale.push(DOCS_MANIFEST)
  return stale
}

/** 构建暂存目录放在 marketing-docs/dist/ 下（已被 .gitignore）：Astro 用 rename 搬产物，跨盘符（系统临时目录）会 EXDEV。 */
function scratchDir(name) {
  const dir = path.join(docsProject, 'dist', name)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function main() {
  const check = process.argv.includes('--check')
  if (!check) {
    const scratch = scratchDir('build')
    try { writeOutputs(buildInto(scratch)) } finally { fs.rmSync(scratch, { recursive: true, force: true }) }
    return 0
  }
  const scratch = scratchDir('check')
  try {
    const stale = checkOutputs(buildInto(scratch))
    if (stale.length) {
      console.error(`教程站产物和源码对不上（先跑 pnpm run build:docs）：\n${stale.map((item) => `- ${item}`).join('\n')}`)
      return 1
    }
    console.log('MARKETING DOCS CHECK PASS')
    return 0
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
