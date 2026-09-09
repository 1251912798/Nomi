import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createCanvasLaneTools } from '../../electron/agentLane/laneCanvasTools.js';
import { createLaneFixture } from './laneFixture.mjs';

const title = '日落前的一分钟';
const shot = { index: 1, shotKind: 'video', durationSec: 8, anchorIds: [], prompt: '小禾合上电脑，看夕阳。' };
const plan = { operation: 'propose_storyboard_plan', title, anchors: [], shots: [shot] };
const skill = () => readFile(path.resolve('skills/workbench-storyboard-planner/SKILL.md'), 'utf8');

async function run(t: Parameters<typeof createLaneFixture>[0], args: unknown[], systemPrompt: string) {
  const writes: unknown[] = [];
  const fixture = await createLaneFixture(t, [
    ...args.map((arguments_, i) => ({ type: 'tool' as const, calls: [{ id: `c0-${i}`, name: 'nomi_storyboard_write', arguments: arguments_ }] })),
    { type: 'text', text: '分镜方案已保存。' },
  ]);
  const lane = await fixture.openLane({ ...fixture.options, systemPrompt, tools: createCanvasLaneTools({
    read: async () => { throw new Error('No canvas read expected'); },
    write: async (input) => {
      writes.push(input);
      return { applied: true, proposalId: 'c0-plan', operation: 'propose_storyboard_plan', result: {}, reconciliation: { ok: true, deviationCount: 0 } };
    },
  }) });
  await lane.execute({ kind: 'prompt', text: `标题保持“${title}”，八镜各八秒。` });
  return { writes, bodies: fixture.http.requests.map((r) => r.body), parts: lane.projection().parts };
}

test('C0 operation: active schema and skill agree; native rejection heals before exactly one write', async (t) => {
  const { operation: _omitted, ...missing } = plan;
  const result = await run(t, [{ ...missing, summary: "八镜分镜" }, plan], await skill());
  assert.equal(result.writes.length, 1);
  assert.match(JSON.stringify(result.bodies[1]), /required properties operation/);
  assert.match(JSON.stringify(result.bodies[1]), /must not have additional properties/);
  const first = JSON.stringify(result.bodies[0]);
  const wire = result.bodies[0] as { tools: Array<{ function: { name: string; parameters: { required: string[] } } }> };
  const tool = wire.tools.find((entry) => entry.function.name === 'nomi_storyboard_write');
  assert.ok(tool, 'Storyboard is visible on the first request, without group activation.');
  assert.deepEqual(tool.function.parameters.required, ['operation']);
  assert.match(first, /operation.*propose_storyboard_plan/);
  assert.doesNotMatch(first, /参数就是整份方案 `\{ title, anchors, shots \}`/);
  assert.match(first, /operation 必填/);
});

test('C0 language: planner skill removes English mandate and retains authored title guidance', async (t) => {
  const body = await skill();
  for (const prompt of [body]) {
    const result = await run(t, [plan], prompt);
    const wire = JSON.stringify(result.bodies[0]);
    assert.doesNotMatch(wire, /(?:Produce|produce) the entire storyboard plan in English/);
    assert.doesNotMatch(wire, /一条简洁的英文方案名|必须中文|Opening/);
    assert.match(wire, /保持原文/);
    assert.deepEqual(result.writes, [plan]);
  }
});

test('C0 settings: explicit catalog choices survive and unspecified settings stay optional', async (t) => {
  const explicit = { ...plan, shots: [{ ...shot, modelKey: 'catalog-video', params: { resolution: '768P', aspect_ratio: '16:9' } }] };
  const result = await run(t, [explicit, plan], await skill());
  assert.deepEqual(result.writes, [explicit, plan]);
  const wire = JSON.stringify(result.bodies[0]);
  assert.match(wire, /用户已指定/);
  assert.match(wire, /未指定/);
  assert.equal(result.parts.filter((p) => p.kind === 'tool-result' && p.isError).length, 0);
});
