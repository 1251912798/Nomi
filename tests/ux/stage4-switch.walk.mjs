#!/usr/bin/env node
import { stationTimeout } from './_station-budget.mjs'
// Four real lane UI states. Only the external provider is a loopback fixture.
import { clickOrFail, expect, expectAbsent, proveProbe } from './_assert.mjs'
import { FIXTURE_TEXT_MODEL_LABEL, flattenRequestText } from './agent-runtime-fixture.mjs'
import {
  APPROVAL_CARD, COMPOSER, COMPOSER_INPUT, COMPOSER_MODEL, COMPOSER_PERMISSION,
  CREATION_PANEL, DOCUMENT, INTERVENTION_CONFIRM, QUEUE, TASK_CARD,
  chooseAssistantModel, createRuntimeWalk, hasToolResult, newConversation,
  permissionTier, readProject, recorded, selectConversation, sendCreation, waitForV4TurnIdle,
} from './agent-runtime-walk-support.mjs'
import { laneDiskSnapshot, laneMessages, laneMessageText, readLaneTranscripts } from './agent-lane-observer.mjs'

const WRITE = 'S4_WRITE：在文稿末尾追加一句话，先让我确认。'
const TASK = 'S4_TASK：为这段创作安排一个可审阅的制作任务。'
const QUEUED = 'S4_QUEUE：接下来记住杯子保持红色。'
const STEER = 'S4_STEER：请把这一句也带到下一次思考。'
const DIRECTIONS = [{ key: 'a', title: '清晨红杯', oneLiner: '跟随创作者准备拍摄。' },
  { key: 'b', title: '杯沿光影', oneLiner: '用近景展示光线和质感。' }]
