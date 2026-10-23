import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBlockquote,
  IconBold,
  IconCode,
  IconH1,
  IconH2,
  IconH3,
  IconHighlight,
  IconItalic,
  IconLink,
  IconList,
  IconListCheck,
  IconListNumbers,
  IconSeparatorHorizontal,
  IconStrikethrough,
  IconTable,
} from '@tabler/icons-react'
import { useEditorState, type Editor } from '@tiptap/react'
import { isEditorReady } from './useNomiRichTextEditor'

/**
 * Toolbar action definitions for the shared rich-text kernel. 一份定义，三个壳：创作区顶栏、创作区选区浮条、
 * 画布文本节点的格式浮条——都经 useRichTextActions 取，不许再抄一份按钮清单。
 *
 * 画布文字节点没挂表格 / 待办 / 高亮 / 链接：`requires` 按编辑器 schema 过滤，没启用的特性不出按钮。
 *
 * 按下态 / 可用态必须**订阅编辑器事务**：编辑器为了 React 19 的选区稳定关掉了 shouldRerenderOnTransaction
 * （useNomiRichTextEditor），于是「渲染时读一次 isActive」只在壳碰巧重渲时才刷新——光标挪进粗体、
 * 空选区按一下「代码」（只改存储标记、不改文档），按钮都不动，看起来就是「点了没反应」（2026-10-23 用户实测）。
 */
export type RichTextAction = {
  id: string
  label: string
  icon: JSX.Element
  active?: boolean
  disabled?: boolean
  onClick: () => void
}

type RichTextActionDefinition = {
  id: string
  labelKey: string
  icon: JSX.Element
  isActive?: (editor: Editor) => boolean
  isDisabled?: (editor: Editor) => boolean
  requires?: (editor: Editor) => boolean
  run: (editor: Editor) => void
}

const DEFINITIONS: readonly RichTextActionDefinition[] = [
  { id: 'bold', labelKey: 'creationAi.selection.bold', icon: <IconBold size={15} />, isActive: (editor) => editor.isActive('bold'), run: (editor) => editor.chain().focus().toggleBold().run() },
  { id: 'italic', labelKey: 'creationAi.selection.italic', icon: <IconItalic size={15} />, isActive: (editor) => editor.isActive('italic'), run: (editor) => editor.chain().focus().toggleItalic().run() },
  { id: 'strike', labelKey: 'creationAi.selection.strike', icon: <IconStrikethrough size={15} />, isActive: (editor) => editor.isActive('strike'), run: (editor) => editor.chain().focus().toggleStrike().run() },
  { id: 'code', labelKey: 'creationAi.selection.code', icon: <IconCode size={15} />, isActive: (editor) => editor.isActive('code'), run: (editor) => editor.chain().focus().toggleCode().run() },
  { id: 'highlight', labelKey: 'creationAi.selection.highlight', icon: <IconHighlight size={15} />, isActive: (editor) => editor.isActive('highlight'), requires: (editor) => Boolean(editor.schema.marks.highlight), run: (editor) => editor.chain().focus().toggleHighlight().run() },
  { id: 'h1', labelKey: 'creationAi.selection.heading1', icon: <IconH1 size={16} />, isActive: (editor) => editor.isActive('heading', { level: 1 }), run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run() },
  { id: 'h2', labelKey: 'creationAi.selection.heading2', icon: <IconH2 size={16} />, isActive: (editor) => editor.isActive('heading', { level: 2 }), run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: 'h3', labelKey: 'creationAi.selection.heading3', icon: <IconH3 size={16} />, isActive: (editor) => editor.isActive('heading', { level: 3 }), run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run() },
  { id: 'blockquote', labelKey: 'creationAi.selection.blockquote', icon: <IconBlockquote size={15} />, isActive: (editor) => editor.isActive('blockquote'), run: (editor) => editor.chain().focus().toggleBlockquote().run() },
  { id: 'horizontal-rule', labelKey: 'creationAi.selection.horizontalRule', icon: <IconSeparatorHorizontal size={15} />, run: (editor) => editor.chain().focus().setHorizontalRule().run() },
  { id: 'bullet-list', labelKey: 'creationAi.selection.bulletList', icon: <IconList size={15} />, isActive: (editor) => editor.isActive('bulletList'), run: (editor) => editor.chain().focus().toggleBulletList().run() },
  { id: 'ordered-list', labelKey: 'creationAi.selection.orderedList', icon: <IconListNumbers size={15} />, isActive: (editor) => editor.isActive('orderedList'), run: (editor) => editor.chain().focus().toggleOrderedList().run() },
  { id: 'task-list', labelKey: 'creationAi.selection.taskList', icon: <IconListCheck size={15} />, isActive: (editor) => editor.isActive('taskList'), requires: (editor) => Boolean(editor.schema.nodes.taskList), run: (editor) => editor.chain().focus().toggleTaskList().run() },
  { id: 'table', labelKey: 'creationAi.selection.insertTable', icon: <IconTable size={15} />, requires: (editor) => Boolean(editor.schema.nodes.table), run: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: 'link', labelKey: 'creationAi.selection.link', icon: <IconLink size={15} />, isActive: (editor) => editor.isActive('link'), requires: (editor) => Boolean(editor.schema.marks.link), run: (editor) => editor.chain().focus().setLink({ href: 'https://' }).run() },
  { id: 'undo', labelKey: 'creationAi.selection.undo', icon: <IconArrowBackUp size={15} />, isDisabled: (editor) => !editor.can().undo(), run: (editor) => editor.chain().focus().undo().run() },
  { id: 'redo', labelKey: 'creationAi.selection.redo', icon: <IconArrowForwardUp size={15} />, isDisabled: (editor) => !editor.can().redo(), run: (editor) => editor.chain().focus().redo().run() },
]

