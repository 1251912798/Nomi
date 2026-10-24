import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { EditorState, type Transaction } from '@tiptap/pm/state'
import { closeHistory, history, undo, undoDepth } from '@tiptap/pm/history'
import { historySnapshots, replayHistory } from './promptHistoryCarry'

/**
 * 编辑器撤销历史跨卸载（V-1210 首轮阻断的复现形状）：改一镜 → 这一行卸载（编辑器销毁）→ 再挂上一个**新的**编辑器
 * → Ctrl+Z 必须回到原文。这里不用 DOM：ProseMirror 的历史本身就是 EditorState 上的插件状态，
 * 用与生产同一份 StarterKit schema 建两份互不相干的 state（旧编辑器 / 新编辑器）。
 */
const schema = getSchema([StarterKit])
const docOf = (text: string) => schema.node('doc', null, [schema.node('paragraph', null, text ? [schema.text(text)] : [])])
const stateOf = (text: string) => EditorState.create({ schema, doc: docOf(text), plugins: [history()] })
const textOf = (state: EditorState) => state.doc.textContent

function edit(state: EditorState, text: string): EditorState {
  return state.apply(closeHistory(state.tr.replaceWith(0, state.doc.content.size, docOf(text).content)))
}
function undoOnce(state: EditorState): EditorState {
  let next = state
  undo(state, (tr) => { next = state.apply(tr) })
  return next
}
/** 「新挂上的编辑器」：从方案里的提示词新建，历史是空的；再把旧编辑器卸载时留下的快照接回来。 */
function remount(mountedText: string, snapshots: ReturnType<typeof historySnapshots>): { state: EditorState; dispatched: Transaction[] } {
  let state = stateOf(mountedText)
  const dispatched: Transaction[] = []
  replayHistory(() => state, (tr) => { dispatched.push(tr); state = state.apply(tr) }, snapshots)
  return { state, dispatched }
}

describe('编辑器撤销历史跨卸载', () => {
  it('复现形状：改了 → 卸载 → 新编辑器挂上 → Ctrl+Z 回到原文', () => {
    const before = stateOf('镜头 3：人物穿过雨夜的街道')
    const edited = edit(before, 'V1210 undo boundary')
    // 没接历史的新编辑器：撤销无效（这就是首轮红的那一条）
    expect(textOf(undoOnce(stateOf('V1210 undo boundary')))).toBe('V1210 undo boundary')
    const { state } = remount('V1210 undo boundary', historySnapshots(edited))
    expect(textOf(state)).toBe('V1210 undo boundary')
    expect(textOf(undoOnce(state))).toBe('镜头 3：人物穿过雨夜的街道')
  })

  it('几步编辑按原来的分组一步一步退回去', () => {
    const edited = edit(edit(edit(stateOf('原文'), '第一改'), '第二改'), '第三改')
    const { state } = remount('第三改', historySnapshots(edited))
    expect(undoDepth(state)).toBe(3)
    const steps: string[] = []
    let current = state
    for (let i = 0; i < 3; i += 1) { current = undoOnce(current); steps.push(textOf(current)) }
    expect(steps).toEqual(['第二改', '第一改', '原文'])
  })

  it('重挂后马上接着改（V-1210 复验 R2-2）：新编辑另起一组，第一次撤销只撤新编辑', () => {
    const edited = edit(stateOf('原文'), '第一改')
    const { state } = remount('第一改', historySnapshots(edited))
    // 用户在重挂后立刻打字：不带 closeHistory，时间紧挨着重放——和真人点进去就打字一样
    const typed = state.apply(state.tr.insertText(' 续写', state.doc.content.size - 1))
    expect(textOf(typed)).toBe('第一改 续写')
    const once = undoOnce(typed)
    expect(textOf(once)).toBe('第一改')
    expect(textOf(undoOnce(once))).toBe('原文')
  })

  it('卸载期间被别处改过（例如 Agent 写入）：外部那一笔也是一步撤销，再往前才是用户自己的', () => {
    const edited = edit(stateOf('原文'), '用户改的')
    const { state } = remount('Agent 写的', historySnapshots(edited))
    expect(textOf(state)).toBe('Agent 写的')
    const once = undoOnce(state)
    expect(textOf(once)).toBe('用户改的')
    expect(textOf(undoOnce(once))).toBe('原文')
  })

  it('接回历史不算用户又改了一次：每一笔都带 preventUpdate（不回写方案）', () => {
    const { dispatched } = remount('改后', historySnapshots(edit(stateOf('原文'), '改后')))
    expect(dispatched.length).toBeGreaterThan(0)
    expect(dispatched.every((tr) => tr.getMeta('preventUpdate') === true)).toBe(true)
    expect(dispatched[dispatched.length - 1].steps).toHaveLength(0)
  })

  it('没有可撤销的历史：什么都不重放', () => {
    const snapshots = historySnapshots(stateOf('原文'))
    expect(snapshots).toHaveLength(1)
    expect(remount('原文', snapshots).dispatched).toHaveLength(0)
  })
})
