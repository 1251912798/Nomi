import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssetRef } from '../../assets/assetTypes'
import type { GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'
import type { ComposerAttachment } from './composerAttachmentTypes'
import type { Editor } from '@tiptap/react'
import { encodeMention } from '../../assets/promptMentions'
import { promptToContent } from '../../assets/promptEditorContent'

const fixture = vi.hoisted(() => ({
  projectId: 'project-a', nodes: [] as unknown[], remote: vi.fn(), local: vi.fn(),
}))
vi.mock('../../assets/useAssetPool', () => ({ useAssetPool: () => ({ assets: [] }) }))
vi.mock('../../../i18n', () => ({ default: { t: (key: string) => key } }))
vi.mock('../../api/assetUploadApi', () => ({ importWorkbenchRemoteAssetUrl: fixture.remote, importWorkbenchLocalAssetFile: fixture.local }))
vi.mock('../../generationCanvas/store/generationCanvasStore', () => ({ useGenerationCanvasStore: { getState: () => ({ nodes: fixture.nodes }) } }))
vi.mock('../../project/projectCanvasReadSurface', () => ({
  withProjectAction: (run: (context: object) => unknown) => {
    const projectId = fixture.projectId
    return run({ binding: { projectId, immutableProjectUuid: projectId }, assertCurrent: () => {
      if (fixture.projectId !== projectId) throw new Error('project_changed')
    } })
  },
  isProjectExecutionContextCurrent: (context: { binding: { projectId: string } }) => context.binding.projectId === fixture.projectId,
  isProjectImportCancellation: () => false,
}))

import { useComposerAttachments, type UseComposerAttachments } from './useComposerAttachments'
import { useAgentReferenceMentions } from '../resident/useAgentReferenceMentions'

type Receipt = { id: string; data: { url: string; contentHash: string; contentType: string; size: number } }
function deferred() {
  let resolve!: (receipt: Receipt) => void
  const promise = new Promise<Receipt>(accept => { resolve = accept })
  return { promise, resolve }
}
function receipt(id: string, projectId = 'project-a'): Receipt {
  return { id, data: { url: `nomi-local://asset/${projectId}/assets/${id}.png`, contentHash: 'a'.repeat(64), contentType: 'image/png', size: 12 } }
}
function projectAsset(projectId = 'project-a'): AssetRef {
  return { id: 'assets/original.png', name: 'original.png', kind: 'image', source: 'project',
    renderUrl: `nomi-local://asset/${projectId}/assets/original.png`, origin: { source: 'project', projectId, relativePath: 'assets/original.png' } }
}

// Mount a real React hook without rendering DOM nodes. This is the repository's
// existing null-host ReactDOM pattern; it is not Electron/provider evidence.
function browserContainer() {
  const document = { nodeType: 9, documentElement: { namespaceURI: 'http://www.w3.org/1999/xhtml' },
    addEventListener: () => undefined, removeEventListener: () => undefined,
    defaultView: null as unknown, activeElement: null as unknown }
  class HTMLElement {}
  class HTMLIFrameElement extends HTMLElement {}
  const window = { document, HTMLElement, HTMLIFrameElement, addEventListener: () => undefined,
    removeEventListener: () => undefined, localStorage: { getItem: () => null }, setInterval, clearInterval }
  document.defaultView = window
  const container = { nodeType: 1, nodeName: 'DIV', tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: document, addEventListener: () => undefined, removeEventListener: () => undefined, firstChild: null } as unknown as globalThis.HTMLElement
  document.activeElement = container
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  return container
}

describe('composer reference admission and delayed settlement', () => {
  let root: Root
  let api: UseComposerAttachments
  let attachments: ComposerAttachment[]
  let replace: React.Dispatch<React.SetStateAction<ComposerAttachment[]>>
  function Harness() {
    const [items, setItems] = React.useState<ComposerAttachment[]>([])
    attachments = items; replace = setItems
    api = useComposerAttachments({ attachments: items, setAttachments: setItems })
    return null
  }
  beforeEach(async () => {
    fixture.projectId = 'project-a'; fixture.nodes = []
    fixture.remote.mockReset(); fixture.local.mockReset()
    root = createRoot(browserContainer())
    await act(async () => root.render(<Harness />))
  })
  afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals() })

  it('reserves a reference before rerender so consecutive picks import once', async () => {
    const pending = deferred(); fixture.remote.mockReturnValue(pending.promise)
    await act(async () => { api.addAsset(projectAsset()); api.addAsset(projectAsset()) })
    expect(fixture.remote).toHaveBeenCalledTimes(1)
    expect(attachments).toHaveLength(1)
    expect(attachments[0].status).toBe('uploading')
    await act(async () => pending.resolve(receipt('original')))
    expect(attachments[0]).toMatchObject({ status: 'ready', assetId: 'original', contentHash: 'a'.repeat(64), sizeBytes: 12 })
  })

  it('isolates delete-and-reselect from the first admission late completion', async () => {
    const first = deferred(); const second = deferred()
    fixture.remote.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    let firstAdmission!: ReturnType<UseComposerAttachments['addAsset']>
    await act(async () => { firstAdmission = api.addAsset(projectAsset()) })
    const previousId = attachments[0].id
    let secondAdmission!: ReturnType<UseComposerAttachments['addAsset']>
    await act(async () => { api.removeAttachment(previousId); secondAdmission = api.addAsset(projectAsset()) })
    expect(fixture.remote).toHaveBeenCalledTimes(2)
    expect(attachments).toHaveLength(1)
    expect(attachments[0].id).not.toBe(previousId)
    await act(async () => { first.resolve(receipt('old-completion')); await firstAdmission })
    expect(attachments[0]).toMatchObject({ status: 'uploading' })
    expect(attachments[0].assetId).toBeUndefined()
    await act(async () => { second.resolve(receipt('new-completion')); await secondAdmission })
    expect(attachments[0]).toMatchObject({ status: 'ready', assetId: 'new-completion' })
  })

  it('does not settle project A delayed I/O into project B input', async () => {
    const first = deferred(); const second = deferred()
    fixture.remote.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    let firstAdmission!: ReturnType<UseComposerAttachments['addAsset']>
    await act(async () => { firstAdmission = api.addAsset(projectAsset()) })
    fixture.projectId = 'project-b'
    await act(async () => replace([]))
    let secondAdmission!: ReturnType<UseComposerAttachments['addAsset']>
    await act(async () => { secondAdmission = api.addAsset(projectAsset('project-b')) })
    const nextId = attachments[0].id
    await act(async () => { first.resolve(receipt('old-completion')); await firstAdmission })
    expect(attachments).toHaveLength(1)
    expect(attachments[0]).toMatchObject({ id: nextId, status: 'uploading' })
    await act(async () => { second.resolve(receipt('next-original', 'project-b')); await secondAdmission })
    expect(attachments[0]).toMatchObject({ id: nextId, status: 'ready', assetId: 'next-original' })
  })

  it('keeps verified canvas provenance when selecting an already uploaded canonical original', async () => {
    const url = projectAsset().renderUrl
    await act(async () => { replace([{id:'existing-upload',assetId:'canonical-a',version:1,contentHash:'a'.repeat(64),
      fileName:'original.png',contentType:'image/png',sizeBytes:12,kind:'image',status:'ready',url}]) })
    fixture.nodes = [{id:'node-a',kind:'image',title:'A',position:{x:0,y:0},result:{id:'result-a',type:'image',url,createdAt:1}}]
    await act(async () => { await api.addAsset({id:'node-a:result-a',name:'A',kind:'image',source:'canvas',renderUrl:url,
      origin:{source:'canvas',nodeId:'node-a',resultId:'result-a'}}) })
    expect(fixture.remote).not.toHaveBeenCalled()
    expect(attachments).toHaveLength(1)
    expect(attachments[0].referenceNode).toEqual({nodeId:'node-a',resultId:'result-a',originalUrl:url})
  })

  it('rejects poster-only and stale canvas results before import', async () => {
    const node: GenerationCanvasNode = { id: 'node-a', kind: 'image', title: 'A', position: { x: 0, y: 0 },
      result: { id: 'result-a', type: 'image', createdAt: 1, thumbnailUrl: 'nomi-local://asset/project-a/assets/poster.png' } }
    fixture.nodes = [node]
    const selected: AssetRef = { id: 'node-a:result-a', name: 'A', kind: 'image', source: 'canvas',
      renderUrl: node.result!.thumbnailUrl!, origin: { source: 'canvas', nodeId: 'node-a', resultId: 'result-a' } }
    expect(() => api.addAsset(selected)).toThrow('project_agent_attachment_invalid')
    fixture.nodes = [{ ...node, result: { ...node.result, url: 'nomi-local://asset/project-a/assets/replacement.png' } }]
    expect(() => api.addAsset(selected)).toThrow('project_agent_attachment_invalid')
    expect(attachments).toHaveLength(0)
    expect(fixture.remote).not.toHaveBeenCalled()
  })

  it('imports the chosen history original instead of the current main result', async () => {
    const mainUrl = 'nomi-local://asset/project-a/assets/main.png'
    const chosenUrl = 'nomi-local://asset/project-a/assets/history.png'
    fixture.nodes = [{ id: 'node-a', kind: 'image', title: 'A', position: { x: 0, y: 0 },
      result: { id: 'main', type: 'image', createdAt: 2, url: mainUrl }, history: [{ id: 'old', type: 'image', createdAt: 1, url: chosenUrl }] }]
    const pending = deferred(); fixture.remote.mockReturnValue(pending.promise)
    let admission!: ReturnType<UseComposerAttachments['addAsset']>
    await act(async () => { admission = api.addAsset({ id: 'node-a:old', name: 'A', kind: 'image', source: 'canvas', renderUrl: chosenUrl,
      origin: { source: 'canvas', nodeId: 'node-a', resultId: 'old' } }) })
    expect(fixture.remote.mock.calls[0][0]).toBe(chosenUrl)
    await act(async () => { pending.resolve(receipt('chosen-history')); await admission })
    expect(attachments[0]).toMatchObject({ status: 'ready', assetId: 'chosen-history' })
  })
})


