// 画布预览不变式 · 入口普查（门岗）。2026-10-16 F-thumbs。
//
// 类根因：「交给画布的图片带有界预览」以前没有 owner——落盘回执可以不带预览事实、包装层可以只回 url、
// 构建结果的地方可以把源地址填进 thumbnailUrl、画图的地方可以直接挂 result.url。每个入口各自记得才对，
// 新入口一忘，原图就悄悄上了画布。这份普查把三条「写法」钉死，新代码写回旧形状当场红：
//   1. 任何生产代码都不许把源地址写进 thumbnailUrl（`thumbnailUrl: url`、`thumbnailUrl: x || url`、`? url :`）；
//   2. 画布图片组件（DeferredNodeImage）的 src 只能来自 canvasImageSource，不许直接拿 .url / thumbnailUrl 拼；
//   3. 只回门牌号、丢掉预览两栏的旧落盘包装（persistNodeImageFile）只剩名单里的调用者。
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = path.resolve(__dirname, '../../..')

function productionFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '__fixtures__' || entry.name === 'devlab') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) && !/TestUtils\.ts$|E2eFixture\.ts$/.test(entry.name)) out.push(full)
    }
  }
  walk(path.join(REPO, root))
  return out
}

const rel = (file: string) => path.relative(REPO, file).replace(/\\/g, '/')
const ALL_PRODUCTION = [...productionFiles('src'), ...productionFiles('electron')]

describe('画布预览不变式 · 入口普查', () => {
  it('没有生产代码把源地址写进 thumbnailUrl（「非空 thumbnailUrl ≠ 真的小图」的形状）', () => {
    const SOURCE_AS_PREVIEW = /thumbnailUrl\s*:\s*(?:[^,\n}]*(?:\|\||\?)\s*\(?[^,\n}]*\b(?:url|next|localUrl|sourceUrl)\b(?![\w.(])|(?:url|next|localUrl|sourceUrl)\s*[,}\n])/
    const offenders = ALL_PRODUCTION.flatMap((file) => fs.readFileSync(file, 'utf8').split('\n')
      .map((line, index) => ({ line: line.trim(), at: `${rel(file)}:${index + 1}` }))
      .filter(({ line }) => !line.startsWith('//') && !line.startsWith('*') && SOURCE_AS_PREVIEW.test(line))
      .map(({ at, line }) => `${at}  ${line}`))
    expect(offenders).toEqual([])
  })

  it('DeferredNodeImage 的 src 只来自 canvasImageSource（不直接挂 result.url / thumbnailUrl || url）', () => {
    const offenders: string[] = []
    for (const file of productionFiles('src/workbench')) {
      const text = fs.readFileSync(file, 'utf8')
      for (const match of text.matchAll(/<DeferredNodeImage\b[\s\S]*?\/>/g)) {
        const src = /\bsrc=\{([^}]*)\}/.exec(match[0])?.[1] ?? ''
        if (/\.url\b|thumbnailUrl/.test(src)) offenders.push(`${rel(file)}  src={${src}}`)
      }
    }
    // DeferredNodeImage 的 src 已是品牌类型（tsc 拦裸字符串）；这条普查留着拦 `as CanvasImageSource` 之类绕过类型的写法。
    expect(offenders).toEqual([])
  })

  it('只回门牌号的 persistNodeImageFile 只剩白板与截图裁剪（二者的契约测试都在白板目录，归草稿 #1189）在用；其余入口都拿带预览两栏的媒体字段', () => {
    const callers = productionFiles('src').filter((file) => !file.endsWith(path.join('adapters', 'persistNodeImage.ts')))
      .filter((file) => /\bpersistNodeImageFile\s*\(/.test(fs.readFileSync(file, 'utf8')))
      .map(rel)
      .sort()
    expect(callers).toEqual([
      'src/workbench/generationCanvas/components/ScreenshotCropOverlay.tsx',
      'src/workbench/generationCanvas/nodes/whiteboard/InlineWhiteboard.tsx',
      'src/workbench/generationCanvas/nodes/whiteboard/WhiteboardDrawingTool.tsx',
    ])
  })

  it('拿到 persistNodeImageBlob / persistNodeMediaFile 结果的地方整段展开媒体字段，不单拎 url', () => {
    const offenders = productionFiles('src/workbench').flatMap((file) => {
      const text = fs.readFileSync(file, 'utf8')
      if (!/persistNodeImageBlob|persistNodeMediaFile/.test(text) || file.endsWith(path.join('adapters', 'persistNodeImage.ts'))) return []
      return /url:\s*(?:stored|persisted|media)(?:\.media)?\.url\b/.test(text) ? [rel(file)] : []
    })
    expect(offenders).toEqual([])
  })
})
