/**
 * [INPUT]: 依赖 ./directorSpace 的 originYForCenter（中心 → 原点唯一换算）、./directorTypes（DirectorPrimitiveType / DIRECTOR_PRIMITIVE_TYPES / Vec3）、./vec3 的 RAD_TO_DEG
 * [OUTPUT]: 对外提供 AiSceneSpec / AiSceneElement / AiSceneGroup、normalizeAiScene（position 由「几何中心」换成对象原点，规划器 dressing 与资产导入共用）、
 *           primitiveTypeFromName、rotationLooksLikeRadians、AI_SCENE_FIXTURE
 * [POS]: director/model 的 block-out 场景纯层：场景 JSON 契约、类型名映射到 V2 八种几何体（多出的映射到最近似）、
 *        旋转弧度 / 角度启发式（全部 |r| ≤ 2π 视为弧度）；物化进 store 在 storeAiSceneActions。视口底部的「AI 搭场景」胶囊 2026-10-16 随旧导演台删除（去处 = 右侧 Agent 面板）。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { originYForCenter } from './directorSpace'
import { DIRECTOR_PRIMITIVE_TYPES, type DirectorPrimitiveType, type Vec3 } from './directorTypes'
import { RAD_TO_DEG } from './vec3'

import type { AiSceneSpec, AiSceneGroup } from '../../../../../../electron/shared/director/aiSceneSchema'

export const AI_SCENE_MAX_ELEMENTS = 60

// LLM 给的类型名 → 几何体；V2 只有八种，多出的映射到最近似的
const TYPE_ALIASES: Record<string, DirectorPrimitiveType> = {
  box: 'cube',
  cube: 'cube',
  block: 'cube',
  wall: 'cube',
  cylinder: 'cylinder',
  capsule: 'cylinder',
  cone: 'cone',
  sphere: 'sphere',
  ball: 'sphere',
  torus: 'torus',
  torus_knot: 'torus',
  torusknot: 'torus',
  plane: 'plane',
  ring: 'plane',
  circle: 'plane',
  ground: 'plane',
  tetrahedron: 'tetrahedron',
  icosahedron: 'icosahedron',
  dodecahedron: 'icosahedron',
  octahedron: 'icosahedron',
}

export function primitiveTypeFromName(raw: string | undefined): DirectorPrimitiveType {
  const key = (raw ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_')
  if ((DIRECTOR_PRIMITIVE_TYPES as readonly string[]).includes(key)) return key as DirectorPrimitiveType
  return TYPE_ALIASES[key] ?? 'cube'
}

// 有非零旋转且全部 |r| ≤ 2π → 整份当弧度
export function rotationLooksLikeRadians(groups: AiSceneGroup[]): boolean {
  let max = 0
  let any = false
  for (const group of groups) {
    for (const element of group.elements) {
      for (const value of element.rotation ?? []) {
        const magnitude = Math.abs(Number(value) || 0)
        if (magnitude > 1e-4) {
          any = true
          if (magnitude > max) max = magnitude
        }
      }
    }
  }
  return any && max <= Math.PI * 2 + 0.01
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function toVec3(value: [number, number, number] | undefined, fallback: number): Vec3 {
  return { x: round2(value?.[0] ?? fallback), y: round2(value?.[1] ?? fallback), z: round2(value?.[2] ?? fallback) }
}

export type NormalizedAiElement = {
  name: string
  type: DirectorPrimitiveType
  position: Vec3
  rotation: Vec3
  scale: Vec3
  color: string
  roughness?: number
  metalness?: number
  opacity?: number
  wireframe?: boolean
  flatShading?: boolean
}

export type NormalizedAiScene = {
  sceneName: string
  skyColor?: string
  groundOpacity?: number
  groups: Array<{ name: string; elements: NormalizedAiElement[] }>
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

// 校验后的 spec → 物化前的规整数据：旋转统一成度、颜色兜底、元素总数封顶
export function normalizeAiScene(spec: AiSceneSpec, fallbackSceneName: string): NormalizedAiScene {
  const radians = rotationLooksLikeRadians(spec.groups)
  let budget = AI_SCENE_MAX_ELEMENTS
  const groups = spec.groups.map((group, groupIndex) => ({
    name: (group.name ?? '').trim() || `${fallbackSceneName} ${groupIndex + 1}`,
    elements: group.elements.slice(0, Math.max(0, budget)).map((element, index) => {
      budget -= 1
      const rotation = toVec3(element.rotation, 0)
      if (radians) {
        rotation.x = round2(rotation.x * RAD_TO_DEG)
        rotation.y = round2(rotation.y * RAD_TO_DEG)
        rotation.z = round2(rotation.z * RAD_TO_DEG)
      }
      const type = primitiveTypeFromName(element.type)
      const scale = toVec3(element.scale, 1)
      // 模型按提示词写的是「几何中心」；渲染以对象原点（脚底）摆——全仓唯一的「中心 → 原点」换算在 directorSpace，
      // AI 搭场景与规划器 dressing 都经过这里，所以谁也不会再悬空半个身高。
      const position = toVec3(element.position, 0)
      position.y = round2(originYForCenter({ type, scale }, position.y))
      return {
        name: (element.name ?? '').trim() || `${type} ${index + 1}`,
        type,
        position,
        rotation,
        scale,
        color: element.color && HEX_COLOR.test(element.color) ? element.color.toLowerCase() : '#e2e8f0',
        roughness: element.roughness,
        metalness: element.metalness,
        opacity: element.opacity,
        wireframe: element.wireframe,
        flatShading: element.flatShading,
      }
    }),
  }))
  return {
    sceneName: (spec.sceneName ?? '').trim() || fallbackSceneName,
    skyColor: spec.sceneConfig?.skyColor && HEX_COLOR.test(spec.sceneConfig.skyColor) ? spec.sceneConfig.skyColor.toLowerCase() : undefined,
    groundOpacity: typeof spec.sceneConfig?.groundOpacity === 'number' ? Math.min(1, Math.max(0, spec.sceneConfig.groundOpacity)) : undefined,
    groups,
  }
}


// 固定夹具：单测与开发入口（无文本模型时）复现同一布局——「街角咖啡馆」三组 12 件
export const AI_SCENE_FIXTURE: AiSceneSpec = {
  sceneName: '街角咖啡馆',
  sceneConfig: { skyColor: '#1f2937', groundOpacity: 0.35 },
  groups: [
    {
      name: '建筑组',
      elements: [
        { type: 'cube', name: '主楼', position: [0, 3, -6], scale: [10, 6, 6], color: '#9a8c7a', roughness: 0.9 },
        { type: 'cube', name: '雨棚', position: [0, 3.1, -2.6], rotation: [0, 0, 0], scale: [6, 0.2, 1.6], color: '#7c2d12' },
        { type: 'cube', name: '门', position: [0, 1.1, -3.05], scale: [1.2, 2.2, 0.1], color: '#3f3f46' },
        { type: 'cube', name: '橱窗', position: [3, 1.6, -3.05], scale: [3, 1.8, 0.1], color: '#93c5fd', opacity: 0.6 },
      ],
    },
    {
      name: '街道设施',
      elements: [
        { type: 'cylinder', name: '路灯杆', position: [-5, 2, 1], scale: [0.15, 4, 0.15], color: '#374151', metalness: 0.6 },
        { type: 'sphere', name: '路灯', position: [-5, 4.2, 1], scale: [0.5, 0.5, 0.5], color: '#fde68a' },
        { type: 'cube', name: '长椅', position: [4, 0.25, 1.5], scale: [1.8, 0.5, 0.6], color: '#78350f' },
        { type: 'cylinder', name: '垃圾桶', position: [6, 0.45, 1.5], scale: [0.5, 0.9, 0.5], color: '#4b5563' },
      ],
    },
    {
      name: '露天座位',
      elements: [
        { type: 'cylinder', name: '圆桌', position: [-1.5, 0.7, 0.5], scale: [0.9, 0.05, 0.9], color: '#d6d3d1' },
        { type: 'cylinder', name: '桌腿', position: [-1.5, 0.35, 0.5], scale: [0.08, 0.7, 0.08], color: '#6b7280' },
        { type: 'cube', name: '椅子 A', position: [-2.4, 0.45, 0.5], scale: [0.5, 0.9, 0.5], color: '#a16207' },
        { type: 'cube', name: '椅子 B', position: [-0.6, 0.45, 0.5], rotation: [0, 180, 0], scale: [0.5, 0.9, 0.5], color: '#a16207' },
      ],
    },
  ],
}
