import type { Editor } from '@tiptap/react'
import type { Transaction } from '@tiptap/pm/state'
import { logRendererError } from '../../desktop/rendererLog'

/** Track the insertion point through edits while the original asset is imported. */
export function insertAssetMentionWhenReady(editor: Editor, selection: Promise<{ url: string; index: number; onSettled?: () => void } | null>, kind: 'image' | 'video' | 'audio' = 'image'): void {
  let bookmark = editor.state.selection.getBookmark()
  const map = ({ transaction }: { transaction: Transaction }) => { bookmark = bookmark.map(transaction.mapping) }
  editor.on('transaction', map)
  void selection.then(placed => {
    try {
      if (!placed || editor.isDestroyed) return
      const at = bookmark.resolve(editor.state.doc).from
      editor.commands.insertContentAt(at, { type:'assetMention', attrs:{ url:placed.url, index:placed.index, kind } }, { updateSelection:editor.state.selection.from === at })
    } finally { placed?.onSettled?.() }
  }).catch(error => { logRendererError('media-reference-insertion-failed', error) }).finally(() => { editor.off('transaction', map) })
}
