// 提示词里引用块的名字——给没有「当前节点」概念的宿主（Agent 输入框）用：
// 引用的图是画布上哪个节点出的，就叫那个节点的标题；认不出就取文件名。
// 订阅只取「被引用的那几个 url 对应的标题」拼成的一个字符串（referenceNameKey）：画布上别的变化不让输入框重渲。
import { canvasNodeToAssetRefs } from '../../assets/assetTypes'
import { clipReferenceName, dedupeChipNames, nameFromUrl } from '../../assets/referenceNames'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

export function referenceNameKey(urls: readonly string[], nodes: readonly GenerationCanvasNode[]): string {
  return urls.map((url) => {
    const owner = nodes.find((node) => canvasNodeToAssetRefs(node).some((asset) => asset.renderUrl === url))
    return `${url}\t${String(owner?.title || '').trim()}`
  }).join('\n')
}

export function referenceNamesFromKey(key: string): Readonly<Record<string, string>> | null {
  if (!key) return null
  const rows = key.split('\n').map((line) => {
    const [url = '', title = ''] = line.split('\t')
    return { url, name: title || nameFromUrl(url) }
  }).filter((row) => row.name)
  const clipped = dedupeChipNames(rows.map((row) => clipReferenceName(row.name)))
  return Object.fromEntries(rows.map((row, index) => [row.url, clipped[index]!]))
}
