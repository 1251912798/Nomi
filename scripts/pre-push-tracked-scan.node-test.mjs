import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { trackedFiles } from './lib/gitPaths.mjs'

const REPO_SCAN_FILES = [
  'scripts/check-test-copy-literals.mjs',
  'scripts/check-test-waits.mjs',
]

export function repositoryWalkSites(source) {
  return [...String(source).matchAll(/\b(?:fs\.)?readdirSync\s*\(/g)].map((match) => match.index)
}

test('推送前扫描器只从 git 文件清单取输入', () => {
  for (const file of REPO_SCAN_FILES) {
    const source = fs.readFileSync(file, 'utf8')
    assert.deepEqual(repositoryWalkSites(source), [], `${file} 不得递归遍历仓库目录；请使用 trackedFiles()`)
  }
})

test('反例：扫描器写回 readdirSync 递归遍历时结构门必红', () => {
  assert.deepEqual(repositoryWalkSites('function walk(dir) { for (const e of fs.readdirSync(dir)) walk(e) }'), [37])
})

test('trackedFiles 只返回会进提交的文件，gitignore 产物不算', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-tracked-scan-'))
  try {
    execFileSync('git', ['init', '-q'], { cwd: root })
    fs.writeFileSync(path.join(root, '.gitignore'), 'ignored.json\n')
    fs.writeFileSync(path.join(root, 'ignored.json'), 'ignored\n')
    fs.writeFileSync(path.join(root, 'tracked.json'), 'tracked\n')
    execFileSync('git', ['add', '.gitignore', 'tracked.json'], { cwd: root })
    assert.deepEqual(trackedFiles({ cwd: root }), ['.gitignore', 'tracked.json'])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
