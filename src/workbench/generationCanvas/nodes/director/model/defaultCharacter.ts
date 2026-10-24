/**
 * [INPUT]: 依赖 ./directorTypes（DirectorObject / DirectorRig / Vec3）、./rigs（默认人偶模型 / 绑定）、./actionLibrary（resolveActionAlias / T_POSE_ACTION_ID）
 * [OUTPUT]: 对外提供 CharacterGender、CHARACTER_MODEL_BY_GENDER、DEFAULT_CROWD_ACTION_ID、defaultCharacterInput：「加人」与「放置群众」共用的默认角色模板
 * [POS]: director/model 的默认角色唯一定义：角色放置（scene/creation/useCharacterPlacement）与群众（store.batchCreateCrowd）都从这里取模型 / 绑定 / 颜色，
 *        群众因此永远和「加人」是同一个人偶（2026-10-07 用户拍板：群众并进「加人」、用默认角色、不复制选中角色）。
 *        也是这两扇门写 posePreset 的唯一出口：只写动作库正名（姿态采样只认正名，别名会退回绑定姿态 = T 字），认不出的 id 写不进去。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { resolveActionAlias, T_POSE_ACTION_ID } from './actionLibrary'
import type { DirectorObject, DirectorRig, Vec3 } from './directorTypes'
import { DEFAULT_CHARACTER_MODEL_PATH, DEFAULT_CHARACTER_RIG } from './rigs'

export type CharacterGender = 'female' | 'male'

export const CHARACTER_MODEL_BY_GENDER: Record<CharacterGender, { modelPath: string; rig: DirectorRig }> = {
  female: { modelPath: DEFAULT_CHARACTER_MODEL_PATH, rig: DEFAULT_CHARACTER_RIG },
  male: { modelPath: DEFAULT_CHARACTER_MODEL_PATH, rig: DEFAULT_CHARACTER_RIG },
}

/**
 * 动作 id（正名或别名）→ 动作库正名；认不出就抛。posePreset 只存正名：别名表一份三用（AI 词 / 旧 id / 中文），
 * 「校验过」不等于「存的是正名」，姿态采样只按正名查。2026-10-24 走查：群众默认动作曾是别名 standing_idle、原样写进工程，
 * 放下的群众全站成 T 字。
 */
function canonicalActionId(actionId: string): string {
  const entry = resolveActionAlias(actionId)
  if (!entry) throw new Error(`unknown action id for a character pose: ${actionId}`)
  return entry.id
}

/** 群众默认动作 = 动作库「站立待机」的正名（从别名 standing_idle 解析，库换了跟着换）。 */
export const DEFAULT_CROWD_ACTION_ID = canonicalActionId('standing_idle')

type Transform = { position: Vec3; rotation: Vec3; scale: Vec3 }

/** 一个默认角色的 addObject 入参；posePreset 缺省为 T-Pose（「加人」的现状），群众传动作库 id（正名或别名，写进去的一律是正名）。 */
export function defaultCharacterInput(gender: CharacterGender, name: string, transform: Transform, posePreset = T_POSE_ACTION_ID): Omit<DirectorObject, 'id'> {
  const spec = CHARACTER_MODEL_BY_GENDER[gender]
  return {
    name,
    type: 'character',
    ...transform,
    color: gender === 'female' ? '#fb7185' : '#38bdf8',
    visible: true,
    locked: false,
    posePreset: canonicalActionId(posePreset),
    modelPath: spec.modelPath,
    modelScale: 1,
    isSystemModel: true,
    rig: spec.rig,
  }
}
