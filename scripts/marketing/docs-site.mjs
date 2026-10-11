// 教程站（marketing-docs/，Astro Starlight）产物进官网的唯一接口：
//   · 哪些落盘文件属于教程站、站内链接怎么改成官网的干净地址、页面清单（marketing/data/docs-pages.json）怎么读写；
//   · sitePages()（pages.mjs）读这份清单，把教程页并进官网页面清单——sitemap、hreflang、孤儿清理、全部 check-site-* 门岗
//     从此对教程页和对其它页一视同仁。
// 构建本身（跑 astro、拷贝）在 scripts/build-marketing-docs.mjs；这里只放可单测的纯函数和读清单。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { counterpartOutputPath } from './routes.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export const DOCS_MANIFEST = 'marketing/data/docs-pages.json'
/** Astro 产物里整目录搬进 marketing/ 的静态资源（哈希文件名的脚本样式、Pagefind 搜索索引）。 */
export const DOCS_ASSET_DIRS = ['_astro', 'pagefind']

/** dist 里相对路径 `docs.html` / `docs/x.html` / `en/docs.html` / `en/docs/x.html` 才是教程页（404.html 等不算）。 */
export const isDocsHtml = (relativePath) => /^(?:en\/)?docs(?:\.html$|\/.+\.html$)/.test(relativePath)

/**
 * Starlight 在 file 格式下把站内链接写成 `/docs/x.html`，官网门岗要干净地址（无 .html）。
 * 只改以 `/` 开头的 href（站内链接）；外链和页内锚点不动。`/x.html#a` 保留锚点。
 */
export function cleanInternalLinks(html) {
  return html.replace(/(\shref=")(\/[^"#?]*?)\.html((?:[#?][^"]*)?")/g, (_, open, pathname, rest) => {
    const clean = pathname === '/index' ? '/' : pathname === '/en/index' ? '/en/' : pathname
    return `${open}${clean}${rest}`
  })
}

/** 清单：[{ zh: 'marketing/docs.html', en: 'marketing/en/docs.html' }, …]，中文路径排序。每个中文页必须有英文对页。 */
export function manifestFromHtmlPaths(marketingRelativePaths) {
  const zh = marketingRelativePaths.filter((file) => !file.startsWith('en/')).sort()
  const english = new Set(marketingRelativePaths.filter((file) => file.startsWith('en/')))
  const missing = []
  const pages = zh.map((file) => {
    const pair = counterpartOutputPath(`marketing/${file}`)
    if (!english.has(pair.slice('marketing/'.length))) missing.push(pair)
    return { zh: `marketing/${file}`, en: pair }
  })
  const unpaired = [...english].filter((file) => !zh.includes(file.slice('en/'.length)))
  if (missing.length || unpaired.length) {
    throw new Error(`教程页中英必须成对。缺英文：${missing.join('、') || '无'}；缺中文：${unpaired.join('、') || '无'}`)
  }
  return pages
}

export const formatManifest = (pages) => `${JSON.stringify({
  _comment: '教程站页面清单（由 scripts/build-marketing-docs.mjs 生成，勿手改）。sitePages() 读它，把教程页并进官网页面清单。',
  pages,
}, null, 2)}\n`

export function readDocsManifest(root = repoRoot) {
  const file = path.join(root, DOCS_MANIFEST)
  if (!fs.existsSync(file)) return []
  return JSON.parse(fs.readFileSync(file, 'utf8')).pages
}

/**
 * 并进 sitePages() 的教程页条目。内容不是生成器渲染的，而是 Astro 已经落盘的 HTML，
 * 所以 `prebuilt: true`：生成器只拿它算 sitemap 和孤儿清理，不重写它（重写的责任在 build-marketing-docs.mjs）。
 */
export function docsPages(root = repoRoot) {
  return readDocsManifest(root).map((output) => ({
    prebuilt: true,
    output: { 'zh-CN': output.zh, en: output.en },
    render: (locale) => {
      const target = path.join(root, locale === 'en' ? output.en : output.zh)
      if (!fs.existsSync(target)) throw new Error(`教程页 ${path.relative(root, target)} 不在磁盘上：先跑 pnpm run build:docs`)
      return fs.readFileSync(target, 'utf8')
    },
  }))
}
