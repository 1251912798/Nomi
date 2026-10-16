/**
 * [INPUT]: 依赖 ./model/directorStore 的 DirectorStore、./model/directorTypes、../../agent/embeddedEditorFlush 的 registerEmbeddedEditorFlush
 * [OUTPUT]: 对外提供 createDirectorEditorPersistence、DIRECTOR_AUTOSAVE_IDLE_MS：编辑器 store ↔ 画布节点 meta 的全部写回规矩
 * [POS]: 导演编辑器「谁把工程写回节点」的唯一 owner（3D-BOX 方案 §3「导演工程的唯一写者」/ §7 第 2 条「一个写者、一本历史」）。
 *        编辑器开着时 store 是唯一写者，节点 meta 是它的持久化：
 *        ① 自己写出去的每一份都记住（`persist`），节点 meta 回来的还是它 → 不是外部改动；
 *        ② 节点 meta 换成了别的（Agent 撤销 / 画布 ⌘Z 的补偿把整份 meta 放回去）→ 编辑器当场重载那一份（`adoptNodeProject`），
 *           不留旧画面，自动保存与退出保存都不会把旧工程写回去盖掉撤销；
 *        ③ 改动后空闲 2 秒落盘一次（崩溃保护），没有未落盘改动就什么都不写（多写一遍会在画布历史里多一条、挡住撤销）；
 *        ④ 提议事务 / Agent 撤销开始前先把没落盘的改动落盘（`start` 里登记 embeddedEditorFlush），撤销基线里有它们。
 *        **不看界面模式**：导演 / 精修切换只切界面，写回规矩一条都不变
 *        （方向检查 docs/plan/2026-10-16-director-editor-persistence-direction-check.md）。纯逻辑、零 React，DirectorEditor 只做接线。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { registerEmbeddedEditorFlush } from '../../agent/embeddedEditorFlush'
import type { DirectorStore } from './model/directorStore'
import type { DirectorProject } from './model/directorTypes'

/** 改动后空闲多久自动落盘一次（毫秒）。 */
export const DIRECTOR_AUTOSAVE_IDLE_MS = 2000

export type DirectorEditorPersistence = Readonly<{
  /** 编辑器自己的一次落盘（自动保存 / 退出 / 外部写口回写）：记下写出去的对象与当时 store 的工程。 */
  persist: (project: DirectorProject) => void
  /** store 里有没有还没落盘的改动。 */
  isDirty: () => boolean
  /** 有没落盘的改动就立刻落盘；没有就什么都不写（退出、撤销前都走它）。 */
  saveNow: () => void
  /** 节点 meta 上的工程变了：是自己写的 → 忽略；是外部写的 → 重载进 store，返回 true。 */
  adoptNodeProject: (raw: unknown) => boolean
  /** 开始空闲自动保存，并登记「事务 / 撤销前先落盘」；返回停止函数（只读编辑器不调）。 */
  start: () => () => void
}>

export function createDirectorEditorPersistence(input: Readonly<{
  store: DirectorStore
  defaultSceneName: string
  initialRaw: unknown
  write: (project: DirectorProject) => void
}>): DirectorEditorPersistence {
  let lastWritten: unknown = input.initialRaw
  let savedProject = input.store.getState().project
  const persist = (project: DirectorProject) => {
    lastWritten = project
    savedProject = input.store.getState().project
    input.write(project)
  }
  const isDirty = () => input.store.getState().project !== savedProject
  const saveNow = () => {
    if (isDirty()) persist(input.store.getState().exportProject())
  }
  return {
    persist,
    isDirty,
    saveNow,
    adoptNodeProject: (raw) => {
      if (raw === lastWritten) return false
      input.store.getState().loadProject(raw, input.defaultSceneName, { keepView: true })
      lastWritten = raw
      savedProject = input.store.getState().project
      return true
    },
    start: () => {
      let timer: ReturnType<typeof setTimeout> | null = null
      let lastProject = input.store.getState().project
      const unsubscribe = input.store.subscribe((state) => {
        if (state.project === lastProject) return
        lastProject = state.project
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          saveNow()
        }, DIRECTOR_AUTOSAVE_IDLE_MS)
      })
      const unflush = registerEmbeddedEditorFlush(saveNow)
      return () => {
        unflush()
        unsubscribe()
        if (timer !== null) clearTimeout(timer)
      }
    },
  }
}
