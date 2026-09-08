import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { URL } from 'node:url'
import yaml from 'js-yaml'

const workflow = yaml.load(fs.readFileSync(new URL('../../.github/workflows/docs-autosync.yml', import.meta.url), 'utf8'))
const publish = workflow.jobs.autosync.steps.find((step) => step.id === 'publish')

test('autosync uses a PR-triggering token and separates its trigger branch from its write branch', () => {
  assert.equal(workflow.jobs.autosync.env.GH_TOKEN, '${{ secrets.DOCS_AUTOSYNC_TOKEN }}')
  const checkout = workflow.jobs.autosync.steps.find((step) => step.uses?.startsWith('actions/checkout@'))
  assert.equal(checkout.with.token, '${{ env.GH_TOKEN }}')
  assert.deepEqual(workflow.on.push.branches, ['main'])
  assert.equal(workflow.concurrency['cancel-in-progress'], false)
  assert.match(publish.run, /git push origin HEAD:refs\/heads\/docs\/autosync/)
  assert.doesNotMatch(publish.run, /gh workflow run|github\.token|secrets\.GITHUB_TOKEN/)
  assert.doesNotMatch(JSON.stringify(workflow), /\[(?:skip ci|ci skip|no ci|skip actions|actions skip)\]|--force|--no-verify|core\.hooksPath/)
})

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-autosync-ci-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const remote = path.join(root, 'remote.git')
  const repo = path.join(root, 'repo')
  const bin = path.join(root, 'bin')
  fs.mkdirSync(bin)
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  execFileSync('git', ['init', '--bare', remote], { stdio: 'pipe' })
  execFileSync('git', ['clone', remote, repo], { stdio: 'pipe' })
  git('config', 'user.name', 'Autosync fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  git('switch', '-c', 'main')
  fs.mkdirSync(path.join(repo, 'docs'))
  fs.writeFileSync(path.join(repo, 'docs/index.md'), 'original\n')
  git('add', '.')
  git('commit', '-m', 'initial main')
  git('push', 'origin', 'main')
  fs.writeFileSync(path.join(bin, 'gh'), `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
const root = process.env.AUTOSYNC_FIXTURE
fs.appendFileSync(root + '/calls.jsonl', JSON.stringify(args) + '\\n')
const pr = root + '/pr'
if (args[0] === 'pr' && args[1] === 'list') process.stdout.write(fs.existsSync(pr) ? '1' : '')
else if (args[0] === 'pr' && args[1] === 'create') fs.writeFileSync(pr, '1')
else if (args[0] === 'pr' && args[1] === 'close') fs.unlinkSync(pr)
else process.exit(2)
`, { mode: 0o755 })
  const run = () => {
    git('fetch', 'origin')
    git('switch', '--detach', 'origin/main')
    fs.writeFileSync(path.join(repo, 'docs/index.md'), 'repaired\n')
    return spawnSync('bash', ['-euo', 'pipefail', '-c', publish.run], {
      cwd: repo, encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, AUTOSYNC_FIXTURE: root, RUNNER_TEMP: root },
    })
  }
  const calls = () => fs.readFileSync(path.join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  return { root, repo, git, run, calls }
}

test('first run, identical rerun and main advancement keep one PR with fast-forward history', (t) => {
  assert.ok(publish, 'workflow must publish at one boundary')
  const f = fixture(t)
  let result = f.run()
  assert.equal(result.status, 0, result.stderr)
  const first = f.git('rev-parse', 'origin/docs/autosync')
  assert.doesNotMatch(f.git('log', '-1', '--format=%B', first), /\[skip ci\]/)
  result = f.run()
  assert.equal(result.status, 0, result.stderr)
  assert.equal(f.git('rev-parse', 'origin/docs/autosync'), first, 'same tree must not create another commit')
  // The prior run left a generated working tree, just as the runner does before teardown.
  f.git('restore', '--staged', '--worktree', '--source=HEAD', '--', 'docs')
  f.git('switch', 'main')
  fs.writeFileSync(path.join(f.repo, 'product.txt'), 'new main code\n')
  f.git('add', 'product.txt')
  f.git('commit', '-m', 'main advances')
  f.git('push', 'origin', 'main')
  result = f.run()
  assert.equal(result.status, 0, result.stderr)
  const second = f.git('rev-parse', 'origin/docs/autosync')
  assert.notEqual(second, first)
  f.git('merge-base', '--is-ancestor', first, second)
  f.git('merge-base', '--is-ancestor', 'origin/main', second)
  assert.equal(f.git('diff', '--name-only', 'origin/main', second), 'docs/index.md')
  assert.equal(f.calls().filter(([a, b]) => a === 'pr' && b === 'create').length, 1)
  assert.equal(f.calls().filter(([a]) => a === 'workflow').length, 0, 'normal PR events own CI')
})

test('no remaining repair closes the obsolete fixed PR without another push', (t) => {
  assert.ok(publish)
  const f = fixture(t)
  assert.equal(f.run().status, 0)
  const first = f.git('rev-parse', 'origin/docs/autosync')
  f.git('switch', 'main')
  fs.writeFileSync(path.join(f.repo, 'docs/index.md'), 'repaired\n')
  f.git('add', 'docs')
  f.git('commit', '-m', 'main incorporates repair')
  f.git('push', 'origin', 'main')
  const result = f.run()
  assert.equal(result.status, 0, result.stderr)
  assert.equal(f.git('rev-parse', 'origin/docs/autosync'), first)
  assert.equal(fs.existsSync(path.join(f.root, 'pr')), false)
})

test('missing CI credentials fail before checkout or publication', () => {
  const steps = workflow.jobs.autosync.steps
  const guard = steps.find((step) => step.id === 'credentials')
  assert.ok(guard)
  assert.ok(steps.indexOf(guard) < steps.findIndex((step) => step.uses?.startsWith('actions/checkout@')))
  const missing = spawnSync('bash', ['-eu', '-c', guard.run], { encoding: 'utf8', env: { ...process.env, GH_TOKEN: '' } })
  assert.equal(missing.status, 1)
  assert.match(missing.stdout, /::error::Configure DOCS_AUTOSYNC_TOKEN/)
  const configured = spawnSync('bash', ['-eu', '-c', guard.run], { encoding: 'utf8', env: { ...process.env, GH_TOKEN: 'test-only-placeholder' } })
  assert.equal(configured.status, 0)
})
