import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { URL } from 'node:url'
import yaml from 'js-yaml'

const workflow = yaml.load(fs.readFileSync(new URL('../../.github/workflows/docs-autosync.yml', import.meta.url), 'utf8'))
const steps = workflow.jobs.autosync.steps
const publish = steps.find((step) => step.id === 'publish')

test('both triggers share a serialized fixed-branch action publisher', () => {
  assert.deepEqual(workflow.on.push.branches, ['main'])
  assert.deepEqual(workflow.on.workflow_dispatch, {})
  assert.equal(workflow.concurrency.group, 'docs-autosync')
  assert.equal(workflow.concurrency['cancel-in-progress'], false)
  assert.equal(steps.filter((step) => step.uses?.startsWith('peter-evans/create-pull-request@')).length, 1)
  assert.equal(publish.uses, 'peter-evans/create-pull-request@v7')
  assert.equal(publish.with.branch, 'docs/autosync')
  assert.equal(publish.with.base, 'main')
  assert.equal(publish.with['branch-suffix'], undefined)
  assert.equal(publish.if, undefined, 'no-diff runs must reach the upstream PR convergence logic')
  assert.equal(publish.run, undefined, 'upstream action owns the complete publication lifecycle')
})

test('default token owns publication without recursive dispatch or CI suppression', () => {
  assert.deepEqual(workflow.permissions, { contents: 'write', 'pull-requests': 'write' })
  assert.equal(publish.with.token, '${{ secrets.GITHUB_TOKEN }}')
  const checkout = steps.find((step) => step.uses?.startsWith('actions/checkout@'))
  assert.equal(checkout.with.token, undefined, 'checkout uses its default GITHUB_TOKEN')
  assert.equal(checkout.with.ref, 'main')
  assert.doesNotMatch(JSON.stringify(workflow), /DOCS_AUTOSYNC_TOKEN|gh pr create|gh workflow run|git push|\[(?:skip ci|ci skip|no ci|skip actions|actions skip)\]|skip-checks:\s*true|--force|--no-verify|core\.hooksPath/i)
})

test('each failed docs gate stops the real verification shell before publication', (t) => {
  const repair = steps.findIndex((step) => step.run === 'node scripts/repair-doc-gates.mjs')
  const verify = steps.findIndex((step) => step.name === 'Verify the three gates are green on the repaired tree')
  assert.ok(repair >= 0 && verify > repair && steps.indexOf(publish) > verify)
  assert.equal(steps[verify]['continue-on-error'], undefined)
  assert.equal(publish.with['add-paths'].trim(), 'docs')
  const gates = ['check:docs-index', 'check:doc-status', 'check:ledger']
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-autosync-gates-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const log = path.join(root, 'calls')
  fs.writeFileSync(path.join(root, 'pnpm'), '#!/bin/sh\nprintf "%s\\n" "$2" >> "$AUTOSYNC_GATE_LOG"\n[ "$2" != "$AUTOSYNC_FAIL_GATE" ]\n', { mode: 0o755 })
  for (const failed of ['', ...gates]) {
    fs.writeFileSync(log, '')
    const result = spawnSync('bash', ['-e', '-c', steps[verify].run], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${root}:${process.env.PATH}`, AUTOSYNC_GATE_LOG: log, AUTOSYNC_FAIL_GATE: failed },
    })
    assert.equal(result.status, failed ? 1 : 0, result.stderr)
    assert.deepEqual(fs.readFileSync(log, 'utf8').trim().split('\n'), failed ? gates.slice(0, gates.indexOf(failed) + 1) : gates)
  }
})

test('generated PR explains default-token recursion protection and its approval boundary', () => {
  assert.match(publish.with.body, /https:\/\/docs\.github\.com\/en\/actions\/how-tos\/write-workflows\/choose-when-workflows-run\/trigger-a-workflow/)
  assert.match(publish.with.body, /GITHUB_TOKEN/)
  assert.match(publish.with.body, /approval/i)
})
