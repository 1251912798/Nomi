/**
 * [INPUT]: 依赖 ./directorTypes（DirectorObject / Vec3）、./rigs（RIG_BONE_MAPS / SEMANTIC_BONES / isBuiltinCharacterModel）、
 *          ./actionLibrary（resolveActionAlias / LEGACY_APPROXIMATE_ACTIONS）
 * [OUTPUT]: 对外提供 UalMigrationNote、createUalMigrationNote、migrateCharacterToUal
 * [POS]: director/model 的「角色 → UAL」读时迁移（2026-10-07 默认人偶换 UAL，不留并行版）：只由 directorProject.normalizeObject 调用，
 *        所以编辑器、Agent 写口、预演截帧、出片、导入图层读到的都是同一份迁移结果；纯函数、幂等、只改内存里那份。
 *        内置 Mixamo 人偶（modelPath 缺省或 builtin:*，rig 缺省或 'mixamo'）整个迁；其余角色（上传的、已是 UAL 的）只换动作 id（10-07 协调拍板 B），
 *        骨架 / 模型 / 手调骨骼不碰。动作 id 一律换成动作库正名（别名表一张，施工计划 §3）：工程里只存正名，姿态采样只按正名查。
 *        已是 UAL 的人偶也换——2026-10-24 前加人 / 群众 / 套姿态的写口把别名原样存进了工程（群众站成 T 字），重开不换就一直是 T 字（协调 10-24 定：
 *        别名本来就是正名的同义词，换成正名不改含义，旧版 App 采样也只认正名）。认不出的 id 原样留着：可能是更新版本动作库里的 id，改写了就毁了它。
 *        boneRotations 的键 mixamorig* → UAL 骨名、值原样（值是规范轴度数，scene/character/canonicalBoneFrame 保证语义不变）；
 *        没有对应骨的键（手指 / 末端）丢掉并计数。迁移说明只回给调用方，不进工程。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { LEGACY_APPROXIMATE_ACTIONS, resolveActionAlias } from './actionLibrary'
import type { DirectorObject, Vec3 } from './directorTypes'
import { isBuiltinCharacterModel, RIG_BONE_MAPS, SEMANTIC_BONES } from './rigs'

export type UalMigrationNote = {
  /** 读档时改动过的角色数（内置人偶整个迁、上传 Mixamo 角色只换动作 id） */
  characters: number
  /** 旧动作在 UAL 里没有原样对应、换成了相近动作的次数（坐地上 / 跪 / 下跪 / 跪起身） */
  approximatedActions: number
  /** 手调骨骼里没有对应骨、丢掉的键数（手指、头顶 / 脚尖末端） */
  droppedBoneKeys: number
}

export function createUalMigrationNote(): UalMigrationNote {
  return { characters: 0, approximatedActions: 0, droppedBoneKeys: 0 }
}

/** mixamorig 骨名（带不带冒号、大小写）→ UAL 语义骨名；已是 UAL 语义骨名的原样；其它 → null */
const UAL_BONE_BY_KEY = new Map<string, string>(
  SEMANTIC_BONES.flatMap((bone) => [
    [RIG_BONE_MAPS.mixamo[bone].toLowerCase(), RIG_BONE_MAPS.ual[bone]],
    [RIG_BONE_MAPS.ual[bone].toLowerCase(), RIG_BONE_MAPS.ual[bone]],
  ]),
)
const ualBoneFor = (key: string): string | null => UAL_BONE_BY_KEY.get(key.replace(':', '').toLowerCase()) ?? null

function migrateBoneRotations(rotations: Record<string, Vec3>, note: UalMigrationNote): Record<string, Vec3> {
  const out: Record<string, Vec3> = {}
  for (const [key, value] of Object.entries(rotations)) {
    const bone = ualBoneFor(key)
    if (bone) out[bone] = value
    else note.droppedBoneKeys += 1
  }
  return out
}

/**
 * 动作 id → 动作库正名：正名原样；旧 Mixamo id / 别名 / 大小写不同 → 正名（换成相近动作的记一次）；
 * 认不出 → 原样（可能是更新版本动作库里的 id；采样照旧当「找不到条目 = 静止」）。
 */
function migrateActionId(id: string, note: UalMigrationNote): string {
  const entry = resolveActionAlias(id)
  if (!entry || entry.id === id) return id
  if (LEGACY_APPROXIMATE_ACTIONS.has(id)) note.approximatedActions += 1
  return entry.id
}

/** 动作 id 换成库里的 UAL id（静止姿态、动作片段、编译器写成动作 id 的片段名）；返回有没有改动 */
function migrateActionIds(object: DirectorObject, note: UalMigrationNote): boolean {
  let changed = false
  if (object.posePreset) {
    const next = migrateActionId(object.posePreset, note)
    changed ||= next !== object.posePreset
    object.posePreset = next
  }
  for (const clip of object.actionClips ?? []) {
    if (!clip.actionPose) continue
    const previous = clip.actionPose
    clip.actionPose = migrateActionId(previous, note)
    changed ||= clip.actionPose !== previous
    // 编译器把片段名写成动作 id（directorPlanCompiler）：名字恰好是旧 id 的一并换掉；用户起的名字不动
    if (clip.name === previous) clip.name = clip.actionPose
  }
  return changed
}

/**
 * 每个角色：动作 id 一律换成正名（静止姿态、动作片段、编译器写成动作 id 的片段名）。
 * 内置 Mixamo 人偶另外整个换成 UAL（rig、手调骨骼键）。用户上传的 Mixamo 角色骨架、模型路径、手调骨骼一概不动
 * （它们的骨就是 Mixamo 骨，UAL 动作经 poseSnapshot 按基名重定向套上去）；不换动作 id 的话旧的 9 个 id 在新动作库里查不到，角色全部停在 T 字。
 * 已是 UAL 的人偶同理：别名查不到 clip，停在 T 字。
 */
export function migrateCharacterToUal(object: DirectorObject, note: UalMigrationNote): void {
  if (object.type !== 'character') return
  const renamed = migrateActionIds(object, note)
  const builtinMixamo = isBuiltinCharacterModel(object.modelPath) && (object.rig === undefined || object.rig === 'mixamo')
  if (builtinMixamo) {
    object.rig = 'ual'
    if (object.boneRotations) object.boneRotations = migrateBoneRotations(object.boneRotations, note)
    for (const clip of object.actionClips ?? []) {
      for (const keyframe of clip.keyframes ?? []) keyframe.boneRotations = migrateBoneRotations(keyframe.boneRotations, note)
    }
  }
  if (renamed || builtinMixamo) note.characters += 1
}
