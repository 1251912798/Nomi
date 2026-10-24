/**
 * [INPUT]: 依赖 ./directorTypes 的 Vec3/DirectorCamera、./vec3 的 lookAtAngles/applyTransform/eulerXYZToMatrix/applyMat3/RAD_TO_DEG、./cameraLens 的 syncFocalLength
 * [OUTPUT]: 对外提供 CAMERA_PRESETS（14 个机位预设，坐标在「主体局部空间」）、buildCameraFromPreset、CameraPresetId
 * [POS]: director/model 的机位预设单一真相（清单 §2.2 V4b）；创建栏、「Shift+A 从当前视角生成机位」与「创建特写片段」都经 buildCameraFromPreset，
 *        有主体时把预设位置/注视点按主体的参照系（位置 + 水平朝向 + 各轴尺度大小，不含俯仰 / 横滚 / 翻转）变到世界，无主体按世界原点。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { DirectorCamera, Vec3 } from './directorTypes'
import { syncFocalLength } from './cameraLens'
import { applyMat3, applyTransform, eulerXYZToMatrix, lookAtAngles, RAD_TO_DEG, type Transform } from './vec3'

export type CameraPresetId =
  | 'current'
  | 'front_medium'
  | 'front_closeup'
  | 'front_wide'
  | 'side_follow'
  | 'side_closeup'
  | 'back_medium'
  | 'high_wide'
  | 'high_40'
  | 'low_angle'
  | 'low_wide'
  | 'ots_left'
  | 'ots_right'
  | 'birds_eye'

export type CameraPreset = {
  id: CameraPresetId
  isCurrent?: boolean
  position?: Vec3
  lookAtCoords?: Vec3
  fov?: number
}

export const CAMERA_PRESETS: readonly CameraPreset[] = [
  { id: 'current', isCurrent: true },
  { id: 'front_medium', position: { x: 0, y: 1.1, z: 3.5 }, lookAtCoords: { x: 0, y: 1, z: 0 }, fov: 45 },
  { id: 'front_closeup', position: { x: 0, y: 1.6, z: 1.2 }, lookAtCoords: { x: 0, y: 1.6, z: 0 }, fov: 35 },
  { id: 'front_wide', position: { x: 0, y: 0.9, z: 6 }, lookAtCoords: { x: 0, y: 0.9, z: 0 }, fov: 50 },
  { id: 'side_follow', position: { x: 3.5, y: 1.1, z: 0 }, lookAtCoords: { x: 0, y: 1, z: 0 }, fov: 45 },
  { id: 'side_closeup', position: { x: 1.2, y: 1.6, z: 0 }, lookAtCoords: { x: 0, y: 1.6, z: 0 }, fov: 40 },
  { id: 'back_medium', position: { x: 0, y: 1.1, z: -3.5 }, lookAtCoords: { x: 0, y: 1, z: 0 }, fov: 45 },
  { id: 'high_wide', position: { x: 0, y: 5, z: 4 }, lookAtCoords: { x: 0, y: 0.5, z: 0 }, fov: 50 },
  { id: 'high_40', position: { x: 0, y: 3.5, z: 4.2 }, lookAtCoords: { x: 0, y: 0.5, z: 0 }, fov: 45 },
  { id: 'low_angle', position: { x: 0, y: 0.2, z: 3 }, lookAtCoords: { x: 0, y: 1.2, z: 0 }, fov: 45 },
  { id: 'low_wide', position: { x: 0, y: 0.2, z: 2.5 }, lookAtCoords: { x: 0, y: 1.2, z: 0 }, fov: 24 },
  { id: 'ots_left', position: { x: -0.6, y: 1.6, z: -1.2 }, lookAtCoords: { x: 0.2, y: 1.5, z: 2 }, fov: 45 },
  { id: 'ots_right', position: { x: 0.6, y: 1.6, z: -1.2 }, lookAtCoords: { x: -0.2, y: 1.5, z: 2 }, fov: 45 },
  { id: 'birds_eye', position: { x: 0, y: 8, z: 0.1 }, lookAtCoords: { x: 0, y: 0, z: 0 }, fov: 60 },
]

export type CurrentViewPose = { position: Vec3; yaw: number; pitch: number; roll: number; fov: number }

export type BuildCameraFromPresetOptions = {
  preset: CameraPreset
  id: string
  name: string
  // 主体（选中角色/物体）的世界变换；缺省 = 世界原点
  subject?: Transform | null
  // 「当前视角」预设用：自由相机的当前位姿；缺省退化为 (0,1.6,4.5) 看 (0,1,0)
  currentView?: CurrentViewPose | null
}

const FALLBACK_POSITION: Vec3 = { x: 0, y: 1.5, z: 3 }
const FALLBACK_LOOK_AT: Vec3 = { x: 0, y: 1, z: 0 }

/**
 * 主体的水平朝向（度）：从主体的旋转框架读，不读欧拉 y 那个数——精修「＋ → 机位」传的是世界矩阵分解出来的欧拉，
 * |偏航| > 90° 会分解成 (180, 180 − ψ, 180)。读右轴（本地 +X）在地面上的投影：直立主体就是它的偏航；
 * 绕 X 翻 180° 的泼溅右轴不变、照旧读出它的偏航；躺倒（俯仰 ±90°）时前轴竖直、右轴仍在地面上。右轴本身竖直（横滚 ±90°）时退回读前轴。
 */
