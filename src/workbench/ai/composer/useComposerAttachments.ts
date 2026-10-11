import React from 'react'
import i18n from '../../../i18n'
import type { AssetRef } from '../../assets/assetTypes'
import { canvasNodeToAssetRefs } from '../../assets/assetTypes'
import { listNodeMediaResults, resultIdentity } from '../../generationCanvas/model/nodeResultLifecycle'
import { useGenerationCanvasStore } from '../../generationCanvas/store/generationCanvasStore'
import { importWorkbenchLocalAssetFile, importWorkbenchRemoteAssetUrl } from '../../api/assetUploadApi'
import { isProjectExecutionContextCurrent, isProjectImportCancellation, withProjectAction, type ProjectExecutionContext } from '../../project/projectCanvasReadSurface'
import {
  COMPOSER_ATTACHMENT_MAX_BYTES,
  attachmentKindFromContentType,
  formatAttachmentSize,
  type ComposerAttachment,
} from './composerAttachmentTypes'

// composer 附件入口可接受的类型（点击上传 / 拖拽 / 粘贴共用）。
// 传输层格式无关（nomi-local），这里只做友好筛选 + 体验提示。
export const COMPOSER_ATTACHMENT_ACCEPT =
  'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.markdown'

type SetAttachments = (updater: (prev: ComposerAttachment[]) => ComposerAttachment[]) => void

let attachmentSeq = 0
function nextAttachmentId(): string {
  attachmentSeq += 1
  return `att_${Date.now().toString(36)}_${attachmentSeq}`
}

function readAssetUrl(asset: { data?: Record<string, unknown> }): string {
  const url = asset?.data?.url
  return typeof url === 'string' ? url : ''
}

function readAssetContentHash(asset: { data?: Record<string, unknown> }): string {
  const contentHash = asset?.data?.contentHash
  return typeof contentHash === 'string' ? contentHash : ''
}

export type UseComposerAttachments = {
  isDragging: boolean
  openFilePicker: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
  onInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  addAsset: (asset: AssetRef) => Promise<{ url: string } | null>
  addFiles: (files: FileList | File[] | null | undefined) => void
  removeAttachment: (id: string) => void
  clearAttachments: () => void
  handlePaste: (event: React.ClipboardEvent) => void
  dragHandlers: {
    onDragEnter: (event: React.DragEvent) => void
    onDragOver: (event: React.DragEvent) => void
    onDragLeave: (event: React.DragEvent) => void
    onDrop: (event: React.DragEvent) => void
  }
}

