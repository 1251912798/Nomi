import { describe, expect, it } from 'vitest'
import type { GenerationCanvasEdge, GenerationCanvasNode } from '../generationCanvas/model/generationCanvasTypes'
import { clipReferenceName, dedupeChipNames, nameFromUrl, resolveReferenceInfos } from './referenceNames'

describe('引用块的名字', () => {
  it('最多 8 个字，重名加 ·N', () => {
    expect(clipReferenceName('一二三四五六七八九十')).toBe('一二三四五六七八…')
    expect(dedupeChipNames(['树林', '海边', '树林', '树林'])).toEqual(['树林', '海边', '树林·2', '树林·3'])
  })

  it('url 文件名当兜底名，去扩展名', () => {
    expect(nameFromUrl('http://x/a/%E6%A0%91%E6%9E%97.svg')).toBe('树林')
  })

  it('连线来的图叫节点标题、来源是画布节点、× 是断开连线；别的是素材库 / 上传', () => {
    const source = { id: 's', kind: 'image', title: '女主肖像', result: { id: 'r', type: 'image', url: 'http://x/p.png', createdAt: 1 } } as GenerationCanvasNode
    const edges = [{ id: 'e', source: 's', target: 't', mode: 'reference' }] as GenerationCanvasEdge[]
    const library = [{ id: 'l', kind: 'image', name: '海边小镇', renderUrl: 'http://x/sea.png', source: 'project', origin: { source: 'project', projectId: 'p', relativePath: 'sea.png' } }] as never
    const infos = resolveReferenceInfos({
      nodeId: 't',
      references: [{ url: 'http://x/p.png', kind: 'image' }, { url: 'http://x/sea.png', kind: 'image' }, { url: 'http://x/up.png', kind: 'image' }],
      nodes: [source], edges, library, fallbackName: () => '参考图',
    })
    expect(infos.get('http://x/p.png')).toMatchObject({ name: '女主肖像', source: 'canvas', fromEdge: true })
    expect(infos.get('http://x/sea.png')).toMatchObject({ name: '海边小镇', source: 'library', fromEdge: false })
    expect(infos.get('http://x/up.png')).toMatchObject({ name: 'up', source: 'upload' })
  })
})
