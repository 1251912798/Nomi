/**
 * 参考行的派生数据：哪些图「未用到」（淡显）、每张图叫什么、参考数组里放了几张。
 * 全是读：输入是节点、图与槽的当前取值，输出只给参考行渲染（名字是投影，不落盘）。
 */
import type { GenerationCanvasNode, GenerationCanvasEdge } from '../../model/generationCanvasTypes'
import type { ImageUrlSlot } from '../../model/parameterReferenceSlots'
import { referenceAssetKindForNode } from '../../agent/referenceEdgeCapability'
import { peekAllProjectAssets } from '../../../assets/useAllProjectAssets'
import { resolveReferenceInfos } from '../../../assets/referenceNames'
import type { AssetKind } from '../../../assets/assetTypes'
import type { AssetSlot } from '../../../assets/AssetReference'
import type { ArchetypeArraySlot } from './archetypeMeta'
import { resultPreviewUrl } from './parameterControlModel'

export function computeReferenceRowModel(args: {
  node: GenerationCanvasNode
  nodes: GenerationCanvasNode[]
  edges: GenerationCanvasEdge[]
  meta: Record<string, unknown>
  assetSlots: AssetSlot[]
  assetValuesByKey: Record<string, string | string[] | undefined>
  imageUrlSlots: ImageUrlSlot[]
  arraySlots: ArchetypeArraySlot[]
  refsUnsupported: boolean
  /** 节点参考列表里当前方式用不上的图（resolveReferencePlacement 的 unused，和请求组装同一个推导）。 */
  unusedUploads: readonly string[]
  /** unusedUploads 里「先放一边」的旧工程残留（resolveReferencePlacement 的 parked）：点一下放回在用。 */
  parkedUploads?: readonly string[]
  showReferences: boolean
  fallbackName: (kind: AssetKind) => string
}) {
  const { node, nodes, edges, assetSlots, assetValuesByKey, imageUrlSlots, arraySlots, refsUnsupported } = args
  const inboundImageUrls = edges
    .filter((edge) => edge.target === node.id)
    .flatMap((edge) => {
      const source = nodes.find((candidate) => candidate.id === edge.source)
      const url = source && referenceAssetKindForNode(source) === 'image' ? resultPreviewUrl(source) : ''
      return url ? [url] : []
    })
  const shownUrls = new Set(Object.values(assetValuesByKey).flat().filter((value): value is string => Boolean(value)))
  const framesOnly = imageUrlSlots.some((slot) => slot.group === 'first_frame') && arraySlots.length === 0
  // 节点参考列表里此刻用不上的图（放不下、或当前方式 / 模型不收图）：淡显成「未用到」，切回去还在、也不会发出去。
  // 「用不上」由 resolveReferencePlacement 推导（和请求组装同一个函数），这里不另算。连线多出来的图只在首尾帧 / 不收参考时算。
  const uploads = args.unusedUploads
  const unusedUrls = Array.from(new Set(refsUnsupported || framesOnly ? [...inboundImageUrls, ...uploads] : uploads)).filter((url) => !shownUrls.has(url))
  const parked = new Set(args.parkedUploads ?? [])
  const parkedUrls = new Set(unusedUrls.filter((url) => parked.has(url)))
  const referenceInfos = args.showReferences
    ? resolveReferenceInfos({
      nodeId: node.id,
      references: [
        ...assetSlots.flatMap((slot) => {
          const raw = assetValuesByKey[slot.key]
          return (Array.isArray(raw) ? raw : [raw]).filter((url): url is string => Boolean(url)).map((url) => ({ url, kind: slot.accept }))
        }),
        ...unusedUrls.map((url) => ({ url, kind: 'image' as AssetKind })),
      ],
      nodes, edges, library: peekAllProjectAssets(), fallbackName: args.fallbackName,
    })
    : undefined
  const arrayCount = arraySlots.reduce((sum, slot) => sum + ((assetValuesByKey[slot.metaKey] as string[] | undefined) ?? []).filter(Boolean).length, 0)
  return { unusedUrls, parkedUrls, framesOnly, referenceInfos, arrayCount }
}

/** 用户在这个节点上关掉了「要当首尾帧用？」的提示（只对这个节点生效，随项目持久化）。 */
export const FIRST_LAST_HINT_DISMISSED_META_KEY = 'firstLastHintDismissed'

/**
 * 参考方式里只放了 1–2 张图、模型同时有「参考」和「首尾帧」：问一句要不要当首尾帧用（× 关掉后这个节点不再提示）。
 * 只放了图（视频 / 音频槽是空的）才问；放了视频 / 音频参考的节点不是在「用图当首尾帧」。
 */
export function firstLastAmbiguityTarget(args: {
  modes: readonly { id: string; intent?: string }[] | undefined
  activeIntent: string | undefined
  arraySlots: ArchetypeArraySlot[]
  assetValuesByKey: Record<string, string | string[] | undefined>
  arrayCount: number
  meta: Record<string, unknown>
  isVideo: boolean
}): string | null {
  const firstLast = args.modes?.find((mode) => mode.intent === 'firstlast')
  const filled = (slot: ArchetypeArraySlot) => ((args.assetValuesByKey[slot.metaKey] as string[] | undefined) ?? []).length
  const imageRefOnly = args.arraySlots.some((slot) => slot.accept === 'image')
    && args.arraySlots.every((slot) => slot.accept === 'image' || filled(slot) === 0)
  const ambiguous = Boolean(firstLast) && args.activeIntent === 'character' && imageRefOnly
    && args.arrayCount >= 1 && args.arrayCount <= 2 && !args.meta[FIRST_LAST_HINT_DISMISSED_META_KEY] && args.isVideo
  return ambiguous && firstLast ? firstLast.id : null
}