/** 全部按钮 id（壳按这个挑子集、排分组）。 */
export const RICH_TEXT_ACTION_IDS: readonly string[] = DEFINITIONS.map((definition) => definition.id)

const NO_STATES: Array<[string, boolean, boolean]> = []

/** 每个可用按钮此刻的按下 / 禁用态。只放布尔，供 useEditorState 做深比较——没变就不重渲。 */
function readActionStates(editor: Editor | null, ids: readonly string[] | undefined): Array<[string, boolean, boolean]> {
  if (!isEditorReady(editor)) return []
  return DEFINITIONS
    .filter((definition) => (!ids || ids.includes(definition.id)) && (!definition.requires || definition.requires(editor)))
    .map((definition) => [definition.id, Boolean(definition.isActive?.(editor)), Boolean(definition.isDisabled?.(editor))])
}

/**
 * 取格式按钮：订阅编辑器事务，按下 / 禁用态一变就重渲，没变不重渲。
 * `ids` 给了就只取这几颗（按定义顺序）；不给取全部。传进来的数组请保持引用稳定（模块常量）。
 */
export function useRichTextActions(editor: Editor | null, ids?: readonly string[]): RichTextAction[] {
  const { t } = useTranslation()
  // 读闭包里的 editor，不读快照里的：编辑器实例被换掉（placeholder 变了会重建）后，快照要等新实例第一次事务才换，
  // 期间读到的是已销毁的旧实例，整排钮会消失（独立验收 L-acc-sonnet-20261023 发现 2）。selector 每次渲染都是新函数，换实例那次渲染就按新实例重算。
  const states = useEditorState({ editor, selector: () => readActionStates(editor, ids) }) ?? NO_STATES
  return React.useMemo(() => {
    if (!isEditorReady(editor)) return []
    const byId = new Map(DEFINITIONS.map((definition) => [definition.id, definition]))
    return states.flatMap(([id, active, disabled]) => {
      const definition = byId.get(id)
      if (!definition) return []
      // 只有开关类（加粗 / 列表…）有按下态；撤销、插入表格这类一次性动作不带 active，按钮也就不报 aria-pressed。
      return [{ id, label: t(definition.labelKey), icon: definition.icon, active: definition.isActive ? active : undefined, disabled, onClick: () => definition.run(editor) }]
    })
  }, [editor, states, t])
}
