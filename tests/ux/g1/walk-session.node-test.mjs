import test from 'node:test'
import assert from 'node:assert/strict'
import { createWalkSession, expect } from '../_assert.mjs'
async function journey(mode, visited = []) {
  const walk = createWalkSession({ mode })
  for (const id of ['first', 'last']) await walk.station({ id }, () => {
    visited.push(id); expect(1, `${id} mismatch`).toBe(2); expect('actual').toBe('expected')
  })
  return walk
}
test('fail-fast stops on first failure; collect retains all failures and reaches end', async () => {
  const visited = []
  await assert.rejects(journey('fail-fast', visited), /first mismatch/)
  assert.deepEqual(visited, ['first'])
  const walk = await journey('collect')
  assert.equal(walk.deviations.length, 4)
  assert.equal(walk.stations[1].id, 'last')
  assert.ok(walk.stations.every(s => s.status === 'failed'))
  assert.equal(walk.deviations[0].expected, 2)
  assert.equal(walk.deviations[0].actual, 1)
})
test('repair remains failed, preserves evidence and marks later stations', async () => {
  let ready = false
  const walk = createWalkSession({ mode: 'collect', capture: async () => ({ screenshot: 'before.png' }) })
  await walk.station({ id: 'broken', repair: { name: 'fixture', run() { ready = true } } }, () => expect(ready).toBe(true))
  await walk.station({ id: 'later' }, () => expect(ready).toBe(true))
  assert.equal(walk.stations[0].status, 'failed')
  assert.equal(walk.deviations[0].screenshot, 'before.png')
  assert.equal(walk.deviations[0].repairedBy, 'fixture')
  assert.equal(walk.deviations[0].repaired, true)
  assert.equal(walk.stations[1].reachedViaRepair, true)
})
test('failed repairs and async matchers continue without claiming successful repair', async () => {
  const walk = createWalkSession({ mode: 'collect' })
  await walk.station({ id: 'bad', repair: { name: 'broken fixture', run() { throw Error('repair failed') } } }, () => { throw Error('action failed') })
  await walk.station({ id: 'async' }, async () => {
    await expect.poll(async () => 1, { timeout: 1 }).toBe(2)
    expect(1).not.toBe(1)
  })
  assert.equal(walk.deviations.length, 4)
  assert.equal(walk.stations[1].reachedViaRepair, false)
})
test('concurrent session scopes and unscoped assertions do not leak', async () => {
  const a = createWalkSession({ mode: 'collect' }), b = createWalkSession({ mode: 'collect' })
  await Promise.all([a.station({ id: 'a' }, async () => { await Promise.resolve(); expect(1).toBe(2) }),
    b.station({ id: 'b' }, () => expect(3).toBe(4))])
  assert.equal(a.deviations[0].station, 'a'); assert.equal(b.deviations[0].station, 'b')
  assert.throws(() => expect(1).toBe(2))
})
test('visual findings are retained and are never mislabeled as repaired by a domain fixture', async () => {
  let repairs = 0
  const walk = createWalkSession({ mode: 'collect', capture: async () => ({ screenshot: 'scene.png',
    captureIssues: [{ assertion: 'feel:clipping', phenomenon: 'clipped', layer: 'UI' }] }) })
  await walk.station({ id: 'visual', repair: { name: 'domain seed', run() { repairs++ } } }, () => {})
  assert.equal(repairs, 0)
  assert.equal(walk.deviations[0].repaired, false)
  assert.equal(walk.stations[0].status, 'failed')
})
test('unreachable station is explicit and cannot execute or masquerade as reached', async () => {
  const walk = createWalkSession({ mode: 'collect' })
  let called = false
  await walk.station({ id: 'missing-project', requires: () => false }, () => { called = true })
  await walk.station({ id: 'independent' }, () => {})
  assert.equal(called, false)
  assert.equal(walk.stations[0].status, 'unreachable')
  assert.equal(walk.stations[1].status, 'passed')
  assert.equal(walk.deviations.length, 1)
})
