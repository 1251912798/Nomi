import React from 'react'
import type { Editor } from '@tiptap/react'
import { createRewriteController, type RewriteController, type RewriteHost } from './rewriteController'
import type { RewriteSession } from './rewriteSession'

export function editorRewriteHost(editor: Editor): RewriteHost {
  return {
    get state() {
      return editor.state
    },
    dispatch: (transaction) => editor.view.dispatch(transaction),
    subscribe: (listener) => {
      editor.on('transaction', listener)
      return () => {
        editor.off('transaction', listener)
      }
    },
  }
}

export type AiRewrite = {
  controller: RewriteController | null
  session: RewriteSession | null
}

const NOOP = (): void => undefined

/** 创作编辑器的 AI 编辑：一个编辑器一个控制器，会话状态读自编辑器自己的插件状态（唯一 owner）。 */
export function useAiRewrite(editor: Editor | null): AiRewrite {
  const [controller, setController] = React.useState<RewriteController | null>(null)
  React.useEffect(() => {
    if (!editor || editor.isDestroyed) {
      setController(null)
      return undefined
    }
    const created = createRewriteController(editorRewriteHost(editor))
    setController(created)
    return () => {
      created.dispose()
      setController(null)
    }
  }, [editor])
  const subscribe = React.useCallback(
    (listener: () => void) => (controller ? controller.subscribe(listener) : NOOP),
    [controller],
  )
  const getSnapshot = React.useCallback(() => (controller ? controller.session() : null), [controller])
  const session = React.useSyncExternalStore(subscribe, getSnapshot, () => null)
  return { controller, session }
}
