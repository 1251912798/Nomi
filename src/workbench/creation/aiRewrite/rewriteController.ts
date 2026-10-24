import type { EditorState, Transaction } from '@tiptap/pm/state'
import { runRewriteModel } from './rewriteModel'
import {
  acceptRewrite,
  closeRewriteTransaction,
  getRewriteDocumentId,
  getRewriteSession,
  openRewriteTransaction,
  patchRewriteTransaction,
  rangeText,
  trimmedRange,
  type RewriteRequirement,
  type RewriteSession,
} from './rewriteSession'

/** 编辑器的最小接口：测试里没有 DOM，用同一份接口接一个只有 EditorState 的宿主。 */
export type RewriteHost = {
  readonly state: EditorState
  dispatch(transaction: Transaction): void
  /** 每一笔事务之后通知（包括插件自己在键盘 / ✓✕ 里发起的）。返回取消订阅。 */
  subscribe(listener: () => void): () => void
}

export type RewriteController = {
  /** 用当前选区开一次 AI 编辑。没有可改的字返回 false。 */
  open(): boolean
  /** 提交一条要求（点常用改法 / 回车）。 */
  submit(requirement: RewriteRequirement): void
  /** ↻：用会话里记着的原要求、同一段原文再来一次。 */
  retry(): void
  accept(): void
  discard(): void
  session(): RewriteSession | null
  subscribe(listener: () => void): () => void
  dispose(): void
}

let nextSessionId = 1

export type RewriteControllerOptions = {
  /** 会话因为切了文稿被作废（进行中的取消 / 结果已出的丢掉）：界面据此告诉用户「这次改写没有写入」。 */
  onDiscarded?: (reason: 'document-switched') => void
}

export function createRewriteController(host: RewriteHost, options: RewriteControllerOptions = {}): RewriteController {
  let inflight: { id: number; abort: AbortController } | null = null
  const listeners = new Set<() => void>()

  const session = (): RewriteSession | null => getRewriteSession(host.state)

  const stopInflightIfStale = (): void => {
    if (!inflight) return
    const current = session()
    // 会话没了 / 换了一个：这次调用的结果无处可去，直接让它停（不再花时间、不再占网络）。
    if (!current || current.id !== inflight.id) {
      inflight.abort.abort()
      inflight = null
    }
  }

  let lastSession = session()
  let lastDocumentId = getRewriteDocumentId(host.state)
  const offHost = host.subscribe(() => {
    stopInflightIfStale()
    const now = session()
    const documentId = getRewriteDocumentId(host.state)
    if (lastSession && !now && documentId !== lastDocumentId && (lastSession.status === 'running' || lastSession.status === 'result')) {
      options.onDiscarded?.('document-switched')
    }
    lastSession = now
    lastDocumentId = documentId
    listeners.forEach((listener) => listener())
  })

  const run = (requirement: RewriteRequirement): void => {
    const current = session()
    if (!current || current.status === 'running') return
    const id = current.id
    const abort = new AbortController()
    inflight = { id, abort }
    host.dispatch(patchRewriteTransaction(host.state, id, { status: 'running', requirement, result: null, failure: null }))
    // 注意：永远用会话里记着的 original（打开那一刻的原文），不用上一版结果。
    void runRewriteModel({ original: current.original, requirement, signal: abort.signal }).then((outcome) => {
      if (inflight?.id === id && inflight.abort === abort) inflight = null
      if (abort.signal.aborted || (!outcome.ok && outcome.aborted)) return
      const live = session()
      // 回来时会话已经不是它了、或原文已被改过：结果无处可写，丢掉。
      if (!live || live.id !== id || live.status !== 'running') return
      if (rangeText(host.state.doc, live.from, live.to) !== live.original) return
      host.dispatch(
        outcome.ok
          ? patchRewriteTransaction(host.state, id, { status: 'result', result: outcome.text, failure: null })
          : patchRewriteTransaction(host.state, id, { status: 'failed', result: null, failure: outcome.aborted ? null : outcome.reason }),
      )
    })
  }

  return {
    open() {
      const { from, to, empty } = host.state.selection
      if (empty || from === to) return false
      const range = trimmedRange(host.state.doc, from, to)
      if (!range) return false
      host.dispatch(openRewriteTransaction(host.state, {
        id: nextSessionId++,
        documentId: getRewriteDocumentId(host.state),
        from: range.from,
        to: range.to,
        original: range.text,
        status: 'menu',
        requirement: null,
        result: null,
        failure: null,
      }))
      return true
    },
    submit(requirement) {
      if (!requirement.instruction.trim()) return
      run(requirement)
    },
    retry() {
      const requirement = session()?.requirement
      if (requirement) run(requirement)
    },
    accept() {
      acceptRewrite(host)
    },
    discard() {
      if (session()) host.dispatch(closeRewriteTransaction(host.state))
    },
    session,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose() {
      inflight?.abort.abort()
      inflight = null
      offHost()
      listeners.clear()
    },
  }
}
