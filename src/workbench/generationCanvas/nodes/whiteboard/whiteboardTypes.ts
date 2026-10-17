import type { SceneTransforms } from './whiteboardCanvasTypes'
import type { CanvasStroke } from './WhiteboardLeaferCanvas'
import type { AspectRatioKey, CanvasAsset, CanvasText, CanvasDimensions, LayerItem } from './lib/canvas'

export type WhiteboardState = {
  texts?: CanvasText[]
  sceneTransforms?: SceneTransforms
  canvasDimensions?: CanvasDimensions
  strokes: CanvasStroke[]
  canvasAssets: CanvasAsset[]
  layers: LayerItem[]
  activeLayerId: string
  activeRatio: AspectRatioKey
}

export type WhiteboardInitialImageStatus = 'loading' | 'failed' | 'ready'

export type WhiteboardInitialImage = {
  url: string
  aspectRatio: AspectRatioKey
}

export type WhiteboardResultLibraryItem = {
  id: string
  nodeId: string
  name: string
  url: string
  width?: number
  height?: number
}
