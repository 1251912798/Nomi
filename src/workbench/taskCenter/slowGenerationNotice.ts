import type { GenerationQueueEntry } from '../generationCanvas/runner/generationQueueStore'

/** Compare like-for-like node history; no arbitrary global timeout across media/models. */
export function slowGenerationEntries(entries: readonly GenerationQueueEntry[], now: number): GenerationQueueEntry[] {
  return entries.filter((entry) => {
    if (entry.state !== 'running' || entry.startedAt === undefined) return false
    const samples = entries.filter((prior) => prior.nodeId === entry.nodeId && prior.state === 'success'
      && prior.startedAt !== undefined && prior.endedAt !== undefined && prior.endedAt > prior.startedAt)
      .slice(-5).map((prior) => prior.endedAt! - prior.startedAt!).sort((a, b) => a - b)
    if (!samples.length) return false
    const typical = samples[Math.floor(samples.length / 2)]
    return now - entry.startedAt > typical * 2
  })
}
