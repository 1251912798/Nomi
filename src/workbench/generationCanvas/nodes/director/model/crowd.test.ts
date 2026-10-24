import { describe, expect, it } from 'vitest'
import { ACTION_ALIASES, ACTION_LIBRARY, findActionEntry, resolveActionAlias, T_POSE_ACTION_ID } from './actionLibrary'
import { CHARACTER_MODEL_BY_GENDER, DEFAULT_CROWD_ACTION_ID, defaultCharacterInput } from './defaultCharacter'
import { createDirectorStore } from './directorStore'
import type { CrowdSpec } from './storeEntityActions'

const IDENTITY = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }

function spec(patch: Partial<CrowdSpec> = {}): CrowdSpec {
  return { transform: IDENTITY, rows: 2, cols: 3, spacing: 2, actionId: DEFAULT_CROWD_ACTION_ID, groupName: 'Crowd group', memberName: 'Extra', ...patch }
}

function membersOf(store: ReturnType<typeof createDirectorStore>, groupId: string) {
  return store.getState().activeScene().objects.filter((item) => item.parentId === groupId)
}

describe('crowd = one group built from the default character (same template as add-character)', () => {
  it('builds one group with rows x cols members and nothing else, no source character needed', () => {
    const store = createDirectorStore({ defaultSceneName: 'S1' })
    const groupId = store.getState().batchCreateCrowd(spec())!
    const objects = store.getState().activeScene().objects
    expect(objects).toHaveLength(1 + 6)
    expect(store.getState().findObject(groupId)).toMatchObject({ type: 'group', name: 'Crowd group' })
    expect(store.getState().selection.objectId).toBe(groupId)
    expect(membersOf(store, groupId).map((item) => item.name)).toEqual(['Extra 1', 'Extra 2', 'Extra 3', 'Extra 4', 'Extra 5', 'Extra 6'])
  })

  it('members use the exact model and rig that add-character uses', () => {
    const store = createDirectorStore({ defaultSceneName: 'S1' })
    const groupId = store.getState().batchCreateCrowd(spec())!
    for (const member of membersOf(store, groupId)) {
      expect(member).toMatchObject({ type: 'character', modelPath: CHARACTER_MODEL_BY_GENDER.female.modelPath, rig: CHARACTER_MODEL_BY_GENDER.female.rig, isSystemModel: true })
    }
  })

  it('lays members on a rows x cols grid centred on the group origin with the given spacing', () => {
    const store = createDirectorStore({ defaultSceneName: 'S1' })
    const groupId = store.getState().batchCreateCrowd(spec({ rows: 2, cols: 3, spacing: 2 }))!
    const positions = membersOf(store, groupId).map((item) => item.position)
    expect(positions.map((p) => p.x)).toEqual([-2, 0, 2, -2, 0, 2])
    expect(positions.map((p) => p.z)).toEqual([-1, -1, -1, 1, 1, 1])
    expect(positions.every((p) => p.y === 0)).toBe(true)
  })

  it('puts the group at the placed transform (position + facing); members stay in its local frame', () => {
    const store = createDirectorStore({ defaultSceneName: 'S1' })
    const transform = { position: { x: 5, y: 0, z: -3 }, rotation: { x: 0, y: 90, z: 0 }, scale: { x: 1, y: 1, z: 1 } }
    const groupId = store.getState().batchCreateCrowd(spec({ transform, rows: 1, cols: 1 }))!
    expect(store.getState().findObject(groupId)).toMatchObject({ position: transform.position, rotation: transform.rotation })
    expect(membersOf(store, groupId)[0].position).toEqual({ x: 0, y: 0, z: 0 })
  })

  // 2026-10-24 走查 ①：群众默认动作曾是别名 standing_idle，原样写进 posePreset；姿态采样只认动作库正名，查不到就退回
  // 绑定姿态——放下的群众站成 T 字。posePreset 只存正名，在加人 / 群众共用的写入口 defaultCharacterInput 解析一次。
  it('default action is the library standing idle by its canonical id; a chosen action lands on every member as its canonical id', () => {
    const store = createDirectorStore({ defaultSceneName: 'S1' })
    expect(DEFAULT_CROWD_ACTION_ID).toBe('Idle_Loop')
    expect(findActionEntry(DEFAULT_CROWD_ACTION_ID)!.id).toBe(DEFAULT_CROWD_ACTION_ID)
    const first = store.getState().batchCreateCrowd(spec())!
    expect(new Set(membersOf(store, first).map((item) => item.posePreset))).toEqual(new Set(['Idle_Loop']))
    const second = store.getState().batchCreateCrowd(spec({ actionId: 'running' }))!
    expect(new Set(membersOf(store, second).map((item) => item.posePreset))).toEqual(new Set(['Jog_Fwd_Loop']))
  })

  it.each(Object.keys(ACTION_ALIASES))('the crowd door stores alias %s as its canonical library id', (alias) => {
    const store = createDirectorStore({ defaultSceneName: 'S1' })
    const groupId = store.getState().batchCreateCrowd(spec({ actionId: alias, rows: 1, cols: 1 }))!
    const canonical = resolveActionAlias(alias)!.id
    expect(ACTION_LIBRARY.some((entry) => entry.id === canonical)).toBe(true)
    expect(membersOf(store, groupId)[0].posePreset).toBe(canonical)
  })

  it('the add-character door keeps T-Pose by default and also stores canonical ids; an unknown id cannot be written', () => {
    expect(defaultCharacterInput('male', 'P', IDENTITY).posePreset).toBe(T_POSE_ACTION_ID)
    expect(defaultCharacterInput('male', 'P', IDENTITY, 'standing').posePreset).toBe('Idle_Loop')
    expect(defaultCharacterInput('female', 'P', IDENTITY, 'Walk_Loop').posePreset).toBe('Walk_Loop')
    expect(() => defaultCharacterInput('female', 'P', IDENTITY, 'no_such_action')).toThrow()
  })

  it('refuses an unknown action and clamps absurd sizes', () => {
    const store = createDirectorStore({ defaultSceneName: 'S1' })
    expect(store.getState().batchCreateCrowd(spec({ actionId: 'no_such_action' }))).toBeNull()
    expect(store.getState().activeScene().objects).toHaveLength(0)
    const groupId = store.getState().batchCreateCrowd(spec({ rows: 99, cols: 0 }))!
    expect(membersOf(store, groupId)).toHaveLength(10)
  })

  // 整组套姿态给的是别名（旧 Mixamo id standard_walk）：存下来的是正名 Walk_Loop（2026-10-24 走查 ① 第 2 轮：套姿态入口同样只存正名）
  it('changing the action on the group changes every member in one undo step, stored as the canonical id', () => {
    const store = createDirectorStore({ defaultSceneName: 'S1' })
    const groupId = store.getState().batchCreateCrowd(spec())!
    expect(store.getState().applyPosePresetToGroup(groupId, 'standard_walk')).toBe(6)
    expect(new Set(membersOf(store, groupId).map((item) => item.posePreset))).toEqual(new Set(['Walk_Loop']))
    expect(store.getState().applyPosePresetToGroup(groupId, 'standard_walk')).toBe(0)
    expect(store.getState().applyPosePresetToGroup(groupId, 'Walk_Loop')).toBe(0)
    store.getState().undo()
    expect(new Set(membersOf(store, groupId).map((item) => item.posePreset))).toEqual(new Set([DEFAULT_CROWD_ACTION_ID]))
  })

  it('one undo removes the whole group; redo brings all of it back', () => {
    const store = createDirectorStore({ defaultSceneName: 'S1' })
    store.getState().batchCreateCrowd(spec())
    expect(store.getState().activeScene().objects).toHaveLength(7)
    store.getState().undo()
    expect(store.getState().activeScene().objects).toHaveLength(0)
    store.getState().redo()
    expect(store.getState().activeScene().objects).toHaveLength(7)
  })

  it('a member can be edited on its own; deleting the group removes all members', () => {
    const store = createDirectorStore({ defaultSceneName: 'S1' })
    const groupId = store.getState().batchCreateCrowd(spec())!
    const [first, second] = membersOf(store, groupId)
    store.getState().applyPosePreset(first.id, 'running')
    expect(store.getState().findObject(first.id)!.posePreset).toBe('Jog_Fwd_Loop')
    expect(store.getState().findObject(second.id)!.posePreset).toBe(DEFAULT_CROWD_ACTION_ID)
    store.getState().deleteObject(groupId)
    expect(store.getState().activeScene().objects).toHaveLength(0)
  })
})
