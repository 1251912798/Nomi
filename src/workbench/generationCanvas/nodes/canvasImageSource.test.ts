// 画布图片组件只吃「预览」：独立小图 → preview；源已有界 → bounded-source；其余（明确缺失 / 没有事实 /
// thumbnailUrl = url 的旧形状）只能走「预览缺失」分支，并按地址去重计数。
import { beforeEach, describe, expect, it } from 'vitest'
import {
  canvasImageSourceOf,
  canvasOriginalImageStats,
  canvasVideoPosterOf,
  resetCanvasImageSourceStatsForTests,
  resolveCanvasImageSource,
} from './canvasImageSource'
import { resolveLightweightNodePreview } from '../components/canvasNodeLevelOfDetail'
import { nodeVersionEntries } from './versionCards/nodeVersionEntries'
import type { GenerationCanvasNode, GenerationNodeResult } from '../model/generationCanvasTypes'
import type { DeferredNodeImageProps } from './DeferredNodeMedia'

const SRC = 'nomi-local://asset/p1/assets/a.png'
const PREVIEW = 'nomi-local://asset/p1/assets/a.preview.jpg'

function image(partial: Partial<GenerationNodeResult> = {}): GenerationNodeResult {
  return { id: 'r', type: 'image', url: SRC, createdAt: 0, ...partial }
}

beforeEach(() => resetCanvasImageSourceStatsForTests())

describe('resolveCanvasImageSource', () => {
  it('独立小图 → preview；源已有界 → bounded-source；都不计数', () => {
    expect(resolveCanvasImageSource(image({ thumbnailUrl: PREVIEW, previewState: 'ready' }))).toEqual({ src: PREVIEW, kind: 'preview' })
    expect(resolveCanvasImageSource(image({ previewState: 'source' }))).toEqual({ src: SRC, kind: 'bounded-source' })
    expect(canvasOriginalImageStats()).toEqual({ missing: 0, unknown: 0, total: 0 })
  })

  it('thumbnailUrl = url 不是预览：和没有事实一样走缺失分支并计数；同一张图重渲多少次只算一张', () => {
    expect(resolveCanvasImageSource(image({ thumbnailUrl: SRC }))).toEqual({ src: SRC, kind: 'missing-preview' })
    resolveCanvasImageSource(image())
    resolveCanvasImageSource(image({ url: 'nomi-local://asset/p1/assets/b.png', previewState: 'missing' }))
    expect(canvasOriginalImageStats()).toEqual({ missing: 1, unknown: 1, total: 2 })
  })

  it('不是图片 / 没有地址 → null；视频封面只认独立小图', () => {
    expect(canvasImageSourceOf({ type: 'video', url: 'v.mp4' })).toBeNull()
    expect(canvasImageSourceOf(image({ url: '' }))).toBeNull()
    expect(canvasVideoPosterOf({ type: 'video', url: 'v.mp4', thumbnailUrl: 'v.preview.jpg' })).toBe('v.preview.jpg')
    expect(canvasVideoPosterOf({ type: 'video', url: 'v.mp4', thumbnailUrl: 'v.mp4' })).toBeNull()
  })
})

describe('画布上画图的地方都经过它（轻量卡 / 版本卡）', () => {
  it('轻量卡：旧形状 thumbnailUrl = url 被计为原图，有小图的挂小图', () => {
    expect(resolveLightweightNodePreview({ result: image({ thumbnailUrl: PREVIEW, previewState: 'ready' }) })).toEqual({ kind: 'image', src: PREVIEW })
    expect(resolveLightweightNodePreview({ result: image({ thumbnailUrl: SRC }) })).toEqual({ kind: 'image', src: SRC })
    expect(canvasOriginalImageStats().total).toBe(1)
  })

  it('版本卡：每一版都只挂预览，原图版本计数', () => {
    const node = {
      id: 'n', kind: 'image', title: 'n', categoryId: 'canvas', position: { x: 0, y: 0 },
      result: image({ id: 'v2', versionNo: 2, url: 'nomi-local://asset/p1/assets/v2.png', thumbnailUrl: 'nomi-local://asset/p1/assets/v2.preview.jpg', previewState: 'ready' }),
      history: [image({ id: 'v1', versionNo: 1, url: 'nomi-local://asset/p1/assets/v1.png' })],
    } as unknown as GenerationCanvasNode
    const entries = nodeVersionEntries(node)
    expect(entries.map((entry) => entry.previewUrl)).toEqual(expect.arrayContaining(['nomi-local://asset/p1/assets/v2.preview.jpg', 'nomi-local://asset/p1/assets/v1.png']))
    expect(canvasOriginalImageStats()).toEqual({ missing: 0, unknown: 1, total: 1 })
  })
})

describe('画布图片组件只收品牌类型（类型层，check:test-types 守）', () => {
  it('裸字符串传不进 DeferredNodeImage；只有 canvasImageSource 造出来的能', () => {
    // @ts-expect-error 裸字符串不是 CanvasImageSource：原图冒充预览在类型上写不出来
    const raw: DeferredNodeImageProps = { src: SRC }
    const branded: DeferredNodeImageProps = { src: canvasImageSourceOf(image({ thumbnailUrl: PREVIEW, previewState: 'ready' }))! }
    expect([raw.src, branded.src]).toEqual([SRC, PREVIEW])
  })
})

