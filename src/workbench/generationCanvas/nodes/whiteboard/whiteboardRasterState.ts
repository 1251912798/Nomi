import { getCanvasDimensions } from './lib/canvas'
import type { WhiteboardState } from './whiteboardTypes'

/** Selection and layer labels do not change pixels and must not create a new result version. */
export function whiteboardRasterStateKey(state: WhiteboardState): string {
  return JSON.stringify({
    dimensions: state.canvasDimensions ?? getCanvasDimensions(state.activeRatio, 1280),
    assets: state.canvasAssets,
    strokes: state.strokes,
    texts: state.texts ?? [],
    transforms: state.sceneTransforms ?? { offsets: {}, assetTransforms: {}, flips: {} },
    layers: state.layers.map(({ name: _name, thumbnail: _thumbnail, ...layer }) => layer),
  })
}
