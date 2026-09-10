// L1 contract-oracle matrix: independent scripted expectations + the current public Lane API.
// See plan §2.3: ≥5 capability families ×3 scripts, four parity dimensions per script.
// Existing lane-shadow-parity.test.mts is the actual old/new runtime control. This matrix
// retains the scripted contract after the old runtime is deleted; it never copies that runtime.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { L1_SCENARIOS } from './laneL1Scenarios.mjs';
import { runL1Scenario, assertL1ComparatorControls } from './laneL1Harness.mjs';

const completed = new Set<string>();
after(() => {
  const passed = completed.size, total = L1_SCENARIOS.length;
  console.log(`[L1 contract-oracle] scripts=${passed}/${total} transcript=${passed}/${total}`
    + ` tools=${passed}/${total} spend=${passed}/${total} final-state=${passed}/${total}`
    + ` checks=${passed * 4}/${total * 4} cold-restart=${passed}/${total}`);
});

test('L1 matrix has five capability families with three scripts each and non-vacuous controls', () => {
  assert.equal(new Set(L1_SCENARIOS.map(item => item.id)).size, L1_SCENARIOS.length);
  assert.ok(L1_SCENARIOS.length >= 16);
  for (const family of ['document', 'canvas', 'timeline', 'generation', 'task']) {
    assert.ok(L1_SCENARIOS.filter(item => item.family === family).length >= 3, family);
  }
  assertL1ComparatorControls();
});

for (const scenario of L1_SCENARIOS) {
  test(`L1 ${scenario.id} · ${scenario.title}`, { timeout: 20_000 }, async t => {
    await runL1Scenario(t, scenario);
    completed.add(scenario.id);
  });
}
