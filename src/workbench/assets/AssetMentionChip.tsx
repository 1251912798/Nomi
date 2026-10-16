import React, { type JSX } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import AssetInlineReference from './AssetInlineReference'

/** Tiptap atom and read-only Agent messages share the same inline thumbnail. */
export default function AssetMentionChip({ node }: NodeViewProps): JSX.Element {
  return <NodeViewWrapper as="span" className="inline" data-asset-mention="" contentEditable={false}>
    <AssetInlineReference url={String(node.attrs.url || '')} index={Number(node.attrs.index) || undefined}
      kind={node.attrs.kind === 'video' ? 'video' : node.attrs.kind === 'audio' ? 'audio' : 'image'} />
  </NodeViewWrapper>
}
