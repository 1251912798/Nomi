import { describe, expect, it } from 'vitest'
import type { ComposerAttachment } from '../composer/composerAttachmentTypes'
import type { GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'
import { encodeMention } from '../../assets/promptMentions'
import { agentReferenceContext } from './agentReferenceContext'

const node = (id:string, url:string):GenerationCanvasNode => ({ id,kind:'image',title:`Title ${id}`,position:{x:0,y:0},
  result:{id:`result-${id}`,type:'image',url,createdAt:1} })
const attachment = (id:string, source:GenerationCanvasNode):ComposerAttachment => ({
  id:`view-${id}`,assetId:`asset-${id}`,version:1,contentHash:'a'.repeat(64),fileName:`${id}.png`,
  contentType:'image/png',sizeBytes:12,kind:'image',status:'ready',url:`nomi-local://asset/project/assets/${id}.png`,
  referenceNode:{nodeId:source.id,resultId:source.result!.id!,originalUrl:source.result!.url!},
})

describe('Agent inline original references provide explicit read-only canvas locators',()=>{
  it('maps two clause references to their original nodes using canonical send numbering',()=>{
    const first=node('node-a','https://original.invalid/a.png')
    const second=node('node-b','https://original.invalid/b.png')
    const a=attachment('a',first), b=attachment('b',second)
    const prompt=`Change ${encodeMention(b.url!)} then preserve ${encodeMention(a.url!)}`
    const handles=agentReferenceContext([a,b],prompt,[first,second],17)
    expect(handles).toEqual([
      {id:'reference:asset-a:node:node-a',kind:'canvasNode',targetId:'node-a',revision:'17',
        locator:{type:'canvasSelection',nodeIds:['node-a']},display:{title:'@image1 · Title node-a'},intentRole:'source'},
      {id:'reference:asset-b:node:node-b',kind:'canvasNode',targetId:'node-b',revision:'17',
        locator:{type:'canvasSelection',nodeIds:['node-b']},display:{title:'@image2 · Title node-b'},intentRole:'source'},
    ])
    expect(handles.every(handle=>handle.intentRole==='source')).toBe(true)
  })

  it('does not misidentify removed nodes, replaced result ids, or changed original bytes addresses',()=>{
    const source=node('node-a','original-a.png'), a=attachment('a',source)
    const prompt=encodeMention(a.url!)
    expect(agentReferenceContext([a],prompt,[],17)).toEqual([])
    expect(agentReferenceContext([a],prompt,[{...source,result:{...source.result!,id:'new-result'}}],17)).toEqual([])
    expect(agentReferenceContext([a],prompt,[{...source,result:{...source.result!,url:'replacement.png'}}],17)).toEqual([])
  })

  it('retains an exact historical result locator while the main image changes',()=>{
    const source=node('node-a','historical.png'), a=attachment('a',source)
    const current:GenerationCanvasNode={...source,result:{id:'new-result',type:'image',url:'main.png',createdAt:2},history:[source.result!]}
    expect(agentReferenceContext([a],encodeMention(a.url!),[current],18)).toMatchObject([
      {targetId:'node-a',display:{title:'@image1 · Title node-a'},intentRole:'source'},
    ])
  })

  it('requires a real inline mention and ready canonical media rather than inferring a node from a label',()=>{
    const source=node('node-a','original-a.png'), a=attachment('a',source)
    expect(agentReferenceContext([a],'change node-a',[source],17)).toEqual([])
    expect(agentReferenceContext([{...a,status:'uploading'}],encodeMention(a.url!),[source],17)).toEqual([])
    expect(agentReferenceContext([{...a,assetId:undefined}],encodeMention(a.url!),[source],17)).toEqual([])
    expect(agentReferenceContext([{...a,referenceNode:undefined}],encodeMention(a.url!),[source],17)).toEqual([])
  })
})
