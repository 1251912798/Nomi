import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { asyncWaitForFunctionLines, collectTestFiles } from './check-test-waits.mjs'

test('rejects inline, multiline, commented and parenthesized async callbacks', () => {
  const source = [
    'await page.waitForFunction(async () => false)',
    'await getWin().waitForFunction(',
    '  /* persisted state */ async (id) => await read(id))',
    'await page["waitForFunction"]((async function () { return false }))',
  ].join('\n')
  assert.deepEqual([...asyncWaitForFunctionLines(source)], [0, 1, 3])
})

test('ignores comments, strings, synchronous DOM predicates and awaited evaluate samples', () => {
  const source = [
    '// page.waitForFunction(async () => false)',
    '/* page.waitForFunction(async () => false) */',
    'const example = "page.waitForFunction(async () => false)"',
    'await page.waitForFunction(() => document.readyState === "complete")',
    'await expect.poll(async () => page.evaluate(async () => await read())).toBe(true)',
  ].join('\n')
  assert.equal(asyncWaitForFunctionLines(source).size, 0)
})

test('discovers real walk/e2e/helper scripts and unit tests while skipping generated dependencies', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-test-waits-'))
  try {
    const included = ['tests/ux/a.walk.mjs', 'tests/ux/b.e2e.mjs', 'tests/ux/_read.mjs', 'tests/example.spec.ts', 'electron/example.test.ts', 'scripts/check.node-test.mjs']
    const excluded = ['tests/ux/notes.md', 'tests/node_modules/hidden.test.ts', 'tests/dist/generated.mjs', 'src/product.ts']
    for (const file of [...included, ...excluded]) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
      fs.writeFileSync(path.join(root, file), '')
    }
    assert.deepEqual(collectTestFiles(root).map((file) => path.relative(root, file)).sort(), included.sort())
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
