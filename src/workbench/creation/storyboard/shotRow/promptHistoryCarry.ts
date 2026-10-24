import React from 'react'
import type { Editor, JSONContent } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { closeHistory, undo } from '@tiptap/pm/history'
import { contentToPrompt } from '../../../assets/promptEditorContent'

/**
 * 分镜表窗口化之后，一行滚出视口就卸载，它的 TipTap 编辑器连同撤销历史一起被销毁（V-1210 首轮阻断：
 * 改了第 3 镜 → 点去别的镜 → 滚远 → 回来 Ctrl+Z，原文回不来；窗口化之前编辑器从不卸载，撤销一直在）。
 *
 * 撤销仍然由编辑器自己的 history 负责（main 上 Ctrl+Z 就是 ProseMirror 的 undo，不是全局 store 撤销），
 * 这里只让它**跨挂载**：卸载时把这一行的历史读成一串文档快照（从最早到当前，按 history 自己的分组），
 * 按镜头 id 存在表级的一张表里；同一镜再挂上时，在新编辑器里把这串快照按顺序重放成历史条目
 * （第一份不进历史，其后每份一个独立分组，重放完再封一次口，之后的新编辑另起一组），于是 Ctrl+Z 一步一步退回去，与从未卸载时一样。
 *
 * 只存历史、不钉住行：挂载数仍只随视口。重做（Ctrl+Shift+Z）不跨卸载。
 */

/** 与 TipTap StarterKit 的 history 默认深度一致。 */
const HISTORY_DEPTH = 100

/** 这一份编辑器状态的撤销历史，展开成文档快照：[最早, …, 当前]。没有可撤销的就只有当前一份。 */
export function historySnapshots(state: EditorState, depth = HISTORY_DEPTH): JSONContent[] {
  const docs: ProseMirrorNode[] = [state.doc]
  let current = state
  for (let step = 0; step < depth; step += 1) {
    let previous: EditorState | null = null
    const undone = undo(current, (tr) => { previous = current.apply(tr) })
    if (!undone || !previous) break
    current = previous
    docs.unshift(current.doc)
  }
  return docs.map((doc) => doc.toJSON() as JSONContent)
}

/**
 * 把快照重放进一份刚挂上的编辑器：第一份直接替换文档、不进历史，其后每份一个独立的历史分组。
 * 刚挂上的文档（来自方案里的提示词）与最后一份快照说的不是同一句时（卸载期间被别处改过，例如 Agent 写入），
 * 把它补成最后一步——与编辑器一直挂着时「外部写入也是一步撤销」一致。
 * 返回是否重放了任何历史。`dispatch` 在生产里是编辑器的 view，在测试里是 state.apply。
 */
export function replayHistory(
  getState: () => EditorState,
  dispatch: (tr: Transaction) => void,
  snapshots: readonly JSONContent[],
): boolean {
  const state = getState()
  const mountedDoc = state.doc
  const docs = snapshots.map((json) => state.schema.nodeFromJSON(json))
  const mountedPrompt = contentToPrompt(mountedDoc.toJSON() as JSONContent)
  if (docs.length && contentToPrompt(docs[docs.length - 1].toJSON() as JSONContent) !== mountedPrompt) docs.push(mountedDoc)
  if (docs.length < 2) return false
  const replace = (doc: ProseMirrorNode): Transaction => {
    const current = getState()
    // preventUpdate：TipTap 不发 update 事件——这是把历史接回来，不是用户又改了一次，不许回写方案。
    return current.tr.replaceWith(0, current.doc.content.size, doc.content).setMeta('preventUpdate', true)
  }
  dispatch(replace(docs[0]).setMeta('addToHistory', false))
  for (const doc of docs.slice(1)) dispatch(closeHistory(replace(doc)))
  // 组边界（V-1210 复验 R2-2）：重放完立刻封口。不封的话，用户重挂后马上打的字与最后一份快照时间紧挨、位置相邻，
  // 会被 history 合进同一组，一次 Ctrl+Z 连旧编辑一起撤掉。
  dispatch(closeHistory(getState().tr).setMeta('preventUpdate', true))
  return true
}

/** 表级的一张历史表：镜头 id → 卸载时留下的快照。生命周期 = 这张表（与编辑器从不卸载时的历史同寿）。 */
export const StoryboardPromptHistoryContext = React.createContext<Map<string, JSONContent[]> | null>(null)

/**
 * 行里用：返回一个 `onReady` 处理器（编辑器挂上时接回这一镜的历史），并在行卸载时把历史存回表里。
 * 处理器可以被反复调用（PromptEditor 每次渲染都会再报一次就绪）：接回一次后表里就没有这一镜了，后续调用不动。
 */
export function usePromptHistoryCarry(shotKey: string): (editor: Editor) => void {
  const store = React.useContext(StoryboardPromptHistoryContext)
  const editorRef = React.useRef<Editor | null>(null)
  React.useEffect(() => () => {
    const editor = editorRef.current
    if (!store || !editor) return
    const snapshots = historySnapshots(editor.state)
    if (snapshots.length > 1) store.set(shotKey, snapshots)
    else store.delete(shotKey)
  }, [store, shotKey])
  return React.useCallback((editor: Editor) => {
    if (editorRef.current === editor) return
    editorRef.current = editor
    const snapshots = store?.get(shotKey)
    if (!snapshots || editor.isDestroyed) return
    store?.delete(shotKey)
    replayHistory(() => editor.state, (tr) => editor.view.dispatch(tr), snapshots)
  }, [store, shotKey])
}
