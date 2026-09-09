import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLaneApprovalGate } from '../../electron/agentLane/laneApprovalGate.js';
import { createLaneNativeApprovalResolver } from '../../electron/agentLane/laneNativeApproval.js';
import { LANE_CODING_TOOL_EFFECTS } from '../../electron/agentLane/laneCodingTools.mjs';

function gate(mode: 'safe-auto' | 'project' | 'step', sandboxActive = true, hasUserInterface = true) {
  return createLaneApprovalGate({ specs: [], policy: () => ({ mode, spend: 'confirm' }), hasUserInterface,
    resolveSubject: createLaneNativeApprovalResolver({ projectDir: '/project', sandboxActive, effects: LANE_CODING_TOOL_EFFECTS }) });
}

test('native read and project writes derive the existing safe-auto approval semantics', async () => {
  const instance = gate('safe-auto', true, false);
  for (const toolName of ['read', 'write', 'edit']) {
    assert.equal((await instance.preflight({ toolCallId: toolName, toolName, args: {} }, undefined)).decision, 'auto-granted');
  }
});

test('shell hard deny and mandatory confirmation survive project mode and earlier grants', async () => {
  const instance = gate('project');
  const denied = await instance.preflight({ toolCallId: 'secret', toolName: 'bash', args: { command: 'cat ~/.ssh/id_rsa' } }, undefined);
  assert.equal(denied.decision, 'denied-by-policy');
  const pending = instance.preflight({ toolCallId: 'publish', toolName: 'bash', args: { command: 'git push origin main' } }, undefined);
  assert.equal(instance.pending()?.grantable, false);
  assert.equal(instance.answer('publish', 'allow-session'), false);
  assert.equal(instance.answer('publish', 'allow-once'), true);
  assert.equal((await pending).decision, 'granted-once');
  const again = instance.preflight({ toolCallId: 'publish-again', toolName: 'bash', args: { command: 'git push origin main' } }, undefined);
  assert.equal(instance.pending()?.toolCallId, 'publish-again');
  instance.answer('publish-again', 'deny');
  assert.equal((await again).decision, 'denied');
});

test('sandbox unavailable does not auto-allow bash in any approval mode or without a window', async () => {
  for (const mode of ['safe-auto', 'project', 'step'] as const) {
    const instance = gate(mode, false);
    const pending = instance.preflight({ toolCallId: mode, toolName: 'bash', args: { command: 'echo fixture' } }, undefined);
    assert.equal(instance.pending()?.grantable, false);
    instance.answer(mode, 'deny');
    assert.equal((await pending).decision, 'denied');
    assert.equal((await gate(mode, false, false).preflight({ toolCallId: mode, toolName: 'bash', args: { command: 'echo fixture' } }, undefined)).decision, 'denied-by-policy');
  }
});

test('native resolver cannot make write tools available in ask work mode', async () => {
  const instance = createLaneApprovalGate({ specs: [], policy: () => ({ mode: 'project', spend: 'confirm' }), workMode: () => 'ask', hasUserInterface: true,
    resolveSubject: createLaneNativeApprovalResolver({ projectDir: '/project', sandboxActive: true, effects: LANE_CODING_TOOL_EFFECTS }) });
  assert.equal((await instance.preflight({ toolCallId: 'write', toolName: 'write', args: {} }, undefined)).decision, 'denied-by-policy');
  assert.equal((await instance.preflight({ toolCallId: 'read', toolName: 'read', args: {} }, undefined)).decision, 'auto-granted');
});


test('hard-list publication remains disallowed in edit-selection mode', async () => {
  const instance = createLaneApprovalGate({ specs: [], policy: () => ({ mode: 'project', spend: 'confirm' }),
    workMode: () => 'editSelection', hasUserInterface: true,
    resolveSubject: createLaneNativeApprovalResolver({ projectDir: '/project', sandboxActive: true, effects: LANE_CODING_TOOL_EFFECTS }) });
  assert.equal((await instance.preflight({ toolCallId: 'publish', toolName: 'bash', args: { command: 'git push origin main' } }, undefined)).decision, 'denied-by-policy');
});