// Real React hook lifecycle, with an editor command host only. This does not
// assert Tiptap DOM/bookmark behavior; the production Electron walk owns that.
describe('inline reference recovery visibility', () => {
  type Buffer = { conversationKey:string; draft:string; attachments:ComposerAttachment[] }
  let root:Root
  let buffer:Buffer
  let update:React.Dispatch<React.SetStateAction<Buffer>>
  let mentions:ReturnType<typeof useAgentReferenceMentions>
  let pending:{promise:Promise<{url:string}|null>; resolve:(result:{url:string}|null)=>void}
  let inserted:ReturnType<typeof vi.fn>
  let liveDraft:string
  let holdEcho:boolean
  const original = projectAsset()
  const ready:ComposerAttachment = { id:'source-instance', assetId:'canonical-a', version:1, contentHash:'a'.repeat(64),
    fileName:'a.png', contentType:'image/png', sizeBytes:12, kind:'image', status:'ready', url:original.renderUrl,
    referenceSource:`project-a:${original.renderUrl}` }
  function Harness() {
    const [current,setCurrent] = React.useState<Buffer>({conversationKey:'A',draft:'A draft ',attachments:[]})
    buffer=current; update=setCurrent
    const api = React.useMemo(() => ({addAsset:()=>pending.promise, removeAttachment:(id:string)=>setCurrent(previous=>({...previous,attachments:previous.attachments.filter(item=>item.id!==id)}))}) as UseComposerAttachments,[])
    mentions=useAgentReferenceMentions({projectId:'project-a',conversationKey:current.conversationKey,
      draft:current.draft,attachments:current.attachments,api,setDraft:value=>setCurrent(previous=>({...previous,draft:value})),onError:()=>undefined})
    React.useLayoutEffect(() => { if (!holdEcho) liveDraft=current.draft },[current.draft])
    React.useLayoutEffect(() => {
      const bookmark = {map:()=>bookmark,resolve:()=>({from:0})}
      const insert = (url:string) => { inserted(url); liveDraft+=encodeMention(url); if (!holdEcho) mentions.onChange(liveDraft) }
      const editor={isDestroyed:false,getJSON:()=>promptToContent(liveDraft),on:()=>undefined,off:()=>undefined,state:{selection:{getBookmark:()=>bookmark},doc:{}},
        commands:{insertAssetMention:insert,insertContentAt:(_position:number,node:{attrs:{url:string}})=>insert(node.attrs.url)}} as unknown as Editor
      mentions.onReady(editor)
    },[])
    return null
  }
  beforeEach(async()=>{
    let resolve!:(result:{url:string}|null)=>void
    const promise=new Promise<{url:string}|null>(done=>{resolve=done})
    pending={promise,resolve}; inserted=vi.fn(); liveDraft='A draft ';holdEcho=false
    root=createRoot(browserContainer())
    await act(async()=>{root.render(<Harness/> )})
  })
  afterEach(async()=>{await act(async()=>root.unmount());vi.unstubAllGlobals()})

  it('does not insert into B after A admission completes, then restores A ready reference inline',async()=>{
    await act(async()=>{mentions.addReference(original)})
    await act(async()=>{update({conversationKey:'B',draft:'B untouched',attachments:[]})})
    await act(async()=>{pending.resolve({url:original.renderUrl});await pending.promise})
    expect(buffer.draft).toBe('B untouched')
    expect(inserted).not.toHaveBeenCalled()
    await act(async()=>{update({conversationKey:'A',draft:'A draft ',attachments:[ready]})})
    expect(buffer.draft).toBe(`A draft ${encodeMention(original.renderUrl)}`)
    expect(inserted).toHaveBeenCalledTimes(1)
    expect(mentions.hiddenAttachmentIds.has(ready.id)).toBe(true)
  })

  it('restores a ready media inline atom after external draft replacement',async()=>{
    await act(async()=>{update(previous=>({...previous,attachments:[ready]}))})
    expect(buffer.draft).toContain(encodeMention(original.renderUrl))
    await act(async()=>{update(previous=>({...previous,draft:'Replacement instruction'}))})
    expect(buffer.attachments).toEqual([ready])
    expect(buffer.draft).toBe(`Replacement instruction${encodeMention(original.renderUrl)}`)
    expect(inserted).toHaveBeenCalledTimes(2)
    expect(mentions.hiddenAttachmentIds.has(ready.id)).toBe(true)
  })

  it('does not duplicate an already inserted atom while its owner echo is delayed',async()=>{
    holdEcho=true
    await act(async()=>{update(previous=>({...previous,attachments:[ready]}))})
    expect(inserted).toHaveBeenCalledTimes(1)
    expect(buffer.draft).toBe('A draft ')
    await act(async()=>{update(previous=>({...previous,attachments:[{...ready}]}))})
    expect(inserted).toHaveBeenCalledTimes(1)
    expect(liveDraft).toBe(`A draft ${encodeMention(original.renderUrl)}`)
  })

  it('releases deleted live references before the owner has echoed their insertion',async()=>{
    holdEcho=true
    await act(async()=>{update(previous=>({...previous,attachments:[ready]}))})
    expect(buffer.draft).toBe('A draft ')
    const previous = liveDraft
    liveDraft=''
    await act(async()=>{mentions.onChange('',previous)})
    expect(buffer.attachments).toEqual([])
    expect(liveDraft).toBe('')
    expect(inserted).toHaveBeenCalledTimes(1)
  })

  it('waits for explicit insertion when canonical upload dedup has no referenceSource',async()=>{
    await act(async()=>{
      mentions.addReference(original)
      update(previous=>({...previous,attachments:[{...ready,referenceSource:undefined}]}))
    })
    expect(inserted).not.toHaveBeenCalled()
    await act(async()=>{pending.resolve({url:original.renderUrl});await pending.promise})
    expect(inserted).toHaveBeenCalledTimes(1)
    expect(buffer.draft).toBe(`A draft ${encodeMention(original.renderUrl)}`)
  })
})
