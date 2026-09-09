#!/usr/bin/env node
// Isolated old-version conversation -> real desktop migration -> continuation -> fresh lane.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { clickOrFail, expect, expectAbsent, proveProbe } from './_assert.mjs'
import { FIXTURE_TEXT_MODEL_LABEL, flattenRequestText } from './agent-runtime-fixture.mjs'
import { CREATION_PANEL, COMPOSER_MODEL, chooseAssistantModel, createRuntimeWalk,
  newConversation, recorded, sendCreation, waitForV4TurnIdle } from './agent-runtime-walk-support.mjs'

const OLD = '旧版任务：让开场的红色杯子出现在窗边。'
const ANSWER = '旧版回答：先拍窗边的红色杯子，再切向人物。'
const NEXT = '延续旧版任务，说说下一镜。'
const walk = await createRuntimeWalk('lane-legacy-migration')
let failure
try {
  let { win } = await walk.start({ first: true })
  const { projectId, projectRoot, name } = await walk.newProject()
  await walk.stopApp()
  // Only this walk's freshly created empty fixture; no actual library is visited.
  expect(path.relative(walk.report.tempRoot, projectRoot).startsWith('..')).toBe(false)
  const nomi = path.join(projectRoot, '.nomi')
  fs.rmSync(path.join(nomi, 'agent-sessions'), { recursive: true, force: true })
  fs.rmSync(path.join(nomi, 'agent-workspace.json'), { force: true })
  const bytes = Buffer.from(JSON.stringify({ sessions: { legacy: [
    { role: 'user', content: OLD }, { role: 'assistant', content: ANSWER },
  ] } }))
  const source = path.join(nomi, 'agent-session.json')
  fs.writeFileSync(source, bytes)
  const sourceHash = createHash('sha256').update(bytes).digest('hex')
  const openProject = async () => {
    ;({ win } = await walk.start())
    const card = win.locator('[data-project-card="true"]').filter({ hasText: name })
    await expect(card).toBeVisible(); await card.hover()
    await clickOrFail(card.getByRole('button', { name: /继续创作/ }), '打开带旧历史的临时项目')
    await win.waitForFunction(id => location.href.includes(`projectId=${encodeURIComponent(id)}`), projectId)
    await clickOrFail(win.getByRole('button', { name: '创作', exact: true }), '查看旧对话')
  }
  await openProject()
  const banner = () => win.locator(`${CREATION_PANEL} [data-v4-legacy="true"]`)
  await expect(banner()).toHaveText('这段对话来自旧版本')
  await expect(win.locator(CREATION_PANEL)).toContainText(OLD)
  await expect(win.locator(CREATION_PANEL)).toContainText(ANSWER)
  expect(walk.fixture.requests).toHaveLength(0)
  const manifestFile = path.join(nomi, 'lane-legacy-migration.json')
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  expect(manifest.phase).toBe('completed')
  expect(manifest.counts).toMatchObject({ conversations: 1, sourceItems: 2, parts: 2 })
  const archive = path.join(nomi, 'legacy-archive', manifest.transactionId, 'agent-chat-v2.json')
  expect(createHash('sha256').update(fs.readFileSync(archive)).digest('hex')).toBe(sourceHash)
  expect(fs.existsSync(source)).toBe(false)
  await walk.snap('legacy-history-with-source-line')
  await walk.stopApp(); await openProject()
  await expect(banner()).toBeVisible()
  expect(walk.fixture.requests).toHaveLength(0)
  await walk.snap('cold-open-migrated-history')
  await chooseAssistantModel(win, FIXTURE_TEXT_MODEL_LABEL)
  await clickOrFail(win.locator(`${CREATION_PANEL} ${COMPOSER_MODEL}`), '收起模型选择')
  const continued = walk.fixture.expectText({ label: 'continue migrated context through actual lane',
    match: body => flattenRequestText(body).includes(NEXT), reply: { type: 'text', text: '下一镜从红色杯子移向人物的手。' } })
  await sendCreation(win, NEXT)
  const wire = await recorded(continued.received, 'migrated continuation')
  expect(flattenRequestText(wire.body)).toContain(OLD)
  expect(flattenRequestText(wire.body)).toContain(ANSWER)
  await waitForV4TurnIdle(win, { panel: CREATION_PANEL,
    settledBy: win.locator(CREATION_PANEL).getByText('下一镜从红色杯子移向人物的手。', { exact: true }) })
  await expect(banner()).toBeVisible()
  await walk.snap('continue-migrated-history')
  const legacyProof = await proveProbe(banner(), 'migrated lane visibly has the source banner')
  await newConversation(win, CREATION_PANEL)
  await expectAbsent(banner(), { provenBy: legacyProof })
  await expect(win.locator(CREATION_PANEL)).not.toContainText(OLD)
  await walk.snap('new-conversation-has-no-legacy-line')
  walk.report.migrationCounts = manifest.counts
  walk.report.verified = ['byte-exact-archive', 'source-moved', 'history-without-model-request',
    'cold-reopen', 'continuation-keeps-legacy-context', 'banner-only-on-migrated-lane']
} catch (error) { failure = error; process.exitCode = 1 }
finally { await walk.finish(failure) }
