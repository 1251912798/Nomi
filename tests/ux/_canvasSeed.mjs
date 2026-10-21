// 走查种「现行格式」画布的守门（2026-10-18）。
//
// 不少走查种一个现行格式的项目，再断言「打开项目 / 某个手势不改图」。现行格式是活的：
// 2026-10-16 起后台会给缺预览事实的本地图 / 视频补 previewState（resultMediaBackfillBridge），
// 补在打开之后、画布安静时——种子没带这个事实，图就会在走查中途被后台改一笔，
// 拿前后快照比的断言随机红（canvas-shortcuts 的 C19 在 PR #1234 上就这么红过）。
// 判据直接用生产的谓词，不在测试里抄一份：格式再长一个后台补写字段，就在这里加一行生产谓词，
// 种子不合格在开跑前就红，而不是跑到一半随机红。
import { require as tsxRequire } from 'tsx/cjs/api'

const { shouldBackfillPreview, shouldRelocalizeResult } = tsxRequire('../../src/workbench/generationCanvas/resultMediaBackfillBridge.ts', import.meta.url)

/** 打开项目后会被后台补写的结果条目（node.result 与 node.history）。 */
export function backgroundRewrittenEntries(nodes) {
  const out = []
  for (const node of nodes) {
    for (const [index, entry] of [node.result, ...(node.history ?? [])].entries()) {
      if (!entry) continue
      const where = index === 0 ? `${node.id}.result` : `${node.id}.history[${index - 1}]`
      if (shouldBackfillPreview(entry)) out.push(`${where}：缺预览事实（previewState / thumbnailUrl），打开后会被后台补写`)
      if (shouldRelocalizeResult(entry)) out.push(`${where}：远端 URL，打开后会被后台转存到本地`)
    }
  }
  return out
}

export function assertCurrentFormatCanvasSeed(nodes, label = '种子') {
  const problems = backgroundRewrittenEntries(nodes)
  if (problems.length) throw new Error(`${label}不是现行格式，打开后会被后台改写，前后快照比的断言会随机红：\n  ${problems.join('\n  ')}`)
}
