/** Screen-space rectangles: composer stays readable while the canvas zooms. */
export type ComposerRect = { left: number; top: number; right: number; bottom: number }
export type ComposerPlacement = { left: number; top: number; width: number; height: number; side: 'below' | 'above' | 'right' | 'left' }
const intersects = (a: ComposerRect, b: ComposerRect): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

/** Subtract obstacles, retaining maximal empty rectangles rather than a grid of tiny cells. */
function freeRectangles(region: ComposerRect, obstacles: ComposerRect[]): ComposerRect[] {
  let free = [region].filter(r => r.right > r.left && r.bottom > r.top)
  for (const obstacle of obstacles) {
    const next = free.flatMap(r => !intersects(r, obstacle) ? [r] : [
      { ...r, right: Math.min(r.right, obstacle.left) },
      { ...r, left: Math.max(r.left, obstacle.right) },
      { ...r, bottom: Math.min(r.bottom, obstacle.top) },
      { ...r, top: Math.max(r.top, obstacle.bottom) },
    ].filter(part => part.right > part.left && part.bottom > part.top))
    free = next.filter((r, i) => !next.some((other, j) => j !== i && other.left <= r.left && other.top <= r.top && other.right >= r.right && other.bottom >= r.bottom && (j < i || other.left < r.left || other.top < r.top || other.right > r.right || other.bottom > r.bottom)))
  }
  return free
}

export function resolveComposerObstaclePlacement(input: {
  stage: ComposerRect; node: ComposerRect; obstacles: ComposerRect[]
  width: number; height: number; gap: number; aboveClearance: number
}): ComposerPlacement {
  const { stage, node, obstacles, width, height, gap, aboveClearance } = input
  const regions = [
    { side: 'below' as const, rect: { ...stage, top: Math.max(stage.top, node.bottom + gap) } },
    { side: 'above' as const, rect: { ...stage, bottom: Math.min(stage.bottom, node.top - gap - aboveClearance) } },
    { side: 'right' as const, rect: { ...stage, left: Math.max(stage.left, node.right + gap) } },
    { side: 'left' as const, rect: { ...stage, right: Math.min(stage.right, node.left - gap) } },
  ]
  const candidates = regions.flatMap(({ side, rect }) => freeRectangles(rect, obstacles).map(space => {
    const w = Math.min(width, space.right - space.left)
    const h = Math.min(height, space.bottom - space.top)
    const desiredLeft = side === 'right' ? node.right + gap : side === 'left' ? node.left - gap - w : (node.left + node.right - w) / 2
    const desiredTop = side === 'below' ? node.bottom + gap : side === 'above' ? node.top - gap - aboveClearance - h : node.top
    return { side, width: w, height: h, left: Math.max(space.left, Math.min(space.right - w, desiredLeft)), top: Math.max(space.top, Math.min(space.bottom - h, desiredTop)) }
  }))
  // Full cards use the specified directional preference, then the nearest empty rectangle.
  const full = candidates.filter(c => c.width >= width && c.height >= height)
  const distance = (c: ComposerPlacement): number => Math.abs(c.left + c.width / 2 - (node.left + node.right) / 2) + Math.abs(c.top - node.bottom)
  full.sort((a, b) => regions.findIndex(r => r.side === a.side) - regions.findIndex(r => r.side === b.side) || distance(a) - distance(b))
  if (full[0]) return full[0]
  // If every external attachment is obstructed, the selected media is the last
  // available home. It may be covered while editing; neighboring media may not.
  const inside = { left: Math.max(stage.left, node.left), right: Math.min(stage.right, node.right), top: Math.max(stage.top, node.top), bottom: Math.min(stage.bottom, node.bottom) }
  candidates.push(...freeRectangles(inside, obstacles).map(space => ({ side: 'below' as const, left: space.left, top: space.top, width: Math.min(width, space.right - space.left), height: Math.min(height, space.bottom - space.top) })))
  candidates.sort((a, b) => b.width * b.height - a.width * a.height || distance(a) - distance(b))
  return candidates[0] ?? { side: 'below', left: stage.left, top: stage.top, width: 0, height: 0 }
}
