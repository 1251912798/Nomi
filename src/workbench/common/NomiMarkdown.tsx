import { memo, useId, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { IconPhoto } from '@tabler/icons-react'
import { Streamdown, type Components, type PluginConfig } from 'streamdown'
import { createCodePlugin } from '@streamdown/code'
import { cjk } from '@streamdown/cjk'

/** Single Markdown owner. Streamdown owns parsing, streaming, code source and copy.
 * The component map only supplies Nomi typography and local-first link/image policy. */
type MarkdownProfile = 'agent-v4'

function makeComponents(compact: boolean, profile: MarkdownProfile | undefined, labels: MarkdownLabels): Components {
  const pMy = compact ? 'my-1' : 'my-2'
  const hMt = compact ? 'mt-2.5' : 'mt-4'
  const hMb = compact ? 'mb-1' : 'mb-2'
  const flat = profile === 'agent-v4'
  const h1 = compact ? 'text-title' : 'text-h2'
  const h2 = compact ? 'text-body' : 'text-title'
  const h3 = compact ? 'text-body-sm' : 'text-body'
  const bodyText = flat ? 'text-body-sm' : 'text-body'
  return {
    h1: ({ node: _n, ...p }) => <h1 className={`${h1} font-semibold leading-snug text-nomi-ink ${hMt} ${hMb} first:mt-0`} {...p} />,
    h2: ({ node: _n, ...p }) => <h2 className={`${h2} font-semibold leading-snug text-nomi-ink ${hMt} ${hMb} first:mt-0`} {...p} />,
    h3: ({ node: _n, ...p }) => <h3 className={`${h3} font-semibold leading-snug text-nomi-ink ${hMt} ${hMb} first:mt-0`} {...p} />,
    h4: ({ node: _n, ...p }) => <h4 className={`text-body-sm font-medium text-nomi-ink ${hMt} ${hMb}`} {...p} />,
    h5: ({ node: _n, ...p }) => <h5 className={`text-caption font-semibold text-nomi-ink ${hMt} ${hMb}`} {...p} />,
    h6: ({ node: _n, ...p }) => <h6 className={`text-caption font-medium text-nomi-ink-80 ${hMt} ${hMb}`} {...p} />,
    p: ({ node: _n, ...p }) => <p className={`${bodyText} leading-relaxed text-nomi-ink-80 ${pMy}`} {...p} />,
    ul: ({ node: _n, className, ...p }) => {
      const isTask = /contains-task-list/.test(className || '')
      return <ul className={`${isTask ? 'list-none pl-5' : 'list-disc pl-5'} ${pMy} ${bodyText} leading-relaxed text-nomi-ink-80`} {...p} />
    },
    ol: ({ node: _n, ...p }) => <ol className={`list-decimal pl-5 ${pMy} ${bodyText} leading-relaxed text-nomi-ink-80`} {...p} />,
    li: ({ node: _n, className, ...p }) => <li className={`my-0.5 ${/task-list-item/.test(className || '') ? 'list-none' : ''}`.trim()} {...p} />,
    a: ({ node: _n, children, href, ...p }) => {
      const external = Boolean(href && /^https?:\/\//i.test(href))
      const anchor = Boolean(href?.startsWith('#'))
      const destination = href?.startsWith('#user-content-') ? `#${labels.anchorPrefix}${href.slice('#user-content-'.length)}` : href
      if (!external && !anchor) return <span>{children}</span>
      return <a {...p} href={destination} onClick={anchor ? (event) => {
        // HashRouter owns location.hash; document references must scroll without navigation.
        event.preventDefault()
        document.getElementById(destination!.slice(1))?.scrollIntoView({ block: 'nearest' })
      } : undefined} className="text-nomi-accent underline underline-offset-2 [overflow-wrap:anywhere]" target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>{children}{external && profile === 'agent-v4' ? <span aria-hidden="true" className="ml-0.5 no-underline">↗</span> : null}</a>
    },
    blockquote: ({ node: _n, ...p }) => <blockquote className={`border-l-2 border-nomi-line pl-3 ${pMy} text-nomi-ink-60`} {...p} />,
    hr: ({ node: _n, ...p }) => <hr className="border-nomi-line my-3" {...p} />,
    strong: ({ node: _n, ...p }) => <strong className="font-semibold text-nomi-ink" {...p} />,
    del: ({ node: _n, ...p }) => <del className="line-through text-nomi-ink-60" {...p} />,
    inlineCode: ({ node: _n, ...p }) => <code className="font-nomi-mono text-caption bg-nomi-ink-05 rounded-nomi-sm px-1 py-0.5 [overflow-wrap:anywhere]" {...p} />,
    // Do not request model-provided image URLs automatically. Preserve an explicit entry.
    img: ({ node: _n, alt, src }) => {
      const content = <><IconPhoto size={12} />{alt || labels?.imageLabel}</>
      const skin = 'inline-flex items-center gap-1 rounded-nomi-sm border border-nomi-line bg-nomi-ink-05 px-1.5 py-0.5 text-caption text-nomi-ink-60'
      return src && /^https?:\/\//i.test(src)
        ? <a className={skin} href={src} target="_blank" rel="noreferrer">{content}</a>
        : <span className={skin}>{content}</span>
    },
    // GFM 表格：token 化 + 整体可横向滚动（窄聊天列不溢出/不撑破气泡）。
    table: ({ node: _n, ...p }) => (
      <div className={`${pMy} max-w-full overflow-x-auto`}>
        <table className="w-full text-caption border-collapse" {...p} />
      </div>
    ),
    thead: ({ node: _n, ...p }) => <thead className="border-b border-nomi-line" {...p} />,
    th: ({ node: _n, ...p }) => <th className="px-2 py-1 text-left font-semibold text-nomi-ink border border-nomi-line" {...p} />,
    td: ({ node: _n, ...p }) => <td className="px-2 py-1 text-nomi-ink-80 border border-nomi-line align-top" {...p} />,
    // 任务清单复选框（GFM 输出 disabled input）：token 强调色 + 与文字对齐。
    input: ({ node: _n, ...p }) => <input className="mr-1.5 align-middle accent-nomi-accent" {...p} disabled />,
  }
}

type MarkdownLabels = { imageLabel: string; anchorPrefix: string }

// Shiki keeps its tokenizer/cache; theme values follow the same Nomi tokens in both modes.
const theme = {
  name: 'nomi', fg: 'var(--nomi-ink-80)', bg: 'var(--nomi-ink-05)',
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: 'var(--nomi-ink-40)' } },
    { scope: ['keyword', 'storage'], settings: { foreground: 'var(--nomi-accent)' } },
    { scope: ['string'], settings: { foreground: 'var(--nomi-success)' } },
    { scope: ['constant.numeric', 'constant.language'], settings: { foreground: 'var(--nomi-warning)' } },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: 'var(--nomi-info-ink)' } },
  ],
}
const plugins: PluginConfig = { code: createCodePlugin({ themes: [theme, theme] }), cjk }
const controls = { code: { copy: true, download: false }, table: false, image: false }

