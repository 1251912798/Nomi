import { hostedAssetCanvasPreview, hostedAssetUrl, importWorkbenchLocalAssetFile } from '../../api/assetUploadApi'
import type { ProjectExecutionContext } from '../../project/projectCanvasReadSurface'
import { surfacePortFailure } from '../../../../electron/shared/surfacePortBinding'
import type { CanvasPreviewFields } from '../../../../electron/shared/canvas/canvasMediaPreview'

/**
 * 节点图片落盘统一入口。
 *
 * 根因：卡片上传 / 全景上传 / 音频上传 / 裁切·旋转·网格切分 这些路径过去把
 * canvas.toDataURL / FileReader 的 base64 直接写进 store 且【从不替换】，于是每张图
 * 的完整 base64 永久挂在 Zustand 节点上、随每次保存全量序列化落盘 —— 图多即卡。
 *
 * 这里复用「拖拽导入」已经走通的那条干净管线（importWorkbenchLocalAssetFile →
 * 落盘 → nomi-local:// URL），让所有「图进节点」的路径都收敛到本地文件 URL，store
 * 只存门牌号。绝不造并行版（P1）。
 *
 * 2026-10-16：落盘回执里的**预览两栏**（独立小图 + 预览事实）以前在这一层被丢掉——只回了 url，
 * 于是上传 / 裁剪 / 切图 / 抠图出来的 4K 图在画布上一律挂原图（C-dense）。现在回的是「可以整段
 * 展开进画布结果的媒体字段」：调用方写 `{ id, type: 'image', ...stored.media, createdAt }`，
 * 没法只拿 url 而把预览丢在半路。
 *
 * 持久化约束（见 projectMediaMigration.assertWorkbenchProjectMediaUrlsPersistable）：
 * result.url 只能是 nomi-local:// 或 base64，不能是 blob:（保存会抛错）。因此这里
 * 直接 await 落盘换 nomi-local；只有落盘失败才退回 base64 兜底（可持久化、不丢图）。
 */

/** 能整段展开进画布结果的媒体字段：门牌号 + 预览两栏。 */
export type PersistedNodeMedia = { url: string } & CanvasPreviewFields

/**
 * File → 本地资产文件，返回可持久化 nomi-local:// 媒体字段（带落盘回执的预览两栏）；失败返回 null（调用方退回 base64 兜底）。
 * context 必传：由发起动作在第一个 await 之前捕获。这里不再「忘了传就现取当前项目」——那正是晚绑定漏门。
 */
export async function persistNodeMediaFile(
  file: File, ownerNodeId: string, context: ProjectExecutionContext,
): Promise<PersistedNodeMedia | null> {
  context.assertCurrent()
  try {
    const asset = await importWorkbenchLocalAssetFile(file, file.name || 'asset', {
      ownerNodeId, projectBinding: context.binding, assertCurrent: context.assertCurrent,
    })
    context.assertCurrent()
    const url = hostedAssetUrl(asset)
    if (!url) return null
    return { url, ...hostedAssetCanvasPreview(asset, mediaTypeOf(file)) }
  } catch (error) {
    context.assertCurrent()
    if (surfacePortFailure(error).code !== 'capability_execution_failed') throw error
    return null
  }
}

/**
 * 只要门牌号的旧形状。**只剩白板和截图裁剪还在用**（二者的契约测试都在白板目录，归草稿 #1189，本刀不碰）：拿到的 URL 不带预览事实，
 * 画布结果因此是「未知」，由打开 / 变更后补预览那道共享边界（resultMediaBackfillBridge）补齐，期间走被计数的缺失分支。
 * #1189 合入后二者改用 persistNodeMediaFile，并删掉本函数（入口普查测试 canvasPreviewDoors.test 钉着这份名单）。
 */
export async function persistNodeImageFile(
  file: File, ownerNodeId: string, context: ProjectExecutionContext,
): Promise<string | null> {
  return (await persistNodeMediaFile(file, ownerNodeId, context))?.url ?? null
}

function mediaTypeOf(file: File): 'image' | 'video' | 'audio' | undefined {
  const type = String(file.type || '').toLowerCase()
  return type.startsWith('image/') ? 'image' : type.startsWith('video/') ? 'video' : type.startsWith('audio/') ? 'audio' : undefined
}

/**
 * 本地画出来的 PNG（切图 / 裁剪 / 旋转 / 联系表）→ **可写进 store 的媒体字段**，一条路。
 *
 * 语义：优先落盘换 nomi-local:// 门牌号 + 预览两栏；只有落盘失败才退回 base64（可持久化、不丢图），
 * 此时预览事实明确是 'missing'（没落盘就派生不了小图）。
 * 调用方拿到之后**只写一次 store**——别再走「先塞 base64 给预览、落盘后再换掉」那套：
 * 那套每次 updateNode 都被 emitCanvasGesture 做一遍 JSON 深拷贝，九宫格切图时 60MB 走 JSON、
 * 主线程冻 1.6s（2026-08-20 用户报「九宫格直接卡死」的根因，见 docs/plan/2026-08-20-grid-split-freeze.md）。
 */
export async function persistNodeImageBlob(
  blob: Blob,
  ownerNodeId: string,
  fileName: string,
  context: ProjectExecutionContext,
): Promise<{ media: PersistedNodeMedia; localOnly: boolean }> {
  context.assertCurrent()
  const type = blob.type || 'image/png'
  const persisted = await persistNodeMediaFile(new File([blob], fileName, { type }), ownerNodeId, context)
  context.assertCurrent()
  if (persisted) return { media: persisted, localOnly: false }
  const url = await blobToBase64Url(blob)
  context.assertCurrent()
  return { media: { url, previewState: 'missing' }, localOnly: true }
}

function blobToBase64Url(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('blob → base64 失败'))
    reader.readAsDataURL(blob)
  })
}

/**
 * dataURL → File。给 canvas.toDataURL 的产物（全景截图等仍产 dataURL 的路径）用，
 * 这样它们也能走 persistNodeImageFile 落盘，而不是把 PNG base64 永久塞进 store。
 */
export function dataUrlToFile(dataUrl: string, fileName: string): File | null {
  const match = /^data:([^;,]*?)(;base64)?,(.*)$/s.exec(dataUrl)
  if (!match) return null
  const contentType = match[1] || 'image/png'
  const isBase64 = Boolean(match[2])
  const data = match[3]
  try {
    let arr: Uint8Array
    if (isBase64) {
      const binary = atob(data)
      arr = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) arr[i] = binary.charCodeAt(i)
    } else {
      const decoded = decodeURIComponent(data)
      arr = new Uint8Array(decoded.length)
      for (let i = 0; i < decoded.length; i += 1) arr[i] = decoded.charCodeAt(i)
    }
    return new File([arr as BlobPart], fileName, { type: contentType })
  } catch {
    return null
  }
}
