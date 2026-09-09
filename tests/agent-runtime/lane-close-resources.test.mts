import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { JsonlSessionRepo, StorageBackedSession } from '@earendil-works/pi-agent-core/harness/session';
import { SandboxManager } from '@anthropic-ai/sandbox-runtime';
import { openLane } from '../../electron/agentLane/laneHost.mjs';
import { openLaneHistory } from '../../electron/agentLane/laneHistory.mjs';
import { createLaneFixture } from './laneFixture.mjs';

test('host close returns sandbox and repository resources when a session failure rejects harness.close', async (t) => {
  const fixture = await createLaneFixture(t, []);
  const lane = await openLane({ ...fixture.options,
    native: { settingsRoot: path.join(fixture.projectDir, 'fixture-settings'), skills: [] } });
  const sessionClose = StorageBackedSession.prototype.close;
  t.mock.method(StorageBackedSession.prototype, 'close', async function (this: StorageBackedSession, context: Parameters<StorageBackedSession['close']>[0]) {
    await sessionClose.call(this, context);
    throw new Error('fixture_session_close_failure');
  });
  const repoClose = t.mock.method(JsonlSessionRepo.prototype, 'close');
  try {
    await assert.rejects(lane.close(), /fixture_session_close_failure/);
    assert.equal(repoClose.mock.callCount(), 1, 'The project repository holder is always returned.');
    assert.equal(SandboxManager.getProxyPort(), undefined, 'The sandbox proxy is closed after the harness failure.');
  } finally { t.mock.restoreAll(); await SandboxManager.reset(); }
});

test('history close returns the repository holder when public session.close rejects', async (t) => {
  const fixture = await createLaneFixture(t, []);
  const lane = await openLaneHistory({ projectDir: fixture.projectDir });
  const sessionClose = StorageBackedSession.prototype.close;
  t.mock.method(StorageBackedSession.prototype, 'close', async function (this: StorageBackedSession, context: Parameters<StorageBackedSession['close']>[0]) {
    await sessionClose.call(this, context);
    throw new Error('fixture_session_close_failure');
  });
  const repoClose = t.mock.method(JsonlSessionRepo.prototype, 'close');
  try {
    await assert.rejects(lane.close(), /fixture_session_close_failure/);
    assert.equal(repoClose.mock.callCount(), 1);
  } finally { t.mock.restoreAll(); }
});

test('history construction failure still releases its repository if session cleanup also fails', async (t) => {
  const fixture = await createLaneFixture(t, []);
  t.mock.method(StorageBackedSession.prototype, 'getStats', async () => { throw new Error('fixture_history_failure'); });
  const sessionClose = StorageBackedSession.prototype.close;
  t.mock.method(StorageBackedSession.prototype, 'close', async function (this: StorageBackedSession, context: Parameters<StorageBackedSession['close']>[0]) {
    await sessionClose.call(this, context);
    throw new Error('fixture_session_close_failure');
  });
  const repoClose = t.mock.method(JsonlSessionRepo.prototype, 'close');
  try {
    await assert.rejects(openLaneHistory({ projectDir: fixture.projectDir }), /fixture_.*_failure/);
    assert.equal(repoClose.mock.callCount(), 1);
  } finally { t.mock.restoreAll(); }
  // An actual new repository can reopen the same temporary history after failed cleanup.
  const reopened = await openLaneHistory({ projectDir: fixture.projectDir });
  await reopened.close();
});
