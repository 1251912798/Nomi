import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { makeTempDir } from '../_test-temp.mjs'
import { killProcessTree, processTreeSpawnOptions } from './processTree.mjs'

const waitFor = async (predicate, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.fail('等待进程树收尾超时')
}

const isAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error.code === 'ESRCH') return false
    throw error
  }
}

test('POSIX 子进程组选项与整组终止覆盖后代进程', async (t) => {
  if (process.platform === 'win32') return t.skip('Windows 使用 taskkill /T')
  const dir = makeTempDir('nomi-process-tree-')
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const childPidFile = path.join(dir, 'child.pid')
  const parent = spawn(process.execPath, ['-e', [
    "const { spawn } = require('node:child_process')",
    `spawn(process.execPath, ['-e', ${JSON.stringify("require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)")}, ${JSON.stringify(childPidFile)}], { stdio: 'ignore' })`,
    'setInterval(() => {}, 1000)',
  ].join(';')], { ...processTreeSpawnOptions(), stdio: 'ignore' })
  t.after(() => { if (parent.exitCode === null) killProcessTree(parent, 'SIGKILL') })
  await waitFor(() => fs.existsSync(childPidFile))
  const childPid = Number(fs.readFileSync(childPidFile, 'utf8'))
  assert.ok(childPid > 0)
  killProcessTree(parent, 'SIGKILL')
  await new Promise((resolve) => parent.once('close', resolve))
  await waitFor(() => !isAlive(childPid))
})
