import { beforeEach, describe, expect, it } from 'vitest'
import { useGenerationCanvasStore } from './generationCanvasStore'
import { resolveNodeVisualSize } from '../nodes/nodeSizing'
import type { DerivedOutputKind } from '../model/derivedOutput'
import type { GenerationCanvasNode, GenerationNodeKind } from '../model/generationCanvasTypes'
import { mediaNode, overlapsAny, seed, videoBesideTallRow } from './derivedPlacement.testkit'

function derive(sourceNodeId: string, kind: DerivedOutputKind, nodeKind: GenerationNodeKind, position: { x: number; y: number }): GenerationCanvasNode {
  const created = useGenerationCanvasStore.getState().addDerivedOutput({ sourceNodeId, kind, node: { kind: nodeKind, categoryId: 'shots', position } })
  if (!created) throw new Error(`addDerivedOutput(${kind}) 返回 null`)
  return useGenerationCanvasStore.getState().nodes.find((node) => node.id === created.id)!
}


// 派生节点（拆解表 / 抽帧 / 剪辑 / 导演台产物……）落点的类不变量：
//   新节点的渲染矩形不与同分类任何已有节点的渲染矩形相交（量尺见 derivedPlacement.testkit）。
// 2026-10-18 走查：视频浮条「拆解 ▾ → 镜头表」建出的表压在旁边一排竖图上——避让只比名义 node.size，竖图渲染出来高得多。
describe('派生节点落点：不压任何邻居的渲染矩形', () => {
  beforeEach(() => seed([]))

  it('夹具自检：竖图的渲染矩形确实比名义 + 安全余量高（否则这组测试量不到旧 bug）', () => {
    const [, tall] = videoBesideTallRow()
    expect(resolveNodeVisualSize(tall).height).toBeGreaterThan((tall.size?.height ?? 0) + 64)
  })

  it.each<[DerivedOutputKind, GenerationNodeKind]>([
    ['shot-table', 'shot_table'],
    ['video-frame', 'image'],
    ['video-trim', 'video'],
  ])('%s：视频右侧一排竖图，新节点不压它们', (kind, nodeKind) => {
    seed(videoBesideTallRow())
    const created = derive('src', kind, nodeKind, { x: 520, y: 160 })
    expect(overlapsAny(created).map((node) => node.id)).toEqual([])
  })

  it('竖图在下方、右边被占：螺旋的「下一格」也要按渲染高度避让', () => {
    // 右边（1,0）被一堵宽墙占着，只剩往下走；下方一格正是竖图的下半身。
    seed([...videoBesideTallRow(), mediaNode('wall', 'image', 1700, 160, 16 / 9), mediaNode('under', 'image', 480, 700, 9 / 16)])
    const created = derive('src', 'shot-table', 'shot_table', { x: 520, y: 160 })
    expect(overlapsAny(created).map((node) => node.id)).toEqual([])
  })

  it('exactPosition 绕不过：派生节点不收「信任落点」开关（运行时也封）', () => {
    seed(videoBesideTallRow())
    const created = useGenerationCanvasStore.getState().addDerivedOutput({
      sourceNodeId: 'src', kind: 'shot-table',
      node: { kind: 'shot_table', categoryId: 'shots', position: { x: 520, y: 160 }, ...({ exactPosition: true } as object) },
    })
    expect(created).not.toBeNull()
    expect(overlapsAny(useGenerationCanvasStore.getState().nodes.find((node) => node.id === created!.id)!)).toEqual([])
  })

  it('螺旋用尽（周围铺满）：落到所有节点下方，仍然不相交', () => {
    const wall: GenerationCanvasNode[] = []
    // 以默认落点为中心、铺满 7×7 格 9:16 竖图：6 圈螺旋全部命中。
    for (let col = -3; col <= 3; col += 1) for (let row = -3; row <= 3; row += 1) wall.push(mediaNode(`w-${col}-${row}`, 'image', 520 + col * 1300, 160 + row * 1000, 9 / 16))
    seed([mediaNode('src', 'video', 120, 160, 16 / 9), ...wall])
    const created = derive('src', 'shot-table', 'shot_table', { x: 520, y: 160 })
    expect(overlapsAny(created).map((node) => node.id)).toEqual([])
  })

  it('跨分类不比：别的分类里的卡不会把新节点推远', () => {
    seed([...videoBesideTallRow().slice(0, 1), mediaNode('other', 'image', 520, 160, 9 / 16, 'cast')])
    const created = derive('src', 'shot-table', 'shot_table', { x: 520, y: 160 })
    expect(created.position).toEqual({ x: 520, y: 160 })
  })
})

describe('派生节点落点：随机画布扫一遍（类测试，不是单点复现）', () => {
  // 固定种子的小随机数：失败时能复现。
  function prng(seedValue: number): () => number {
    let state = seedValue >>> 0
    return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32 }
  }

  it('混合画幅 / 种类 / 密度的 40 张画布，每张连派生 6 次：新节点从不压任何渲染矩形', () => {
    const aspects = [9 / 16, 16 / 9, 1, 3 / 4, 4 / 3, 21 / 9]
    for (let round = 0; round < 40; round += 1) {
      const random = prng(1000 + round)
      const nodes: GenerationCanvasNode[] = []
      const count = 6 + Math.floor(random() * 30)
      for (let index = 0; index < count; index += 1) {
        const kind = random() < 0.4 ? 'video' : 'image'
        nodes.push(mediaNode(`n-${index}`, kind, Math.round(random() * 3000), Math.round(random() * 2000), aspects[Math.floor(random() * aspects.length)]))
      }
      seed(nodes)
      for (let step = 0; step < 6; step += 1) {
        const videos = useGenerationCanvasStore.getState().nodes.filter((node) => node.kind === 'video' && node.result?.type === 'video')
        const source = videos[Math.floor(random() * videos.length)]
        const kind: DerivedOutputKind = step % 3 === 0 ? 'shot-table' : step % 3 === 1 ? 'video-frame' : 'video-trim'
        const nodeKind: GenerationNodeKind = kind === 'shot-table' ? 'shot_table' : kind === 'video-frame' ? 'image' : 'video'
        const size = resolveNodeVisualSize(source)
        const created = derive(source.id, kind, nodeKind, { x: source.position.x + size.width + 80, y: source.position.y })
        const hits = overlapsAny(created).map((node) => node.id)
        expect(hits, `round ${round} step ${step} ${kind}`).toEqual([])
      }
    }
  })
})
