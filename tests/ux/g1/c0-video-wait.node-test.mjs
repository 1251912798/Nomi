import assert from 'node:assert/strict'
import { test } from 'node:test'
import { videoWaitBudget, videoObservation, waitForVideos } from './c0-video-wait.mjs'

test('quote duration, concurrency rounds and measured ratio determine budget with ten minute floor', () => {
  const requests = Array.from({ length: 8 }, () => ({ duration: 8 }))
  assert.equal(videoWaitBudget({ requests, concurrency: 6, measuredMultiplier: 30 }), 600_000)
  assert.equal(videoWaitBudget({ requests, concurrency: 2, measuredMultiplier: 30 }), 960_000)
  assert.throws(() => videoWaitBudget({ requests: [{ duration: NaN }], concurrency: 6, measuredMultiplier: 30 }))
})
test('only terminal local videos are consumable; stale results, missing nodes and cancellation stay visible', () => {
  for (const status of ['queued', 'running', 'recoverable', 'error']) {
    assert.equal(videoObservation('a', [{ id: 'a', status, result: { type: 'video', url: 'nomi-local://old' } }], 12).ready, false)
  }
  assert.deepEqual(videoObservation('a', [], 12), { nodeId: 'a', jobId: null, status: 'missing', terminal: false, ready: false, waitedMs: 12 })
  assert.equal(videoObservation('a', [{ id: 'a', status: 'idle', runs: [{ id: 'run', taskId: 'job', status: 'cancelled' }] }], 12).status, 'cancelled')
})
test('failed job does not prevent waiting for sibling or continuing; deadline records unfinished job identity', async () => {
  const deviations = [], progress = []
  const rows = await waitForVideos({ nodeIds: ['a', 'b', 'c'], budget: 20,
    readNodes: async () => [{ id: 'a', status: 'error', runs: [{ id: 'failed' }] },
      { id: 'b', status: 'running', progress: { taskId: 'unfinished' } },
      { id: 'c', status: 'success', result: { type: 'video', url: 'nomi-local://clip' } }],
    deviation: row => deviations.push(row), progress: row => progress.push(row) })
  assert.deepEqual(deviations.map(r => r.jobId), ['failed', 'unfinished'])
  assert.equal(rows.filter(r => r.ready).length, 1)
  assert.equal(progress.at(-1).final, true)
})

test('C0 repair remains eight pure text videos with script model parameters in both modes', async () => {
  const { c0RepairPlan } = await import('./sweep-repair.mjs')
  for (const mode of ['real', 'dry-run']) {
    const plan = c0RepairPlan(mode)
    assert.deepEqual(plan.anchors, [])
    assert.equal(plan.shots.length, 8)
    for (const shot of plan.shots) {
      assert.deepEqual(shot.anchorIds, [])
      assert.equal(shot.modelKey, mode === 'real' ? 'MiniMax-H3' : 'c0-loopback-video')
      assert.equal(shot.modeId, 't2v')
      assert.deepEqual(shot.params, { duration: 8, size: '16:9', resolution: '768P' })
    }
  }
})
