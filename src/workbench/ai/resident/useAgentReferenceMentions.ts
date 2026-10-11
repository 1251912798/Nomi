import React from 'react'
import { dropKindFromFile } from '../../generationCanvas/model/nodeAssetDrop'
import type { Editor } from '@tiptap/react'
import { useAssetPool } from '../../assets/useAssetPool'
import { droppedMentionUrls, mentionUrlsInOrder } from '../../assets/promptMentions'
import { insertAssetMentionWhenReady } from '../../assets/insertAssetMentionWhenReady'
import type { AssetRef } from '../../assets/assetTypes'
import type { MentionSuggestionItem } from '../../assets/AssetMentionSuggestionList'
import { composerMediaReferences } from '../projectAgentAttachments'
import { contentToPrompt } from '../../assets/promptEditorContent'
import type { ComposerAttachment } from '../composer/composerAttachmentTypes'
import type { UseComposerAttachments } from '../composer/useComposerAttachments'

const kindOf = (item: ComposerAttachment) => dropKindFromFile({ type: item.contentType, name: item.fileName })
const isMedia = (item: ComposerAttachment) => kindOf(item) !== null

/** Agent owns draft/attachments; node PromptEditor owns the shared inline interaction. */
export function useAgentReferenceMentions({ projectId, conversationKey, attachments, api, draft, setDraft, onError }: {
  projectId: string | null; conversationKey: string; attachments: ComposerAttachment[]; api: UseComposerAttachments
  draft: string; setDraft: (value:string)=>void; onError:(message:string)=>void
}) {
  const { assets, refresh } = useAssetPool(projectId)
  const readyAssetsKey = attachments.filter(item=>item.status==='ready').map(item=>item.assetId).join('|')
  // This mounted @ consumer must refresh the existing pool when an admission
  // finishes; deleting its inline mention does not delete the project original.
  React.useEffect(() => { refresh?.() }, [readyAssetsKey, refresh])
  const editorRef = React.useRef<Editor | null>(null)
  const lifetime = React.useRef(conversationKey)
  lifetime.current = conversationKey
  const pendingSources = React.useRef(new Map<string,number>())
  const [admissionRevision, bumpAdmission] = React.useReducer((value:number)=>value+1,0)
  const references = React.useMemo(() => composerMediaReferences(attachments), [attachments])
  const referencesRef = React.useRef(references); referencesRef.current = references
  const select = React.useCallback((asset:AssetRef) => {
    const key = lifetime.current
    const source = `${projectId}:${asset.renderUrl}`
    pendingSources.current.set(source,(pendingSources.current.get(source) ?? 0)+1)
    const release = () => {
      const remaining=(pendingSources.current.get(source) ?? 1)-1
      if (remaining) pendingSources.current.set(source,remaining)
      else pendingSources.current.delete(source)
      bumpAdmission()
    }
    try {
      return api.addAsset(asset).then(ready => {
        if (!ready || lifetime.current!==key) { release(); return null }
        const reference = referencesRef.current.find(item=>item.url===ready.url)
        // Keep recovery suspended until the shared editor insertion settles.
        return { url:ready.url, index:reference?.index ?? 1, onSettled:release }
      }, error => { release(); onError(error instanceof Error ? error.message : String(error)); return null })
    } catch (error) { release(); onError(error instanceof Error ? error.message : String(error)); return Promise.resolve(null) }
  }, [api, onError, projectId])
  const addReference = React.useCallback((asset:AssetRef) => {
    const editor = editorRef.current
    if (editor && !editor.isDestroyed && asset.kind!=='model3d') insertAssetMentionWhenReady(editor, select(asset), asset.kind)
  }, [select])
  const mentionSearch = React.useCallback((query:string):MentionSuggestionItem[] => {
    const current: MentionSuggestionItem[] = attachments.flatMap(item=>{
      const kind = kindOf(item)
      if (item.status!=='ready' || !item.url || !kind) return []
      return [{ key:item.id, url:item.url, label:item.fileName, kind, group:'current' as const,
        index:(references.find(reference=>reference.url===item.url)?.index ?? 1)-1 }]
    })
    const urls = new Set(current.map(item=>item.url))
    const available: MentionSuggestionItem[] = assets.filter(asset=>asset.kind!=='model3d' && !urls.has(asset.renderUrl)).map(asset=>({
      key:asset.id, url:asset.renderUrl, label:asset.name, kind:asset.kind as 'image'|'video'|'audio', thumbnailUrl:asset.thumbUrl,
      group:asset.source==='canvas' ? 'canvas':'library',
    }))
    const q=query.trim().toLowerCase()
    return [...current,...available].filter(item=>!q||item.label.toLowerCase().includes(q)).slice(0,24)
  }, [assets, attachments, references])
  const onMentionSelect = React.useCallback((item:MentionSuggestionItem) => {
    if (item.group==='current') return (item.index ?? 0)+1
    const asset=assets.find(candidate=>candidate.id===item.key)
    return asset ? select(asset) : null
  }, [assets, select])
  const onChange = React.useCallback((next:string, previous = draft) => {
    for (const url of droppedMentionUrls(previous,next)) {
      for (const attachment of attachments) if (attachment.url===url && isMedia(attachment)) api.removeAttachment(attachment.id)
    }
    setDraft(next)
  }, [draft, attachments, api, setDraft])
  // Upload/paste/drop keep their existing admission; completed media become the same atoms.
  React.useEffect(() => {
    const editor=editorRef.current
    if (!editor || editor.isDestroyed) return
    for (const item of attachments) {
      const kind = kindOf(item)
      if ((item.referenceSource && pendingSources.current.has(item.referenceSource)) || pendingSources.current.has(`${projectId}:${item.url}`) || item.status!=='ready' || !item.url || !kind) continue
      // Draft props can lag an async insertion. The mounted editor owns presence.
      if (mentionUrlsInOrder(contentToPrompt(editor.getJSON())).includes(item.url)) continue
      editor.commands.insertAssetMention(item.url, references.find(reference=>reference.url===item.url)?.index, kind)
    }
  }, [attachments, references, draft, admissionRevision, conversationKey, projectId])
  return { editorRef, addReference, mentionSearch, onMentionSelect, references, onChange,
    onReady: React.useCallback((editor:Editor)=>{ editorRef.current=editor; bumpAdmission() }, []),
    hiddenAttachmentIds: new Set(attachments.filter(item=>isMedia(item) && item.status==='ready' && item.url && mentionUrlsInOrder(draft).includes(item.url)).map(item=>item.id)) }
}
