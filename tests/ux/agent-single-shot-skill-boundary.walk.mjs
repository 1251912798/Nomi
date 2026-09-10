#!/usr/bin/env node
// Public IPC negative control, separate from the production user journey.
import { expect } from './_assert.mjs'
import { createRuntimeWalk } from './agent-runtime-walk-support.mjs'
import { laneDiskSnapshot, readLaneTranscripts } from './agent-lane-observer.mjs'

const walk = await createRuntimeWalk('single-shot-skill-boundary')
let failure
try {
  const { win } = await walk.start({ first: true })
  const { projectId, projectRoot } = await walk.newProject()
  await expect.poll(() => readLaneTranscripts(projectRoot).length).toBe(1)
  const before = laneDiskSnapshot(projectRoot)
  const result = await win.evaluate((id) => window.nomiDesktop.agentLane.send({
    kind: 'single-shot', requestId: 'missing-installed-skill', projectId: id,
    featureKey: 'fixture-negative-control', prompt: 'No provider request is allowed.',
    context: { approvalPolicy: { mode: 'step', spend: 'confirm' }, skillKey: 'fixture.nonexistent-installed-skill' },
  }), projectId)
  expect(result).toMatchObject({ ok: false, message: 'agent_skill_unavailable' })
  expect(walk.fixture.requests).toHaveLength(0)
  expect(laneDiskSnapshot(projectRoot)).toEqual(before)
  walk.fixture.assertClean()
  walk.report.verified = ['explicit-missing-skill-is-rejected-before-provider-and-history']
} catch (error) { failure = error; process.exitCode = 1 }
finally { await walk.finish(failure) }