function horizontalHeading(rotation: Vec3): number {
  const basis = eulerXYZToMatrix(rotation)
  const right = applyMat3(basis, { x: 1, y: 0, z: 0 })
  if (Math.hypot(right.x, right.z) > 1e-6) return Math.atan2(-right.z, right.x) * RAD_TO_DEG
  const forward = applyMat3(basis, { x: 0, y: 0, z: 1 })
  return Math.atan2(forward.x, forward.z) * RAD_TO_DEG
}

/**
 * 机位预设的参照系 = 主体位置 + 水平朝向 + 各轴尺度大小（儿童 / 巨人体形是缩放做的，要跟着）。不套主体的整份旋转：
 * 泼溅按源轴约定绕 X 翻 180°，套整份旋转会把本地 y = +1.6 翻成世界 y = -1.6（2026-10-24 走查：「正面特写」机位落到地面以下），
 * 俯仰 / 横滚同理会把机位压斜、拉低。
 */
function presetFrame(subject: Transform): Transform {
  return {
    position: subject.position,
    rotation: { x: 0, y: horizontalHeading(subject.rotation), z: 0 },
    scale: { x: Math.abs(subject.scale.x), y: Math.abs(subject.scale.y), z: Math.abs(subject.scale.z) },
  }
}

export function buildCameraFromPreset(options: BuildCameraFromPresetOptions): DirectorCamera {
  const { preset, id, name, subject, currentView } = options
  if (preset.isCurrent) {
    const view = currentView ?? {
      position: { x: 0, y: 1.6, z: 4.5 },
      ...lookAtAngles({ x: 0, y: 1.6, z: 4.5 }, { x: 0, y: 1, z: 0 }),
      fov: 50,
    }
    return syncFocalLength({
      id,
      name,
      position: { ...view.position },
      yaw: view.yaw,
      pitch: view.pitch,
      roll: view.roll,
      fov: Math.round(view.fov),
      focalLengthMm: 0,
      showRayHelper: true,
    })
  }
  const localPosition = preset.position ?? FALLBACK_POSITION
  const localLookAt = preset.lookAtCoords ?? FALLBACK_LOOK_AT
  const frame = subject ? presetFrame(subject) : null
  const position = frame ? applyTransform(localPosition, frame) : { ...localPosition }
  const lookAt = frame ? applyTransform(localLookAt, frame) : { ...localLookAt }
  const angles = lookAtAngles(position, lookAt)
  return syncFocalLength({
    id,
    name,
    position,
    yaw: angles.yaw,
    pitch: angles.pitch,
    roll: angles.roll,
    fov: preset.fov ?? 50,
    focalLengthMm: 0,
    // 预设只给位姿，不挂看向（否则 cameraRigSystem 每帧把朝向拽回坐标，用户转不动机位）
    showRayHelper: true,
  })
}