export const NomiMarkdown = memo(function NomiMarkdown({
  children, compact = false, profile, streaming = false, copyLabel, imageLabel,
}: {
  children: string
  compact?: boolean
  profile?: MarkdownProfile
  streaming?: boolean
  copyLabel?: string
  imageLabel?: string
}): JSX.Element {
  const { t } = useTranslation()
  const id = useId()
  const components = useMemo(() => makeComponents(compact, profile, { imageLabel: imageLabel ?? t('agentPanelV4.image'), anchorPrefix: `nomi-${id}-` }), [compact, profile, imageLabel, id, t])
  const remarkRehypeOptions = useMemo(() => ({ clobberPrefix: `nomi-${id}-` }), [id])
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <Streamdown components={components} plugins={plugins} controls={controls}
        mode="streaming" isAnimating={streaming} caret="block" parseIncompleteMarkdown={false}
        skipHtml remarkRehypeOptions={remarkRehypeOptions} lineNumbers={false}
        codeBlockMaxHeight={0} tableMaxHeight={0}
        translations={{ copyCode: copyLabel ?? t('agentPanelV4.copy'), copied: t('libraries.prompt.preview.copied') }}
        className="space-y-1 [&_[data-streamdown=code-block]]:my-2 [&_[data-streamdown=code-block]]:rounded-nomi-sm [&_[data-streamdown=code-block]]:border-nomi-line [&_[data-streamdown=code-block]]:bg-nomi-ink-05 [&_[data-streamdown=code-block]]:text-nomi-ink-80 [&_[data-streamdown=code-block-header]]:px-3 [&_[data-streamdown=code-block-header]]:py-1 [&_[data-streamdown=code-block-header]]:text-micro [&_[data-streamdown=code-block-body]]:border-nomi-line [&_[data-streamdown=code-block-body]]:rounded-nomi-sm [&_[data-streamdown=code-block-copy-button]]:border-nomi-line [&_[data-streamdown=code-block-copy-button]]:rounded-nomi-sm [&_[data-streamdown=code-block-copy-button]]:text-nomi-ink-60 [&_pre]:overflow-x-auto [&_pre]:p-3 [&_pre]:font-nomi-mono [&_pre]:text-caption [&_pre]:leading-relaxed [&_pre_code]:font-nomi-mono">
        {children}
      </Streamdown>
    </div>
  )
})
