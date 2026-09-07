import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { runAgentTurn } from '../../electron/harness/runtime/pi/nativeLoader.cjs';
import { createRuntimeFixture, type FixtureReply } from './httpFixture.mjs';

function tool(index: number): FixtureReply {
  return { type: 'tool', calls: [{ id: `step-${index}`, name: 'read_shot', arguments: {} }] };
}

for (const maxSteps of [8, 24] as const) {
  test(`whole Nomi call stops at exactly ${maxSteps} requests and stops on the tool boundary without inventing a failure`, async (t) => {
    const { request, http } = await createRuntimeFixture(t,
      [...Array.from({ length: maxSteps + 1 }, (_, index) => tool(index)), { type: 'text', text: 'Must not request this.' }]);
    request.capability = { maxSteps };
    request.tools = [{ name: 'read_shot', description: 'Read one shot.', schema: z.object({}) }];
    let hosts = 0;
    const result = await runAgentTurn(request, { emit: () => {}, awaitToolConfirmation: async () => {
      hosts += 1; return { ok: true, result: 'Read.' };
    } });
    // 真正的防线仍然是这三行：请求数、工具执行次数、以及转录里那个工具边界。
    assert.equal(http.requests.length, maxSteps);
    assert.equal(hosts, maxSteps);
    assert.equal(result.context?.normalRequests, maxSteps);
    assert.match(result.snapshot ?? '', /toolResult/);
    // 而**这一条是本次改动买到的东西**：预算停住了循环，不代表这一轮失败了——工具全跑完、
    // 结果全在转录里。此前这里是 `status:'error'` + `kind:'step-limit'`，把一次停在预算
    // 边界上的正常收尾报成失败给用户看（`docs/audit/2026-09-06-agent-architecture-review.md:319`）。
    assert.equal(result.status, 'finished');
    assert.equal(result.finishReason, 'toolUse', 'the turn is reported as what it is: stopped on a tool boundary');
    assert.equal(result.error, undefined, 'a budget boundary is not a failure, so no error is fabricated');
  });

  test(`a normal stop on the last admitted request ${maxSteps} succeeds`, async (t) => {
    const { request, http } = await createRuntimeFixture(t,
      [...Array.from({ length: maxSteps - 1 }, (_, index) => tool(index)), { type: 'text', text: 'Finished at the limit.' }]);
    request.capability = { maxSteps };
    request.tools = [{ name: 'read_shot', description: 'Read one shot.', schema: z.object({}) }];
    const result = await runAgentTurn(request, { emit: () => {}, awaitToolConfirmation: async () => ({ ok: true }) });
    assert.equal(http.requests.length, maxSteps);
    assert.equal(result.status, 'finished');
    assert.equal(result.text, 'Finished at the limit.');
  });
}

test('singleShot ignores supplied history and tools and makes exactly one request even for a malicious tool call', async (t) => {
  const { request, http } = await createRuntimeFixture(t, [tool(1), { type: 'text', text: 'Must not continue.' }]);
  request.snapshot = 'Deliberately invalid: single-shot must never parse prior history.';
  request.capability = { singleShot: true, maxSteps: 1 };
  request.compaction = { enabled: true };
  request.tools = [{ name: 'read_shot', description: 'Not granted.', schema: z.object({}) }];
  let hosts = 0;
  const result = await runAgentTurn(request, { emit: () => {}, awaitToolConfirmation: async () => {
    hosts += 1; return { ok: true };
  } });
  assert.equal(http.requests.length, 1);
  assert.equal(hosts, 0);
  assert.ok(!http.requests[0].body.tools || (http.requests[0].body.tools as unknown[]).length === 0);
  // single-shot 的价值在上面三行：一次请求、零工具执行、不带工具表。它「以 toolUse 收尾」
  // 是模型硬发了一个没被授予的调用，而我们一个都没执行——那不是一次失败的回合。
  assert.equal(result.status, 'finished');
  assert.equal(result.finishReason, 'toolUse');
  assert.equal(result.snapshot, undefined, 'single-shot never publishes working history');
});

test('length on the last admitted normal call preserves the partial result without auto-continuation', async (t) => {
  const { request, http } = await createRuntimeFixture(t,
    [...Array.from({ length: 7 }, (_, index) => tool(index)), { type: 'text', text: 'Partial answer.', finishReason: 'length' }]);
  request.compaction = { enabled: true, reserveTokens: 1024, keepRecentTokens: 100 };
  request.tools = [{ name: 'read_shot', description: 'Read.', schema: z.object({}) }];
  const result = await runAgentTurn(request, { emit: () => {}, awaitToolConfirmation: async () => ({ ok: true }) });
  assert.equal(http.requests.length, 8);
  assert.equal(result.status, 'finished');
  assert.equal(result.finishReason, 'length');
  assert.equal(result.text, 'Partial answer.');
});

test('ordinary model errors are not automatically retried', async (t) => {
  const { request, http } = await createRuntimeFixture(t, [
    { type: 'error', status: 529, message: 'Overloaded' }, { type: 'text', text: 'Do not retry.' },
  ]);
  const result = await runAgentTurn(request, { emit: () => {}, awaitToolConfirmation: async () => ({ ok: true }) });
  assert.equal(http.requests.length, 1);
  assert.equal(result.status, 'error');
});