// 把附件状态（来源可以是 store 或 useState）注入，hook 负责上传编排 + 拖拽/粘贴/选择三入口。
export function useComposerAttachments(opts: {
  attachments: ComposerAttachment[]
  setAttachments: SetAttachments
  /** A resident host may have moved this upload into a recovered draft while it awaited I/O. */
  settleAttachment?: (context: ProjectExecutionContext, id: string, update: (item: ComposerAttachment) => ComposerAttachment) => void
  onError?: (message: string) => void
}): UseComposerAttachments {
  const { setAttachments, settleAttachment, onError } = opts
  const inputRef = React.useRef<HTMLInputElement>(null)
  const attachmentsRef = React.useRef(opts.attachments)
  attachmentsRef.current = opts.attachments
  const [dragDepth, setDragDepth] = React.useState(0)
  const referenceImports = React.useRef(new Map<string, Promise<{ url: string } | null>>())
  const onErrorRef = React.useRef(onError)
  onErrorRef.current = onError

  const uploadOne = React.useCallback(async (id: string, file: File | AssetRef, context: ProjectExecutionContext) => {
    const settle = (update: (item: ComposerAttachment) => ComposerAttachment) => {
      if (settleAttachment) settleAttachment(context, id, update)
      else setAttachments(prev => !isProjectExecutionContextCurrent(context) ? prev
        : prev.map(item => item.id === id ? update(item) : item))
    }
    try {
      context.assertCurrent()
      const meta = { projectBinding: context.binding, assertCurrent: context.assertCurrent }
      const asset = 'origin' in file
        ? await importWorkbenchRemoteAssetUrl(file.renderUrl, file.name, meta)
        : await importWorkbenchLocalAssetFile(file, file.name, meta)
      context.assertCurrent()
      const url = readAssetUrl(asset)
      const contentHash = readAssetContentHash(asset)
      if (!asset.id || !url || !contentHash) throw new Error(i18n.t('runtime.attachments.uploadNoUrl'))
      const size = typeof asset.data.size === 'number' ? asset.data.size : undefined
      if (size !== undefined && size > COMPOSER_ATTACHMENT_MAX_BYTES) throw new Error(i18n.t('runtime.attachments.tooLarge', { name: file.name, limit: formatAttachmentSize(COMPOSER_ATTACHMENT_MAX_BYTES) }))
      settle(item => {
        if (item.previewUrl) {
          try { if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl) } catch { /* noop */ }
        }
        return { ...item, status: 'ready', assetId: asset.id, contentHash, version: 1, url, previewUrl: undefined, ...(size !== undefined ? { sizeBytes: size } : {}), ...(typeof asset.data.contentType === 'string' ? { contentType: asset.data.contentType, kind: attachmentKindFromContentType(asset.data.contentType) } : {}) }
      })
      return { url }
    } catch (caught: unknown) {
      if (!isProjectExecutionContextCurrent(context) || isProjectImportCancellation(caught)) {
        // The active composer belongs to another project now. Only its resident
        // owner can settle an original recovered claim; never append to a new input.
        settleAttachment?.(context, id, item => {
          if (item.previewUrl) { try { URL.revokeObjectURL(item.previewUrl) } catch { /* noop */ } }
          return { ...item, status: 'error', previewUrl: undefined, error: i18n.t('runtime.attachments.uploadFailed') }
        })
        return null
      }
      const message = caught instanceof Error ? caught.message : i18n.t('runtime.attachments.uploadFailed')
      settle(item => ({ ...item, status: 'error', error: message }))
      onErrorRef.current?.(i18n.t('runtime.attachments.uploadFailedWithName', { name: file.name, message }))
      return null
    }
  }, [setAttachments, settleAttachment])

  const addAsset = React.useCallback((selected: AssetRef) => {
    return withProjectAction(context => {
      context.assertCurrent()
      let asset = selected
      if (selected.origin.source === 'project') {
        if (selected.origin.projectId !== context.binding.projectId) throw new Error('project_agent_attachment_invalid')
      } else {
        const origin = selected.origin
        const node = useGenerationCanvasStore.getState().nodes.find(item => item.id === origin.nodeId)
        const current = node && canvasNodeToAssetRefs(node).find(item => item.origin.source === 'canvas' && item.origin.resultId === origin.resultId)
        const original = node && listNodeMediaResults(node).find(result => resultIdentity(result) === origin.resultId)
        if (!current || !original?.url || original.url !== selected.renderUrl || current.renderUrl !== selected.renderUrl) throw new Error('project_agent_attachment_invalid')
        asset = current
      }
      const source = `${context.binding.projectId}:${asset.renderUrl}`
      const referenceNode = asset.origin.source === 'canvas' && asset.origin.resultId
        ? { nodeId:asset.origin.nodeId, resultId:asset.origin.resultId, originalUrl:asset.renderUrl } : undefined
      const existing = attachmentsRef.current.find(item => item.referenceSource === source || item.url === asset.renderUrl)
      if (existing) {
        if (referenceNode) {
          const origins=existing.referenceNodes ?? (existing.referenceNode ? [existing.referenceNode] : [])
          if (!origins.some(origin=>origin.nodeId===referenceNode.nodeId && origin.resultId===referenceNode.resultId)) {
            const update=(items:ComposerAttachment[])=>items.map(item=>item.id===existing.id
              ? { ...item, referenceNode:item.referenceNode ?? referenceNode, referenceNodes:[...origins,referenceNode] } : item)
            attachmentsRef.current=update(attachmentsRef.current)
            setAttachments(update)
          }
        }
        return existing.status === 'ready' && existing.url ? Promise.resolve({ url: existing.url }) : referenceImports.current.get(existing.id) ?? Promise.resolve(null)
      }
      const id = nextAttachmentId()
      const attachment: ComposerAttachment = { id, referenceSource: source, fileName: asset.name,
        ...(referenceNode ? { referenceNode } : {}),
        contentType: `${asset.kind}/${asset.kind === 'image' ? 'png' : 'octet-stream'}`, sizeBytes: 0,
        kind: asset.kind === 'image' ? 'image' : 'file', status: 'uploading',
        previewUrl: asset.kind === 'image' ? asset.renderUrl : undefined }
      // Reserve synchronously: two picks before the next render must start one I/O.
      // Each new admission has its own id, so late I/O cannot settle a replacement.
      attachmentsRef.current = [...attachmentsRef.current, attachment]
      setAttachments(prev => isProjectExecutionContextCurrent(context) ? [...prev, attachment] : prev)
      const imported = uploadOne(id, asset, context).then(ready =>
        ready && isProjectExecutionContextCurrent(context) && attachmentsRef.current.some(item => item.id === id) ? ready : null)
        .finally(() => referenceImports.current.delete(id))
      referenceImports.current.set(id, imported)
      return imported
    }, () => Promise.resolve(null))
  }, [setAttachments, uploadOne])

  const addFiles = React.useCallback((files: FileList | File[] | null | undefined) => {
    const list = files ? Array.from(files) : []
    if (!list.length) return
    withProjectAction((context) => {
      const accepted: Array<{ id: string; file: File }> = []
      const nextAttachments: ComposerAttachment[] = []
      for (const file of list) {
        if (file.size > COMPOSER_ATTACHMENT_MAX_BYTES) {
          onErrorRef.current?.(
            i18n.t('runtime.attachments.tooLarge', {
              name: file.name,
              limit: formatAttachmentSize(COMPOSER_ATTACHMENT_MAX_BYTES),
            }),
          )
          continue
        }
        const id = nextAttachmentId()
        const kind = attachmentKindFromContentType(file.type)
        const previewUrl = kind === 'image' ? URL.createObjectURL(file) : undefined
        nextAttachments.push({
          id,
          fileName: file.name || 'asset',
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          kind,
          status: 'uploading',
          previewUrl,
        })
        accepted.push({ id, file })
      }
      if (!nextAttachments.length) return
      setAttachments((prev) => isProjectExecutionContextCurrent(context) ? [...prev, ...nextAttachments] : prev)
      for (const { id, file } of accepted) void uploadOne(id, file, context)
    })
  }, [setAttachments, uploadOne])

  const removeAttachment = React.useCallback((id: string) => {
    attachmentsRef.current = attachmentsRef.current.filter(item => item.id !== id)
    setAttachments((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target?.previewUrl) {
        try { URL.revokeObjectURL(target.previewUrl) } catch { /* noop */ }
      }
      return prev.filter((item) => item.id !== id)
    })
  }, [setAttachments])

  const clearAttachments = React.useCallback(() => {
    attachmentsRef.current = []
    setAttachments((prev) => {
      for (const item of prev) {
        if (item.previewUrl) {
          try { if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl) } catch { /* noop */ }
        }
      }
      return []
    })
  }, [setAttachments])

  const openFilePicker = React.useCallback(() => {
    inputRef.current?.click()
  }, [])

  const onInputChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(event.currentTarget.files)
    event.currentTarget.value = ''
  }, [addFiles])

  const handlePaste = React.useCallback((event: React.ClipboardEvent) => {
    const files = Array.from(event.clipboardData?.files || [])
    const images = files.filter((file) => file.type.startsWith('image/'))
    if (images.length) {
      event.preventDefault()
      addFiles(images)
    }
  }, [addFiles])

  const hasFiles = (event: React.DragEvent): boolean =>
    Array.from(event.dataTransfer?.types || []).includes('Files')

  const dragHandlers = {
    onDragEnter: (event: React.DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      setDragDepth((depth) => depth + 1)
    },
    onDragOver: (event: React.DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!hasFiles(event)) return
      setDragDepth((depth) => Math.max(0, depth - 1))
    },
    onDrop: (event: React.DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      setDragDepth(0)
      addFiles(event.dataTransfer?.files)
    },
  }

  return {
    isDragging: dragDepth > 0,
    openFilePicker,
    inputRef,
    onInputChange,
    addFiles,
    addAsset,
    removeAttachment,
    clearAttachments,
    handlePaste,
    dragHandlers,
  }
}
