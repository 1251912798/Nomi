import assert from 'node:assert/strict';
import { once } from 'node:events';
import { access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { createLaneFixture } from './laneFixture.mjs';
import { deferred } from './stage3ProbeHarness.mjs';

function cleanupContext() {
  const hooks: Array<() => unknown> = [];
  return {
    context: { after: (fn: () => unknown) => { hooks.push(fn); } } as TestContext,
    run: async () => { for (const hook of hooks) await hook(); },
  };
}

test('fixture teardown waits for the lane close completion before removing its directory', async () => {
  const cleanup = cleanupContext();
  const fixture = await createLaneFixture(cleanup.context, []);
  const entered = deferred();
  const release = deferred();
  fixture.after(async () => {
    entered.resolve();
    await release.promise;
    await writeFile(join(fixture.projectDir, 'last-write'), 'close finished');
  });
  const closing = cleanup.run();
  await entered.promise;
  try { await access(fixture.projectDir); }
  finally { release.resolve(); await closing; }
  await assert.rejects(access(fixture.projectDir), { code: 'ENOENT' });
});

test('one failing owner still closes other owners and HTTP, and preserves the directory for diagnosis', async () => {
  const cleanup = cleanupContext();
  const fixture = await createLaneFixture(cleanup.context, []);
  const order: string[] = [];
  fixture.after(() => { order.push('first'); });
  fixture.after(() => { order.push('second'); throw new Error('injected close failure'); });
  await assert.rejects(cleanup.run(), /injected close failure/);
  assert.deepEqual(order, ['second', 'first']);
  await assert.rejects(fetch(fixture.http.baseURL));
  await access(fixture.projectDir);
  // The failed cleanup deliberately retains evidence; this test owns removing its fake evidence.
  const { rm } = await import('node:fs/promises');
  await rm(fixture.projectDir, { recursive: true, force: true });
});

test('an assertion and failing cleanup cannot strand the parked crash child or node:test runner', async (t) => {
  const { spawn } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // This is an independent runner, not its parent's test worker.
  const runner = spawn(process.execPath, ['--test', '--test-reporter=tap',
    fileURLToPath(new URL('./lane-fixture-failure-child.mjs', import.meta.url)),
  ], { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000, killSignal: 'SIGKILL' });
  // A test-runner timeout alone does not reap its grandchildren. This owns only our group.
  t.after(() => {
    try { process.kill(-runner.pid!, 'SIGKILL'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  });
  const closed = once(runner, 'close');
  let output = '';
  runner.stdout.setEncoding('utf8').on('data', (chunk: string) => { output += chunk; });
  runner.stderr.setEncoding('utf8').on('data', (chunk: string) => { output += chunk; });
  const [code, signal] = await closed;
  const directory = /FIXTURE_DIR=(\S+)/.exec(output)?.[1];
  if (directory) {
    const { rm } = await import('node:fs/promises');
    t.after(() => rm(directory, { recursive: true, force: true }));
  }
  assert.equal(signal, null, `runner must exit itself, not hit the outer kill guard:\n${output}`);
  assert.equal(code, 1, 'the deliberate assertion must still fail');
  assert.match(output, /injected assertion before explicit child kill/);
  assert.match(output, /# fail 1/);
});

test('a failing fixture cannot skip teardown of a sibling fixture in the same test', async () => {
  const cleanup = cleanupContext();
  const failed = await createLaneFixture(cleanup.context, []);
  const sibling = await createLaneFixture(cleanup.context, []);
  failed.after(() => { throw new Error('first fixture failed'); });
  await assert.rejects(cleanup.run(), /first fixture failed/);
  await assert.rejects(fetch(sibling.http.baseURL));
  await assert.rejects(access(sibling.projectDir), { code: 'ENOENT' });
  const { rm } = await import('node:fs/promises');
  await rm(failed.projectDir, { recursive: true, force: true });
});
