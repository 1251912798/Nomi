import { diffWordsWithSpace } from 'diff'

/**
 * 「改前 / 改后」怎么画：删掉的划线、新加的标出来。
 *
 * 比较交给成熟库 `diff`（jsdiff，通用文本比较不是我们独有的）；中文没有空格，
 * 靠 `Intl.Segmenter` 按词切（桌面端 Chromium 自带），切不了才退回按空白切。
 */
export type RewriteDiffPart = { kind: 'keep' | 'del' | 'add'; text: string }

// tsconfig 的 lib 还没带 Intl.Segmenter（运行时 Chromium / Node 都有），这里只声明用到的那一小块。
type WordSegmenterConstructor = new (locale: string | undefined, options: { granularity: 'word' }) => unknown

let segmenter: unknown | null | undefined

function wordSegmenter(): unknown | undefined {
  if (segmenter === undefined) {
    try {
      const Segmenter = (Intl as unknown as { Segmenter?: WordSegmenterConstructor }).Segmenter
      segmenter = Segmenter ? new Segmenter(undefined, { granularity: 'word' }) : null
    } catch {
      segmenter = null
    }
  }
  return segmenter ?? undefined
}

let lastDiff: { original: string; rewritten: string; parts: RewriteDiffPart[] } | null = null

/** 编辑器每次状态更新都会重画装饰；同一对原文 / 新文只比一次（8000 字的比较约几十毫秒）。 */
export function diffRewrite(original: string, rewritten: string): RewriteDiffPart[] {
  if (lastDiff && lastDiff.original === original && lastDiff.rewritten === rewritten) return lastDiff.parts
  const parts = diffWordsWithSpace(original, rewritten, { intlSegmenter: wordSegmenter() })
  const result = parts
    .filter((part) => part.value.length > 0)
    .map((part): RewriteDiffPart => ({ kind: part.added ? 'add' : part.removed ? 'del' : 'keep', text: part.value }))
  lastDiff = { original, rewritten, parts: result }
  return result
}
