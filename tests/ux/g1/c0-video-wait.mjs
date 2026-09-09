import { expect } from '@playwright/test'

// Timing calibration from gate4b: 8s H3 clips take 120–240s (upper ratio 30).
// Quotes own duration; this is a wait estimate, never a spend authorization.
export function videoWaitBudget({ requests, concurrency, measuredMultiplier }) {
  if (!requests.length || !Number.isInteger(concurrency) || concurrency < 1
    || !Number.isFinite(measuredMultiplier) || measuredMultiplier <= 0
    || requests.some(r => !Number.isFinite(r.duration) || r.duration <= 0)) throw Error('C0_INVALID_WAIT_QUOTE')
  const rounds = Math.ceil(requests.length / concurrency)
  return Math.max(600_000, Math.max(...requests.map(r => r.duration)) * rounds * measuredMultiplier * 1000)
}

export function videoObservation(nodeId, nodes, waitedMs) {
  const node = nodes.find(n => n.id === nodeId), run = node?.runs?.at(-1)
  const status = run?.status === 'cancelled' ? 'cancelled' : node?.status ?? 'missing'
  const terminal = ['success', 'error', 'cancelled'].includes(status)
  const ready = status === 'success' && node?.result?.type === 'video'
    && typeof node.result.url === 'string' && node.result.url.startsWith('nomi-local://')
  return { nodeId, jobId: node?.progress?.taskId ?? run?.taskId ?? node?.progress?.runId ?? run?.id ?? null,
    status, terminal, ready, waitedMs }
}

export async function waitForVideos({ nodeIds, readNodes, budget, progress, deviation }) {
  const began = performance.now(), reported = new Set()
  let lastProgress = -30_000, observations = []
  const sample = async () => {
    const waitedMs = Math.round(performance.now() - began)
    const nodes = await readNodes()
    observations = nodeIds.map(id => videoObservation(id, nodes, waitedMs))
    for (const row of observations) if (row.terminal && !row.ready && !reported.has(row.nodeId)) {
      reported.add(row.nodeId)
      await deviation(row)
    }
    if (waitedMs - lastProgress >= 30_000) {
      lastProgress = waitedMs
      await progress({ waitedMs, ready: observations.filter(r => r.ready).length,
        failed: observations.filter(r => r.terminal && !r.ready).length, total: nodeIds.length, budget })
    }
    return observations.every(r => r.terminal)
  }
  try {
    // Use native poll here: the boundary below emits per-job evidence in either walk mode.
    await expect.poll(sample, { timeout: budget, intervals: [1000] }).toBe(true)
  } catch (error) {
    if (!error.matcherResult) throw error
    await sample()
  }
  for (const row of observations) if (!row.ready && !reported.has(row.nodeId)) await deviation(row)
  await progress({ waitedMs: Math.round(performance.now() - began), ready: observations.filter(r => r.ready).length,
    failed: observations.filter(r => r.terminal && !r.ready).length, total: nodeIds.length, budget, final: true })
  return observations
}
