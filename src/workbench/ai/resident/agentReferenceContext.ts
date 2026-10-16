import type { AgentContextHandle } from '../../../../electron/shared/agentContextSnapshot'
import type { GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'
import { listNodeMediaResults, resultIdentity } from '../../generationCanvas/model/nodeResultLifecycle'
import { mentionUrlsInOrder } from '../../assets/promptMentions'
import { composerMediaReferences } from '../projectAgentAttachments'
import type { ComposerAttachment } from '../composer/composerAttachmentTypes'

/** Carry explicit canvas-source locators alongside the same canonical media claims.
 * Reference selection never changes the selected editing target or grants authority.
 */
export function agentReferenceContext(attachments: readonly ComposerAttachment[], prompt:string, nodes:readonly GenerationCanvasNode[], revision:number): AgentContextHandle[] {
  const mentioned=new Set(mentionUrlsInOrder(prompt))
  const references=composerMediaReferences(attachments)
  return attachments.flatMap(item => (item.referenceNodes ?? (item.referenceNode ? [item.referenceNode] : [])).flatMap(origin => {
    if (!origin || !item.url || !mentioned.has(item.url)) return []
    const node=nodes.find(candidate=>candidate.id===origin.nodeId)
    if (!node || !listNodeMediaResults(node).some(result=>resultIdentity(result)===origin.resultId && result.url===origin.originalUrl)) return []
    const reference=references.find(candidate=>candidate.url===item.url)
    if (!reference) return []
    return [{ id:`reference:${item.assetId}:node:${node.id}`, kind:'canvasNode' as const, targetId:node.id,
      revision:String(revision), locator:{type:'canvasSelection' as const,nodeIds:[node.id]},
      display:{title:`@${reference.kind}${reference.index} · ${node.title || node.id}`}, intentRole:'source' as const }]
  }))
}
