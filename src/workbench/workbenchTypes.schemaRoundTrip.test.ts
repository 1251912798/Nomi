import { describe, expect, it } from 'vitest'
import { getSchema, type AnyExtension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { RICH_TEXT_FEATURE_EXTENSIONS } from './common/useNomiRichTextEditor'
import { normalizeWorkbenchContentJson } from './workbenchTypes'

// 文稿「保存即归一化」的合同：编辑器 schema 里有的每一种行内标记 / 块节点，经 normalizeWorkbenchContentJson
// （所有读盘、写盘、store 入口都过它）之后必须原样活下来，带着它的属性。
// 2026-10-11 真机性能专项发现：工具条点「链接」后 DOM 有 <a>，落盘的文稿里没有——归一化的 mark 白名单
// 是手写的一份，漏了编辑器 schema 里的 link / underline。白名单与 schema 是两份事实，所以这里让 schema 当考官：
// 新接一个扩展而没教会归一化，这条测试红，而不是等用户重开文稿才发现内容没了。
// 矩阵测试：遍历下面按 schema 清单登记的全部 mark / node 样例，逐个往返。
const REAL_EDITOR_EXTENSIONS: AnyExtension[] = [StarterKit, ...RICH_TEXT_FEATURE_EXTENSIONS]
const schema = getSchema(REAL_EDITOR_EXTENSIONS)

const text = (value: string, marks?: Array<Record<string, unknown>>) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) })
const para = (...content: Array<Record<string, unknown>>) => ({ type: 'paragraph', content })
const doc = (...content: Array<Record<string, unknown>>) => ({ type: 'doc', content })

/** 每个 mark 一个样例：含它的非默认属性，保存后一个字都不能少。 */
const MARK_SAMPLES: Record<string, Record<string, unknown>> = {
  bold: { type: 'bold' },
  italic: { type: 'italic' },
  strike: { type: 'strike' },
  code: { type: 'code' },
  underline: { type: 'underline' },
  highlight: { type: 'highlight' },
  link: { type: 'link', attrs: { href: 'https://example.com/a?b=1', target: '_blank', rel: 'noopener noreferrer nofollow', class: null } },
}

/** 每个块 / 容器节点一个样例（text、doc 由其它样例带上）。 */
const cell = (type: 'tableCell' | 'tableHeader', value: string, attrs: Record<string, unknown>) => ({
  type, attrs, content: [para(text(value))],
})
const NODE_SAMPLES: Record<string, Record<string, unknown>> = {
  paragraph: para(text('段落')),
  heading: { type: 'heading', attrs: { level: 3 }, content: [text('标题')] },
  blockquote: { type: 'blockquote', content: [para(text('引用'))] },
  bulletList: { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('项'))] }] },
  orderedList: { type: 'orderedList', attrs: { start: 3, type: null }, content: [{ type: 'listItem', content: [para(text('项'))] }] },
  listItem: { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('项'))] }] },
  taskList: { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [para(text('待办'))] }] },
  taskItem: { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [para(text('待办'))] }] },
  codeBlock: { type: 'codeBlock', attrs: { language: 'typescript' }, content: [text('const a = 1')] },
  horizontalRule: { type: 'horizontalRule' },
  hardBreak: para(text('上'), { type: 'hardBreak' }, text('下')),
  table: {
    type: 'table',
    content: [
      { type: 'tableRow', content: [cell('tableHeader', '头', { colspan: 2, rowspan: 1, colwidth: [120, 80] })] },
      { type: 'tableRow', content: [cell('tableCell', '格', { colspan: 1, rowspan: 2, colwidth: null })] },
    ],
  },
  tableRow: {
    type: 'table',
    content: [{ type: 'tableRow', content: [cell('tableCell', '格', { colspan: 1, rowspan: 1, colwidth: null })] }],
  },
  tableCell: {
    type: 'table',
    content: [{ type: 'tableRow', content: [cell('tableCell', '格', { colspan: 1, rowspan: 1, colwidth: null })] }],
  },
  tableHeader: {
    type: 'table',
    content: [{ type: 'tableRow', content: [cell('tableHeader', '头', { colspan: 1, rowspan: 1, colwidth: null })] }],
  },
}

/** 把样例文档按 schema 解析再序列化：编辑器真正会吐出来的形状（补齐默认属性），拿它当「保存前」。 */
const editorShape = (value: Record<string, unknown>) => schema.nodeFromJSON(value).toJSON()

describe('编辑器 schema ↔ 文稿归一化：每种格式保存后都在', () => {
  it('样例表覆盖了 schema 里的每一种 mark 和 node（新扩展必须补样例）', () => {
    expect(Object.keys(MARK_SAMPLES).sort()).toEqual(Object.keys(schema.marks).sort())
    const covered = new Set([...Object.keys(NODE_SAMPLES), 'doc', 'text'])
    expect(Object.keys(schema.nodes).filter((name) => !covered.has(name))).toEqual([])
  })

  for (const [name, mark] of Object.entries(MARK_SAMPLES)) {
    it(`mark·${name}：归一化后原样保留（含属性）`, () => {
      const before = editorShape(doc(para(text('前'), text('被标记', [mark]), text('后'))))
      expect(normalizeWorkbenchContentJson(before)).toEqual(before)
    })
  }

  for (const [name, node] of Object.entries(NODE_SAMPLES)) {
    it(`node·${name}：归一化后原样保留（含属性）`, () => {
      const before = editorShape(doc(node))
      expect(normalizeWorkbenchContentJson(before)).toEqual(before)
    })
  }
})
