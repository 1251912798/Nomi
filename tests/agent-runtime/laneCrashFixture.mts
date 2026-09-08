import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { LaneFixture } from './laneFixture.mjs';

/** Both crash probes own the child before awaiting readiness or making assertions. */
export function spawnLaneCrashChild(fixture: LaneFixture) {
  const child = spawn(process.execPath, [
    fileURLToPath(new URL('./stage3-probe-crash-child.mjs', import.meta.url)),
    fixture.projectDir, fixture.http.baseURL,
  ], { stdio: ['ignore', 'pipe', 'inherit'] });
  // close includes stdio completion; kill() itself is only a signal delivery request.
  const closed = once(child, 'close');
  const close = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed;
  };
  fixture.after(close);
  const lines = createInterface({ input: child.stdout });
  let stdout = '';
  const parked = new Promise<string>((resolve) => {
    lines.on('line', (line) => {
      stdout += `${line}\n`;
      const match = /^PARKED session=(\S+)$/.exec(line);
      if (match) resolve(match[1]);
    });
  });
  const sessionId = Promise.race([
    parked,
    closed.then(() => { throw new Error(`crash child exited before PARKED:\n${stdout}`); }),
  ]);
  return { child, sessionId, close };
}
