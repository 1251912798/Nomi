// 数组参考槽（角色图 / 视频 / 音频）的读写小件：从 archetypeMeta.ts 拆出（文件行数上限）。
// 图片走节点那一份有序参考列表（referenceList.ts），视频 / 音频各住各的键。
import type { ArchetypeMode } from '../../../../../electron/shared/modelArchetypes'
import type { ArchetypeArraySlot } from './archetypeMeta'
import { readReferenceList, REFERENCE_LIST_KEY, withReferenceList } from './referenceList'

/** 读 meta 里某数组槽的当前 URL 列表（健壮：非数组 / 含空串都过滤掉）。 */
export function readArchetypeArray(meta: Record<string, unknown> | undefined, metaKey: string): string[] {
  const value = meta?.[metaKey]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

export type ArchetypeArrayAppend =
  | { status: 'added'; next: string[] }
  | { status: 'empty' }
  | { status: 'duplicate' }
  | { status: 'full'; max: number }

/**
 * 往数组参考槽追加一个 URL 的**纯**单源逻辑（去重 + 上限判定）。**仅 meta-only 上传路径**用它：
 * renderer 的 handleArrayAdd（手动粘 URL）、拖入磁盘文件(useNodeAssetDrop)——这两处无源节点、是真上传。
 * 画布连线（completeNodeConnection）已收口成「建有序边」，不再写 meta（audit 2026-06-16 §1d），故不在此列。
 * 保证「加上传参考」只有一套去重/上限规则（规则 1：不开第 N 条写路径）。写入 / toast 由调用方按返回状态决定。
 */
export function appendArchetypeArrayValue(
  meta: Record<string, unknown> | undefined,
  slot: ArchetypeArraySlot,
  url: string,
): ArchetypeArrayAppend {
  const trimmed = url.trim()
  if (!trimmed) return { status: 'empty' }
  const current = readArchetypeArrayForWrite(meta, slot.metaKey)
  if (current.includes(trimmed)) return { status: 'duplicate' }
  if (slot.max !== undefined && current.length >= slot.max) return { status: 'full', max: slot.max }
  return { status: 'added', next: [...current, trimmed] }
}

/**
 * 数组参考槽的「写之前读」：图片住节点那一份有序参考列表（旧数据归一进来），视频 / 音频读各自的键。
 * 和 archetypeArrayWrite 成对用——读写同一份，旧的按槽存的首 / 尾帧键在写回时删掉。
 */
export function readArchetypeArrayForWrite(meta: Record<string, unknown> | undefined, metaKey: string, mode?: ArchetypeMode | null): string[] {
  return metaKey === REFERENCE_LIST_KEY ? readReferenceList(meta, mode) : readArchetypeArray(meta, metaKey)
}

/** 把数组参考槽的新值写回 meta（返回整份新 meta）：图片列表走 withReferenceList（落规范形），其余直接写键。 */
export function archetypeArrayWrite(meta: Record<string, unknown>, metaKey: string, next: readonly string[]): Record<string, unknown> {
  return metaKey === REFERENCE_LIST_KEY ? withReferenceList(meta, next) : { ...meta, [metaKey]: [...next] }
}
