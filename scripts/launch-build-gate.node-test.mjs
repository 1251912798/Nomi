import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'
import { launchNomiApp, repoRoot } from '../tests/ux/_launchApp.mjs'
import { verifyBuild } from './package-build-stamp.mjs'

// launchNomiApp 起开发构建之前必须核构建戳：戳缺失 / 过期时拒跑，且根本不去调 electron.launch。
// 本工作树的构建状态由 verifyBuild 说了算，两种状态下断言都成立（CI 里构建在前，戳一致）。
test('launchNomiApp refuses a missing or stale build before spawning Electron', async (t) => {
  assert.equal(repoRoot, path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'))
  let stale = false
  try { verifyBuild(repoRoot) } catch { stale = true }
  let spawned = 0
  t.mock.method(electron, 'launch', async () => { spawned += 1; return { process: () => ({}), close: async () => {} } })
  const attempt = launchNomiApp({ name: 'build-gate', waitForWindow: false, allowUntrackedProcessForTest: true })
  if (stale) {
    await assert.rejects(attempt, /构建产物比源码旧（或没有构建），先跑 pnpm run build/)
    assert.equal(spawned, 0)
  } else {
    await attempt.catch((error) => assert.doesNotMatch(String(error?.message), /构建产物比源码旧/))
  }
})
