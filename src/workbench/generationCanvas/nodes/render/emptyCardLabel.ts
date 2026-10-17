import type { TiptapDocJson } from '../../model/generationCanvasTypes'

/** 文档是否为空（无内容，或只有一个空段落）——用于显示占位提示。 */
export function isDocEmpty(doc?: TiptapDocJson): boolean {
  const content = doc?.content
  if (!content || content.length === 0) return true
  return content.every((entry) => {
    const block = entry as { type?: string; content?: unknown[] }
    return block.type === 'paragraph' && (!block.content || block.content.length === 0)
  })
}

/**
 * 空的卡片 / 文本卡：框外标签行带标题（和图片 / 视频卡统一），任何生成状态都在，不随 status 消失。
 * 有结果图的卡片、有正文的文本卡不带——它们的标题归各自 body。
 */
export function hasEmptyCardLabel({ isCardKind, isTextKind, hasResult, contentJson }: {
  isCardKind: boolean
  isTextKind: boolean
  hasResult: boolean
  contentJson?: TiptapDocJson
}): boolean {
  return (isCardKind && !hasResult) || (isTextKind && isDocEmpty(contentJson))
}
