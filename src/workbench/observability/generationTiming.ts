import type { GenerationCanvasNode } from '../generationCanvas/model/generationCanvasTypes'

/** Only ten completed, same-provider/model/duration local runs can establish a typical duration. */
export function localGenerationMedian(nodes: readonly GenerationCanvasNode[], model: { modelKey: string; vendorKey: string }, durationSeconds: number): number | undefined {
  if (!model.modelKey || !model.vendorKey || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return undefined
  const samples: { id: string; at: number; ms: number }[] = []
  const seen = new Set<string>()
  for (const node of nodes) {
    for (const run of node.runs ?? []) {
      if (run.status !== 'success' || run.completedAt === undefined || !run.resultId || seen.has(run.id)) continue
      const result = [node.result, ...(node.history ?? [])].find((item) => item?.id === run.resultId)
      if (!result || result.provenance?.modelKey !== model.modelKey || result.provenance.provider !== model.vendorKey || result.durationSeconds !== durationSeconds) continue
      const ms = run.completedAt - run.startedAt
      if (!Number.isFinite(ms) || ms <= 0) continue
      seen.add(run.id)
      samples.push({ id: run.id, at: run.completedAt, ms })
    }
  }
  if (samples.length < 10) return undefined
  const durations = samples.sort((a, b) => b.at - a.at).slice(0, 10).map((item) => item.ms).sort((a, b) => a - b)
  return (durations[4] + durations[5]) / 2
}
