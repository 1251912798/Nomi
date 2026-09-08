import React, { useLayoutEffect, useRef } from 'react'
import { NomiMarkdown } from '/src/workbench/common/NomiMarkdown'
import { nomiDesignTokens as tokens } from '/src/theme/nomiTheme'

type Entry = { title: Record<string, string>; summary: Record<string, string>; prompt: string; license: string; source: { url: string; author: string } }

// Presentation only: SKILL.md remains the source. NomiMarkdown owns parsing.
function bodyFor(entry: Entry) {
  let body = entry.prompt.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim()
  const blocks = body.split(/\n\s*\n/)
  if (blocks[0] === `# ${entry.title['zh-CN']}`) blocks.shift()
  if (blocks[0] === entry.summary['zh-CN']) blocks.shift()
  body = blocks.join('\n\n')
  return body
}
function authorName(author: string) {
  if (!author.startsWith('https://')) return author
  const url = new URL(author)
  return url.pathname.split('/').filter(Boolean)[0] ?? url.hostname
}
export function Detail({ entry }: { entry: Entry }) {
  const body = bodyFor(entry)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const node = ref.current!
    // Decorate text leaves after the real renderer; never interpret Markdown here.
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
    const leaves: Text[] = []
    while (walker.nextNode()) leaves.push(walker.currentNode as Text)
    for (const leaf of leaves) {
      if (leaf.parentElement?.closest('mark, pre')) continue
      const parts = leaf.data.split(/(\{[^{}\n]+\})/g)
      if (parts.length === 1) continue
      leaf.replaceWith(...parts.map(part => {
        if (!/^\{[^{}]+\}$/.test(part)) return document.createTextNode(part)
        const mark = document.createElement('mark')
        mark.className = 'slot-chip'
        mark.textContent = part
        return mark
      }))
    }
  }, [body])
  return <>
    <header className="detail-intro">
      <h1 className="font-nomi-display text-display" id="detail-title">{entry.title['zh-CN']}</h1>
      <p id="detail-summary">{entry.summary['zh-CN']}</p>
      <div id="detail-source" className="detail-meta">
        <a href={entry.source.url} target="_blank" rel="noreferrer">{new URL(entry.source.url).hostname}</a><span>·</span><span>{entry.license}</span><span>·</span>
        <span title={entry.source.author}>{authorName(entry.source.author)}</span>
      </div>
    </header>
    <div id="detail-prompt">
      <div ref={ref} className="skill-prose" style={{ '--body-leading': tokens.lineHeight.body, '--section-leading': tokens.lineHeight.title } as React.CSSProperties}><NomiMarkdown>{body}</NomiMarkdown></div>
    </div>
  </>
}