const walk = await createRuntimeWalk('stage4-switch')
let failure
try {
  const { win } = await walk.start({ first: true })
  const { projectId, projectRoot, name: projectName } = await walk.newProject()
  await win.locator(DOCUMENT).fill('红色杯子放在窗边的白桌上。')
  await chooseAssistantModel(win, FIXTURE_TEXT_MODEL_LABEL)
  await clickOrFail(win.locator(`${CREATION_PANEL} ${COMPOSER_MODEL}`), '收起模型弹层')
  await newConversation(win, CREATION_PANEL)
  await expect.poll(() => readLaneTranscripts(projectRoot).length).toBe(2)
  const created = readLaneTranscripts(projectRoot).find((session) => session.laneName !== 'main')
  expect(created?.sessionId).toBeTruthy()
  expect(laneMessages(created)).toEqual([])
  await walk.snap('new-conversation')

  await clickOrFail(win.locator(`${CREATION_PANEL} ${COMPOSER_PERMISSION}`), '打开权限档位')
  await clickOrFail(win.locator(permissionTier('step')), '每步问')
  const write = walk.fixture.expectText({ label: 'real document append requires confirmation',
    match: (body) => flattenRequestText(body).includes(WRITE),
    reply: { type: 'tool', id: 's4-append', name: 'append_to_end', args: { content: '\n阳光照亮杯沿。' } },
  })
  const written = walk.fixture.expectText({ label: 'approved append returns its actual receipt',
    match: (body) => hasToolResult(body, 's4-append'), reply: { type: 'text', text: '已按你的确认追加到文稿。' } })
  await sendCreation(win, WRITE)
  await recorded(write.received, 'document append request')
  const card = win.locator(`${CREATION_PANEL} ${APPROVAL_CARD}`)
  const proof = await proveProbe(card, 'real lane approval is visible before the document changes')
  await expect(win.locator(DOCUMENT)).not.toContainText('阳光照亮杯沿')
  await walk.snap('approval-card')
  await clickOrFail(card.locator(INTERVENTION_CONFIRM), '确认文稿修改')
  await recorded(written.received, 'approved document receipt')
  await expectAbsent(card, { provenBy: proof, message: 'The confirmed lane approval is consumed' })
  await waitForV4TurnIdle(win, { panel: CREATION_PANEL,
    settledBy: win.locator(CREATION_PANEL).getByText('已按你的确认追加到文稿。', { exact: true }) })
  await expect(win.locator(DOCUMENT)).toContainText('阳光照亮杯沿')
  await expect.poll(async () => JSON.stringify((await readProject(win, projectId)).payload.workbenchDocuments)).toContain('阳光照亮杯沿')

  await clickOrFail(win.locator(`${CREATION_PANEL} ${COMPOSER_PERMISSION}`), '切回自动改')
  await clickOrFail(win.locator(permissionTier('safe-auto')), '自动改')
  const groups = walk.fixture.expectText({ label: 'ask the real native assembly for production tools',
    match: (body) => flattenRequestText(body).includes(TASK),
    reply: { type: 'tool', id: 's4-tools', name: 'nomi_request_tools', args: { group: 'production' } } })
  const task = walk.fixture.expectText({ label: 'create the actual production draft',
    match: (body) => hasToolResult(body, 's4-tools'),
    reply: { type: 'tool', id: 's4-task', name: 'start_production_run', args: { goal: 'S4_TASK_GOAL：红杯创作短片', durationSeconds: 15 } } })
  const taskDone = walk.fixture.expectText({ label: 'production draft result returns to the initiating lane',
    match: (body) => hasToolResult(body, 's4-task'), reply: { type: 'text', text: '制作任务已创建，等你审阅方向。' } })
  const directions = walk.fixture.expectText({ label: 'the real production task prepares its direction candidates once',
    match: (body) => flattenRequestText(body).includes('S4_TASK_GOAL') && flattenRequestText(body).includes('资深创意总监'),
    reply: { type: 'text', text: JSON.stringify({ candidates: DIRECTIONS }) } })
  await sendCreation(win, TASK)
  await recorded(groups.received, 'deferred tool request')
  await recorded(task.received, 'production draft request')
  await recorded(taskDone.received, 'production result in the lane')
  await waitForV4TurnIdle(win, { panel: CREATION_PANEL,
    settledBy: win.locator(CREATION_PANEL).getByText('制作任务已创建，等你审阅方向。', { exact: true }) })
  await expect(win.locator(`${CREATION_PANEL} ${TASK_CARD}`)).toBeVisible()
  const saved = readLaneTranscripts(projectRoot).find((session) => session.sessionId === created.sessionId)
  const note = saved.entries.find((entry) => entry.type === 'custom' && entry.customType === 'nomi.ui.task')
  expect(note?.data.productionRunId).toBeTruthy()
  const run = await win.evaluate(({ pid, rid }) => window.nomiDesktop.productionRuns.read(pid, rid),
    { pid: projectId, rid: note.data.productionRunId })
  const directionWire = await recorded(directions.received, 'ephemeral direction request')
  expect(directionWire.body.tools ?? []).toEqual([])
  expect(flattenRequestText(directionWire.body)).not.toContain(WRITE)
  await expect.poll(async () => {
    const ready = await win.evaluate(({ pid, rid }) => window.nomiDesktop.productionRuns.read(pid, rid),
      { pid: projectId, rid: note.data.productionRunId })
    return ready.gates.find((gate) => gate.gateId === 'gate-direction-v1')?.directionCandidates
  }, { timeout: stationTimeout({ operations: 2 }) }).toEqual(DIRECTIONS)
  expect(run.runId).toBe(note.data.productionRunId)
  expect(run.status).toBe('awaiting_direction')
  expect(run.budget.actual).toBe(0)
  expect(run.artifacts.every((artifact) => !['image', 'video'].includes(artifact.kind))).toBe(true)
  await expect(win.locator(`${CREATION_PANEL} ${TASK_CARD}`).locator('button, img, [data-artifact-id]'),
    'Brief and direction records are not media candidates').toHaveCount(0)
  const taskFactsText = await win.locator(`${CREATION_PANEL} ${TASK_CARD}`).innerText()
  await walk.snap('task-card')

  const holding = walk.fixture.expectText({ label: 'hold a real streaming turn while the user queues messages',
    match: (body) => flattenRequestText(body).includes('S4_HOLD'), reply: { type: 'hold', text: '正在核对镜头，稍后继续。' } })
  const firstQueued = walk.fixture.expectText({ label: 'pi consumes queued inputs one at a time',
    match: (body) => flattenRequestText(body).includes(QUEUED) && !flattenRequestText(body).includes(STEER),
    reply: { type: 'tool', id: 's4-read-after-first', name: 'read_full_text', args: {} } })
  const continued = walk.fixture.expectText({ label: 'the second queued input is consumed after the first',
    match: (body) => flattenRequestText(body).includes(QUEUED) && flattenRequestText(body).includes(STEER),
    reply: { type: 'text', text: '两句补充都已收到，杯子保持红色。' } })
  await sendCreation(win, 'S4_HOLD：先核对当前镜头。')
  await recorded(holding.received, 'held stream')
  await expect(win.locator(`${CREATION_PANEL} ${COMPOSER}`)).toHaveAttribute('data-mode', 'running')
  const input = win.locator(`${CREATION_PANEL} ${COMPOSER_INPUT}`)
  await input.fill(QUEUED)
  await input.press('Enter')
  await expect(win.locator(`${CREATION_PANEL} ${QUEUE}`)).toContainText(QUEUED)
  await input.fill(STEER)
  await input.press('Enter')
  await expect(win.locator(`${CREATION_PANEL} ${QUEUE}`)).toContainText(STEER)
  await walk.snap('queue-and-steer')
  const taskGeometry = await win.locator(`${CREATION_PANEL} ${TASK_CARD}`).evaluate((node) => ({
    visible: node.clientHeight, content: node.scrollHeight,
  }))
  expect(taskGeometry.visible, 'Long conversations scroll instead of shrinking the task into a clipped border')
    .toBeGreaterThanOrEqual(taskGeometry.content)
  holding.release({ type: 'text', text: '当前检查完成。' })
  const firstQueuedWire = await recorded(firstQueued.received, 'first queued instruction')
  expect(flattenRequestText(firstQueuedWire.body)).not.toContain(STEER)
  await recorded(continued.received, 'queued continuation')
  await waitForV4TurnIdle(win, { panel: CREATION_PANEL,
    settledBy: win.locator(CREATION_PANEL).getByText('两句补充都已收到，杯子保持红色。', { exact: true }) })
  const final = readLaneTranscripts(projectRoot)
  const main = final.find((session) => session.laneName === 'main')
  expect(laneMessages(main)).toEqual([])
  expect(laneMessages(final.find((session) => session.sessionId === created.sessionId))
    .filter((message) => message.role === 'nomi.input').map(laneMessageText)).toEqual([WRITE, TASK, 'S4_HOLD：先核对当前镜头。', QUEUED, STEER])
  await selectConversation(win, CREATION_PANEL, '未命名对话')
  await selectConversation(win, CREATION_PANEL, created.laneName)
  await expect(win.locator(CREATION_PANEL)).toContainText('两句补充都已收到')
  const requestsBeforeRestart = walk.fixture.requests.length
  await walk.stopApp()
  const durable = laneDiskSnapshot(projectRoot)
  const { win: cold } = await walk.start()
  const projectCard = cold.locator('[data-project-card="true"]').filter({ hasText: projectName })
  await expect(projectCard).toBeVisible()
  await projectCard.hover()
  await clickOrFail(projectCard.getByRole('button', { name: /继续创作/ }), '冷启动打开刚才的项目')
  await clickOrFail(cold.getByRole('button', { name: '创作', exact: true }), '冷启动返回文稿')
  await expect(cold.locator(DOCUMENT)).toContainText('阳光照亮杯沿')
  await expect(cold.locator(CREATION_PANEL), 'Cold restart restores the last selected conversation before any manual switch')
    .toContainText('两句补充都已收到')
  await expect(cold.locator(`${CREATION_PANEL} ${TASK_CARD}`)).toBeVisible()
  await expect(cold.locator(`${CREATION_PANEL} ${TASK_CARD}`), 'Cold task restores its live status, progress, and budget')
    .toHaveText(taskFactsText, { useInnerText: true })
  expect(laneDiskSnapshot(projectRoot), 'Cold history opening preserves every stored byte').toEqual(durable)
  expect(walk.fixture.requests).toHaveLength(requestsBeforeRestart)
  walk.fixture.assertClean()
  walk.report.verified = ['new-lane-isolated-history', 'approval-before-persisted-document-write',
    'real-production-task-note', 'queued-inputs-consumed-in-array-order', 'cold-restart-no-request-and-identical-jsonl']
} catch (error) { failure = error; process.exitCode = 1 }
finally { await walk.finish(failure) }
