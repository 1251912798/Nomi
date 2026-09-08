import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { asyncWaitForFunctionLines, collectTestFiles, unownedLaneCleanupLines } from './check-test-waits.mjs'

test('lane cleanup rejects rm-first hooks and separate or unawaited close hooks', () => {
  const source = [
    't.after(() => rm(projectDir, { recursive: true, force: true }));',
    't.after(() => lane.close());',
    'afterEach(async () => { lane.close(); await rm(fixture.projectDir, { recursive: true }); });',
    't.after(async () => { await lane.close(); await rm(projectDir, { recursive: true }); });',
  ].join('\n')
  assert.deepEqual([...unownedLaneCleanupLines(source, 'tests/agent-runtime/laneFixture.mts')], [0, 2, 3])
})

test('lane cleanup recognizes aliases, multiline callbacks and bracket access', () => {
  const source = [
    "import { rm as remove } from 'node:fs/promises';",
    "import { afterEach as teardown } from 'node:test';",
    'const directory = fixture["projectDir"];',
    'const cleanup = () => remove(directory, { recursive: true });',
    'teardown(cleanup);',
    'function setup(ctx: TestContext) {',
    '  ctx["after"](',
    '    async () => { await fs.rm(projectDir, { recursive: true }); });',
    '}',
    'const projectDir = await mkdtemp("nomi-lane-");',
    'const alias = projectDir;',
    'afterEach(() => rm(alias));',
  ].join('\n')
  assert.deepEqual([...unownedLaneCleanupLines(source, 'tests/agent-runtime/helper.mts')], [3, 7, 11])
})

test('lane cleanup leaves owner-managed teardown, completed evidence and ordinary directories alone', () => {
  const source = [
    '// t.after(() => rm(projectDir));',
    'const example = "t.after(() => rm(projectDir))";',
    'fixture.after(() => lane.close());',
    'registerFixtureCleanup(t, async () => { await close(); await rm(projectDir); });',
    'cleanup.after(() => rm(projectDir));',
    'await rm(fixture.projectDir);',
    't.after(() => rm(snapshotDir));',
  ].join('\n')
  assert.equal(unownedLaneCleanupLines(source, 'tests/agent-runtime/helper.mts').size, 0)
  assert.equal(unownedLaneCleanupLines('t.after(() => rm(projectDir))', 'tests/ux/example.test.mjs').size, 0)
})

test('lane cleanup recognizes inferred test contexts instead of depending on the name t', () => {
  const source = 'test("example", async (context) => { context.after(() => rm(projectDir)); });'
  assert.deepEqual([...unownedLaneCleanupLines(source, 'tests/agent-runtime/example.test.mts')], [0])
})

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
    assert.deepEqual(collectTestFiles(root).map((file) => path.relative(root, file).replaceAll(path.sep, '/')).sort(), included.sort())
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
