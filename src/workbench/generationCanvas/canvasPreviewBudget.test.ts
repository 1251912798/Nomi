// 画布预览 · 确定性计数（本波打法：A 类修复用数得清的东西证明，不靠在挤满的机器上测毫秒）。
//
// 夹具与 C-dense 同规模：120 张 2048×3072 原图，预览 682×1024。数两样：画布走「预览缺失」分支的原图张数、
// 画布要解码的总像素。修前形状（旧项目：没有预览事实 / thumbnailUrl = url；制作流程与图片编辑：只有 url）
// 全部走原图；经补预览写回（backfilledPreviewPatch，与生产同一条投影）后全部走小图。
import { beforeEach, describe, expect, it } from 'vitest'
import { canvasOriginalImageStats, resetCanvasImageSourceStatsForTests, resolveCanvasImageSource } from './nodes/canvasImageSource'
import { backfilledPreviewPatch } from './resultMediaBackfillBridge'
import type { GenerationNodeResult } from './model/generationCanvasTypes'

const ORIGINAL = { width: 2048, height: 3072 }
const PREVIEW = { width: 682, height: 1024 }
const COUNT = 120

function legacyShapes(): GenerationNodeResult[] {
  return Array.from({ length: COUNT }, (_, index) => {
    const url = `nomi-local://asset/p1/assets/generated/shot-${index}.jpg`
    // 三种修前形状轮流出现：没有字段（制作流程 / 图片编辑）、thumbnailUrl = url（图片 fallback）、视频以外的普通图。
    const legacy = index % 2 === 0 ? {} : { thumbnailUrl: url }
    return { id: `r${index}`, type: 'image' as const, url, createdAt: 0, ...legacy }
  })
}

function decodedPixels(results: readonly GenerationNodeResult[]): number {
  return results.reduce((sum, result) => {
    const resolved = resolveCanvasImageSource(result)
    if (!resolved) return sum
    const size = resolved.kind === 'preview' ? PREVIEW : ORIGINAL
    return sum + size.width * size.height
  }, 0)
}

beforeEach(() => resetCanvasImageSourceStatsForTests())

describe('120 张 2048×3072 的画布：原图张数与解码像素', () => {
  it('修前形状：120 张全走原图，解码约 755 MP', () => {
    const pixels = decodedPixels(legacyShapes())
    expect(canvasOriginalImageStats()).toEqual({ missing: 0, unknown: COUNT, total: COUNT })
    expect(pixels).toBe(COUNT * ORIGINAL.width * ORIGINAL.height)
    expect(Math.round(pixels / 1e6)).toBe(755)
  })

  it('补预览写回后：0 张原图，解码约 84 MP（约 1/9）', () => {
    const repaired = legacyShapes().map((result) => backfilledPreviewPatch(result, {
      thumbnailUrl: String(result.url).replace(/\.jpg$/, '.preview.jpg'),
      previewState: 'ready',
    })!)
    const pixels = decodedPixels(repaired)
    expect(canvasOriginalImageStats().total).toBe(0)
    expect(pixels).toBe(COUNT * PREVIEW.width * PREVIEW.height)
    expect(Math.round(pixels / 1e6)).toBe(84)
  })
})
