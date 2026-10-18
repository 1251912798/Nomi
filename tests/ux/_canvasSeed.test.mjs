// 「现行格式种子」守门的判据：直接用生产谓词，缺预览事实 / 远端 URL 都算会被后台改写。
import { describe, expect, it } from 'vitest'
import { assertCurrentFormatCanvasSeed, backgroundRewrittenEntries } from './_canvasSeed.mjs'

const local = 'nomi-local://asset/p/assets/generated/a.jpg'

describe('assertCurrentFormatCanvasSeed', () => {
  it('缺预览事实的本地图（result 与 history 各自）会被点名', () => {
    expect(backgroundRewrittenEntries([{ id: 'n', result: { type: 'image', url: local }, history: [{ type: 'video', url: local }] }]))
      .toEqual([
        'n.result：缺预览事实（previewState / thumbnailUrl），打开后会被后台补写',
        'n.history[0]：缺预览事实（previewState / thumbnailUrl），打开后会被后台补写',
      ])
  })
  it('远端 URL 会被点名（打开后转存到本地）', () => {
    expect(backgroundRewrittenEntries([{ id: 'n', result: { type: 'image', url: 'https://cdn.example/a.jpg' } }])).toHaveLength(1)
  })
  it('带预览事实的本地结果、文本结果、没有结果的节点都算现行格式', () => {
    expect(() => assertCurrentFormatCanvasSeed([
      { id: 'a', result: { type: 'image', url: local, previewState: 'source' } },
      { id: 'b', result: { type: 'image', url: local, thumbnailUrl: 'nomi-local://asset/p/.nomi/previews/a.webp' } },
      { id: 'c', result: { type: 'text', url: '' } },
      { id: 'd' },
    ])).not.toThrow()
  })
  it('不合格时报错里带标签和位置', () => {
    expect(() => assertCurrentFormatCanvasSeed([{ id: 'n', result: { type: 'image', url: local } }], 'C19 种子')).toThrow(/C19 种子不是现行格式[\s\S]*n\.result/)
  })
})
