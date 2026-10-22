// 门岗纯函数：构建产物（dist / dist-electron）的源码引用，不许指向构建戳排除的路径。
//
// 构建戳（scripts/package-build-stamp.mjs）的指纹默认全算，只排除 NON_INPUTS 里「能证明不进构建」的路径。
// 「能证明」靠 grep，一次性的；以后有人在 src 里新加 `import x from '../docs/…?raw'`，指纹就漏算，
// 构建后改那个文件戳仍显示新鲜。本门岗把这次 grep 自动化：判据读 package-build-stamp.mjs 导出的同一份常量，不另抄。
import path from 'node:path'
import { KEEP_INSIDE_EXCLUDED, NON_INPUTS } from '../package-build-stamp.mjs'

/**
 * App 构建链上的脚本（package.json 的 build:renderer / build:electron 实际调用的）。scripts/build-*.mjs 里别的
 * （build-delivery-ledger、build-marketing-* 等）生成文档 / 站点，不产出 dist，不在范围内。
 */
export const BUILD_CHAIN_SCRIPTS = ['scripts/build-tailwind.mjs', 'scripts/build-electron.mjs', 'scripts/write-intake-config.mjs', 'scripts/electron-build-artifacts.mjs']

/** 构建会读到的源码范围：src、electron（不含测试文件）与构建链的配置 / 脚本。 */
export function isBuildSourceFile(rel) {
  if (/\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)(__tests__|__fixtures__|fixtures)\//.test(rel)) return false
  if (/^(src|electron)\/.+\.[cm]?[jt]sx?$/.test(rel)) return true
  return /^(vite\.config\.ts|tailwind\.config\.ts|postcss\.config\.js)$/.test(rel) || BUILD_CHAIN_SCRIPTS.includes(rel)
}

/** 这一行是在「把文件读进构建」而不是只提到路径文字：静态 import、?raw、import.meta.glob、new URL、require、构建期 fs 读取。 */
const READS_FILE = /^\s*import\b|\bimport\s*\(|\bfrom\s+['"]|\?raw|import\.meta\.glob|new URL\(|\brequire\(|\b(?:readFile|readFileSync|readdirSync|readdir|existsSync|statSync|copyFileSync|cpSync|createReadStream)\s*\(|\bpath\.(?:join|resolve)\(\s*(?:repoRoot|rootDir|root|__dirname|process\.cwd\(\))\b/

const isRootMarkdown = (resolved) => !resolved.includes('/') && resolved.endsWith('.md')
const underAny = (resolved, dirs) => dirs.some((dir) => resolved === dir || resolved.startsWith(`${dir}/`))

/**
 * @param {{ rel: string, source: string }[]} files  rel 用正斜杠
 * @returns {string[]} 违规描述（空 = 干净）
 */
export function findExcludedInputRefs(files) {
  const problems = []
  for (const { rel, source } of files) {
    if (!isBuildSourceFile(rel)) continue
    source.split('\n').forEach((line, index) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line) || !READS_FILE.test(line)) return
      for (const [, raw] of line.matchAll(/['"`]([^'"`\n]+)['"`]/g)) {
        const spec = raw.replace(/[?#].*$/, '') // ?raw / ?url 等查询串不属于路径
        const relative = /^\.\.?\//.test(spec)
        const fromFile = relative ? path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)) : null
        const stripped = spec.replace(/^(?:\.\.?\/)+/, '').replace(/^\/+/, '')
        const hit = underAny(stripped, NON_INPUTS) || (fromFile !== null && (underAny(fromFile, NON_INPUTS) || isRootMarkdown(fromFile)))
        if (!hit) continue
        if (underAny(stripped, KEEP_INSIDE_EXCLUDED) || (fromFile !== null && underAny(fromFile, KEEP_INSIDE_EXCLUDED))) continue
        problems.push(`${rel}:${index + 1}: 引用了构建戳排除的路径「${spec}」—— 这个路径进了构建，要从 package-build-stamp.mjs 的 NON_INPUTS 拿掉，或加保留例外（KEEP_INSIDE_EXCLUDED）`)
        return
      }
    })
  }
  return problems
}
