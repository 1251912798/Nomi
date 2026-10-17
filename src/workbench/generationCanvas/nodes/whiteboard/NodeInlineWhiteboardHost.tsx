import React from 'react'
import type { GenerationCanvasNode } from '../../model/generationCanvasTypes'
import { lazyWithChunkBoundary } from '../../../../ui/chunkBoundary'
import { closeWhiteboard } from './whiteboardSession'
import { inferWhiteboardAspectRatio, readWhiteboardEditingState } from './whiteboardState'

const InlineWhiteboard = lazyWithChunkBoundary('画板', () => import('./InlineWhiteboard'))

export function NodeInlineWhiteboardHost({ node }: { node: GenerationCanvasNode }): React.JSX.Element {
  const [initial] = React.useState(() => ({ state: readWhiteboardEditingState(node), image: node.result?.type === 'image' && node.result.url ? { url: node.result.url, aspectRatio: inferWhiteboardAspectRatio(node.meta?.imageWidth, node.meta?.imageHeight) } : undefined }))
  return <React.Suspense fallback={null}>
    <InlineWhiteboard nodeId={node.id} sourceKind={node.kind === 'whiteboard' ? 'whiteboard' : 'image'}
      initialState={initial.state}
      initialImage={initial.image}
      onClose={() => closeWhiteboard(node.id)} />
  </React.Suspense>
}
