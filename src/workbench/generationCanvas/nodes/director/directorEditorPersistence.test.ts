/**
 * 导演编辑器「谁把工程写回节点」的规矩不分界面（S2，方向检查 docs/plan/2026-10-16-director-editor-persistence-direction-check.md）。
 *
 * 用户 10-16 拍板 3D-BOX 是唯一的导演台（导演 / 精修两面）。哪一面开着，写回规矩都一样：Agent 的写入、撤销进来以后，2 秒一次的自动保存和退出保存都不许把旧工程写回去。
 * 走真实边界：真编辑器 store（createDirectorStore）、真外部写口（writeExternalDirectorProject）、真撤销前落盘登记
 * （flushEmbeddedEditors），只有计时器是假的。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushEmbeddedEditors } from '../../agent/embeddedEditorFlush'
import { registerDirectorSession, writeExternalDirectorProject } from './directorSessionRegistry'
import { createDirectorEditorPersistence, DIRECTOR_AUTOSAVE_IDLE_MS } from './directorEditorPersistence'
import { CAMERA_PRESETS, buildCameraFromPreset } from './model/cameraPresets'
import { createDefaultProject } from './model/directorProject'
import { createDirectorStore } from './model/directorStore'
import type { DirectorProject } from './model/directorTypes'

const NODE = 'node-director-1'

function openEditor() {
  const initialRaw = createDefaultProject('scene')
  const store = createDirectorStore({ rawProject: initialRaw, defaultSceneName: 'scene' })
  const written: DirectorProject[] = []
  const persistence = createDirectorEditorPersistence({ store, defaultSceneName: 'scene', initialRaw, write: (project) => written.push(project) })
  const stop = persistence.start()
  // 编辑器里 EditorBody 登记的那一份：外部写口进来后立刻经同一个 persist 落盘
  const unregister = registerDirectorSession(NODE, { store, defaultSceneName: 'scene', onExternalProjectChange: persistence.persist })
  return { store, written, persistence, close: () => { stop(); unregister() } }
}

/** 一次手改：加一台机位（任何改工程的动作都一样）。 */
let cameraSeq = 0
const handEdit = (store: ReturnType<typeof createDirectorStore>) => {
  cameraSeq += 1
  store.getState().addCamera(buildCameraFromPreset({ preset: CAMERA_PRESETS[1], id: `cam-${cameraSeq}`, name: `机位 ${cameraSeq}` }))
}
const cameraCount = (project: DirectorProject) => project.scenes.reduce((sum, scene) => sum + scene.cameras.length, 0)
/** Agent 那边编出来的一份工程：三台机位（和编辑器里的手改可区分）。 */
function agentRevision(): DirectorProject {
  const scratch = createDirectorStore({ rawProject: createDefaultProject('scene'), defaultSceneName: 'scene' })
  for (let i = 0; i < 3; i += 1) handEdit(scratch)
  return scratch.getState().exportProject()
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('director editor persistence is one rule for every layout', () => {
  it('an Agent write that lands while the editor is open is persisted once and never overwritten by the idle save', () => {
    const editor = openEditor()
    handEdit(editor.store)
    expect(writeExternalDirectorProject(NODE, agentRevision())).toBe(true)
    expect(cameraCount(editor.written.at(-1)!)).toBe(3)
    const before = editor.written.length
    vi.advanceTimersByTime(DIRECTOR_AUTOSAVE_IDLE_MS * 2)
    expect(editor.written).toHaveLength(before)
    editor.close()
  })

  it('an undo from outside (node meta replaced) reloads the editor, and neither the idle save nor exit writes the old project back', () => {
    const editor = openEditor()
    handEdit(editor.store)
    vi.advanceTimersByTime(DIRECTOR_AUTOSAVE_IDLE_MS)
    const withCamera = editor.written.at(-1)!
    expect(cameraCount(withCamera)).toBe(1)
    // 画布 ⌘Z / Agent 撤销：补偿把节点 meta 放回打开时的那份
    const undone = createDefaultProject('scene')
    expect(editor.persistence.adoptNodeProject(undone)).toBe(true)
    expect(cameraCount(editor.store.getState().project)).toBe(0)
    const before = editor.written.length
    vi.advanceTimersByTime(DIRECTOR_AUTOSAVE_IDLE_MS * 2)
    editor.persistence.saveNow()
    expect(editor.written).toHaveLength(before)
    editor.close()
  })

  it('its own write coming back from the node is not treated as an outside change', () => {
    const editor = openEditor()
    handEdit(editor.store)
    vi.advanceTimersByTime(DIRECTOR_AUTOSAVE_IDLE_MS)
    expect(editor.persistence.adoptNodeProject(editor.written.at(-1))).toBe(false)
    editor.close()
  })

  it('hand edits are saved after the idle window, and flushed before a proposal or an undo starts', () => {
    const editor = openEditor()
    handEdit(editor.store)
    expect(editor.written).toHaveLength(0)
    flushEmbeddedEditors()
    expect(editor.written).toHaveLength(1)
    vi.advanceTimersByTime(DIRECTOR_AUTOSAVE_IDLE_MS * 2)
    expect(editor.written).toHaveLength(1)
    handEdit(editor.store)
    vi.advanceTimersByTime(DIRECTOR_AUTOSAVE_IDLE_MS)
    expect(editor.written).toHaveLength(2)
    editor.close()
  })

  it('opening and closing without a change writes nothing (a read-time migration is not written back)', () => {
    const editor = openEditor()
    editor.persistence.saveNow()
    vi.advanceTimersByTime(DIRECTOR_AUTOSAVE_IDLE_MS * 2)
    expect(editor.written).toHaveLength(0)
    editor.close()
  })

  it('the editor wires persistence without consulting the 3D-BOX flag or the layout (a switch-back entry cannot turn it off)', () => {
    const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'DirectorEditor.tsx'), 'utf8')
    const wiring = source.split('\n').filter((line) => line.includes('createDirectorEditorPersistence('))
    expect(wiring).toHaveLength(1)
    expect(wiring[0]).not.toMatch(/director3dBox|viewMode|legacy/i)
    // 写回规矩只有一个家：编辑器不再自己建同步账、不再自己排自动保存
    expect(source).not.toMatch(/createDirectorNodeSync|AUTOSAVE_IDLE_MS\s*=/)
  })
})
