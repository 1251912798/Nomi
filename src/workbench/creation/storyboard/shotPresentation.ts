import i18n from '../../../i18n'
import { getAllowedModelsByKind } from '../../../config/models'

/** Shared identity for storyboard rows and approval rows; no persistence or model-specific branches. */
export function shotPresentation(shot: {
  title?: unknown; prompt?: unknown; modelKey?: unknown; modelId?: unknown;
  modelVendor?: unknown; vendor?: unknown;
  variantId?: unknown; params?: unknown; parameters?: unknown; durationSec?: unknown;
  shotKind?: unknown; kind?: unknown;
}, index: number): { title: string; description: string } {
  const text = typeof shot.title === 'string' && shot.title.trim() ? shot.title : typeof shot.prompt === 'string' ? shot.prompt : ''
  const title = Array.from(text.trim().split(/[。！？.!?\n]/u)[0] ?? '').slice(0, 20).join('')
  const raw = shot.params ?? shot.parameters
  const params = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const model = shot.modelKey ?? shot.modelId
  const duration = shot.durationSec ?? params.duration ?? params.duration_seconds
  const kind = shot.shotKind ?? shot.kind
  const vendor = shot.modelVendor ?? shot.vendor
  const option = typeof vendor === 'string' ? getAllowedModelsByKind(kind === 'image' ? 'image' : 'video')
    .find(entry => entry.vendor === vendor && (entry.modelKey ?? entry.value) === model) : undefined
  return {
    title: title || String(i18n.t('agentResident.shotNumber', { index })),
    description: [typeof model === 'string' ? option?.label ?? model : '',
      params.resolution ?? shot.variantId,
      typeof duration === 'number' || typeof duration === 'string' ? `${duration}s` : '',
      params.aspect_ratio ?? params.aspectRatio,
    ].filter(value => typeof value === 'string' && value.trim()).join(' · '),
  }
}
