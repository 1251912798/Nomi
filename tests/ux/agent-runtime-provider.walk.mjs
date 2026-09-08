#!/usr/bin/env node
// Separate, explicitly enabled paid smoke. Uses a formal Nomi.app and synthetic text only.
// Never prints credentials or opens/copies a user's projects. No transport or model is mocked.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { launchNomiApp, repoRoot } from './_launchApp.mjs'
import { clickOrFail, expect, expectAbsent, proveProbe, screenshotSettled } from './_assert.mjs'
import {
  APPROVAL_CARD, CANVAS_PANEL, COMPOSER, COMPOSER_PERMISSION, CREATION_PANEL, DOCUMENT, INTERVENTION_CONFIRM, TOOL_RECEIPT,
  readProject, finalizeRuntimeWalk, openCanvas, sendCanvas, sendCreation,
  permissionTier, stopRuntimeApp, waitForV4TurnIdle,
} from './agent-runtime-walk-support.mjs'
import { laneMessages, readLaneTranscripts } from './agent-lane-observer.mjs'

if (process.env.NOMI_AGENT_LIVE !== '1') throw new Error('Explicit paid evaluation requires NOMI_AGENT_LIVE=1')
const [flag, executablePath, ...extra] = process.argv.slice(2)
if (flag !== '--packaged' || !path.isAbsolute(executablePath ?? '') || extra.length) {
  throw new Error('Usage: NOMI_AGENT_LIVE=1 node <walk.mjs> --packaged /absolute/Nomi.app/Contents/MacOS/Nomi')
}

const vendorKey = 'apimart'
const modelKey = 'deepseek-v4-pro'
const sourceRoot = process.env.NOMI_LIVE_SETTINGS || path.join(os.homedir(), 'Library/Application Support/Nomi')
if (!path.isAbsolute(sourceRoot)) throw new Error('NOMI_LIVE_SETTINGS must be an absolute directory')
const sourceFile = path.join(sourceRoot, 'model-catalog.json')
const sourceBytes = fs.readFileSync(sourceFile)
const source = JSON.parse(sourceBytes.toString('utf8'))
const vendor = source.vendors.find((entry) => entry.key === vendorKey && entry.enabled !== false)
const model = source.models.find((entry) => entry.vendorKey === vendorKey && entry.modelKey === modelKey && entry.enabled !== false)
// Existing image declarations only: they make offline node/model selection
// realistic. This walk never approves a media-generation tool or calls one.
const imageModels = source.models.filter((entry) => entry.vendorKey === vendorKey && entry.kind === 'image' && entry.enabled !== false)
const imageKeys = new Set(imageModels.map((entry) => entry.modelKey))
const imageMappings = (source.mappings ?? []).filter((entry) => entry.vendorKey === vendorKey && imageKeys.has(entry.modelKey))
const credential = source.apiKeysByVendor?.[vendorKey]
if (!vendor || !model || !credential?.apiKey || credential.enabled === false || credential.enc !== 'safeStorage') {
  throw new Error('The requested live model needs an existing enabled, OS-encrypted APIMart credential')
}
const sourceEndpoint = new URL(vendor.baseUrlHint)
if (sourceEndpoint.origin !== 'https://api.apimart.ai' || vendor.providerKind !== 'openai-compatible') {
  throw new Error('This smoke is limited to the verified official APIMart endpoint/protocol')
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-pi-provider-'))
const settingsDir = path.join(tempRoot, 'settings')
const catalogFile = path.join(settingsDir, 'model-catalog.json')
const outputDir = path.join(repoRoot, '.tmp', `pi-provider-packaged-${Date.now()}`)
fs.mkdirSync(settingsDir, { recursive: true })
fs.mkdirSync(outputDir, { recursive: true })
const ORIGINAL = '这是隔离验收文稿。一位创作者把红色杯子放到白桌中央。'
const APPEND = 'NOMIPILIVEAPPEND：验收完成。'
let launched
let projectRoot
let failure
const report = { vendorKey, modelKey, outputDir, tempRoot, paid: true, monetaryCost: 'not supplied by provider response' }

function modelResponses() {
  if (!projectRoot) return []
  return readLaneTranscripts(projectRoot).flatMap(laneMessages).filter((message) => message.role === 'assistant')
}

try {
  // A minimal v8 input, not a downgrade/rewrite of the user's (possibly newer) catalog.
  // Even a partial failed write is owned by the finally cleanup below.
  fs.writeFileSync(catalogFile, JSON.stringify({
    version: 8, vendors: [vendor], models: [model, ...imageModels], mappings: imageMappings, apiKeysByVendor: { [vendorKey]: credential },
  }), { flag: 'wx', mode: 0o600 })
  launched = await launchNomiApp({
    name: 'pi-live-provider', tempRoot, settingsDir, executablePath, settleMs: 0,
    env: { NOMI_RENDERER_URL: '', VITE_DEV_SERVER_URL: '', NOMI_DESKTOP_DEV: '', NOMI_E2E_PRODUCTION_FIXTURE: '0', NOMI_DISABLE_AUTO_UPDATE: '1' },
  })
  const { app, win } = launched
  win.setDefaultTimeout(120_000)
  const platform = await app.evaluate(({ app: mainApp }) => ({
    packaged: mainApp.isPackaged, appPath: mainApp.getAppPath(), node: process.versions.node,
    electron: process.versions.electron, userData: mainApp.getPath('userData'),
  }))
  expect(platform.packaged).toBe(true)
  expect(platform.appPath.endsWith('app.asar')).toBe(true)
  expect(platform.userData).toBe(launched.userDataDir)
  report.platform = platform
  await win.evaluate(({ vendorKey, modelKey }) => {
    localStorage.setItem('nomi:locale:v1', 'zh-CN')
    localStorage.setItem('nomi-color-scheme', 'light')
    localStorage.setItem('nomi.assistantModel', JSON.stringify({ vendorKey, modelKey }))
    for (const key of ['nomi:splash:v1', 'nomi:journey-tour:v1', 'nomi:canvas-gesture-hint:v1']) localStorage.setItem(key, 'seen')
  }, { vendorKey, modelKey })
  await win.reload({ waitUntil: 'domcontentloaded' })
  expect(win.url().startsWith('file:')).toBe(true)
  await clickOrFail(win.getByRole('button', { name: /^新建空白项目/ }), '创建隔离真模型验收项目')
  await expect(win.locator(DOCUMENT)).toBeVisible({ timeout: 120_000 })
  const projectId = await win.evaluate(() => {
    const url = new URL(location.href)
    return url.searchParams.get('projectId') ?? new URLSearchParams(url.hash.split('?')[1] ?? '').get('projectId')
  })
  const projects = await win.evaluate(() => window.nomiDesktop.projects.listAsync())
  projectRoot = projects.find((project) => project.id === projectId)?.rootPath
  expect(projectRoot).toBeTruthy()
  expect(path.relative(launched.projectsDir, projectRoot).startsWith('..')).toBe(false)
  await win.locator(DOCUMENT).fill(ORIGINAL)
  await sendCreation(win, '这是一条连接验收消息。请不要调用任何工具，只回复 NOMI_PI_LIVE_OK。')
  await waitForV4TurnIdle(win, { panel: CREATION_PANEL, doneTimeout: 120_000,
    settledBy: win.locator(CREATION_PANEL).getByText('NOMI_PI_LIVE_OK', { exact: false }).last() })
  await expect(win.locator(CREATION_PANEL)).toContainText('NOMI_PI_LIVE_OK', { timeout: 120_000 })
  expect(modelResponses().at(-1).stopReason).toBe('stop')
  expect(modelResponses()[0].usage.totalTokens).toBeGreaterThan(0)
  await clickOrFail(win.locator(`${CREATION_PANEL} ${COMPOSER_PERMISSION}`), '开启每步确认验收')
  await clickOrFail(win.locator(permissionTier('step')), '每步问')

  await sendCreation(win, `请只调用一次 append_to_end，把这句原样追加到文末：${APPEND}。不要调用其他工具，不要扩写。`)
  // v4：待批准的操作落在**介入槽**里（composer 正上方那一格），一次一个。
  const approval = win.locator(`${CREATION_PANEL} ${APPROVAL_CARD}`).filter({ hasText: APPEND })
  const proof = await proveProbe(approval, 'The real model must propose an actual append for human approval', 120_000)
  await expect(win.locator(DOCUMENT)).toHaveText(ORIGINAL)
  expect(JSON.stringify((await readProject(win, projectId)).payload.workbenchDocument)).not.toContain(APPEND)
  await screenshotSettled(win, { path: path.join(outputDir, '01-live-approval.png') })
  await clickOrFail(approval.locator(INTERVENTION_CONFIRM), '批准真模型追加')
  await waitForV4TurnIdle(win, { panel: CREATION_PANEL, doneTimeout: 120_000, settledBy: win.locator(DOCUMENT).getByText(APPEND, { exact: false }) })
  expect(modelResponses().at(-1).stopReason).toBe('stop')
  await expect(win.locator(DOCUMENT)).toContainText(APPEND)
  expect((await win.locator(DOCUMENT).innerText()).split(APPEND)).toHaveLength(2)
  await expectAbsent(approval, { provenBy: proof, message: 'The real approval is consumed exactly once' })
  const messages = readLaneTranscripts(projectRoot).flatMap(laneMessages)
  const assistants = messages.filter((message) => message.role === 'assistant')
  expect(assistants.length).toBeGreaterThanOrEqual(3)
  expect(assistants.every((message) => message.provider === vendorKey && message.model === modelKey)).toBe(true)
  expect(messages.filter((message) => message.role === 'toolResult' && message.toolName === 'append_to_end')).toHaveLength(1)
  await expect.poll(async () => JSON.stringify((await readProject(win, projectId)).payload.workbenchDocument),
    { timeout: 30_000 }).toContain(APPEND)
  await screenshotSettled(win, { path: path.join(outputDir, '02-live-applied.png') })
  await clickOrFail(win.locator('[aria-label="文本工具栏"]').getByRole('button', { name: '撤销', exact: true }), '撤销真模型的实际变更')
  await expect(win.locator(DOCUMENT)).toHaveText(ORIGINAL)
  await screenshotSettled(win, { path: path.join(outputDir, '03-live-undone.png') })

  await openCanvas(win)
  await sendCanvas(win, '创建两个图片节点并连接参考，只建节点，不生成。两个节点分别命名 NOMILIVESOURCE 和 NOMILIVETARGET；请只用一次 nomi_canvas_write（operation=create_canvas_nodes）同时创建两个节点及从前者到后者的 reference 连线。请选择支持图片参考的已接入图片模型，不要运行任何媒体生成。')
  // v4：节点计划也走同一个介入槽，`data-kind="plan"` 时槽体是一排可勾选的计划行。
  const plan = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}`)
  // A real provider may spend most of the runtime's first-response budget thinking.
  // Playwright's locator expectation has its own 5s default and ignores page.setDefaultTimeout,
  // so use the same explicit 120s bound as the durable turn checks above.
  await expect(plan).toBeVisible({ timeout: 120_000 })
  await expect(plan.locator(INTERVENTION_CONFIRM)).toBeVisible()
  const untouched = (await readProject(win, projectId)).payload.generationCanvas
  expect(untouched.nodes).toHaveLength(0)
  expect(untouched.edges).toHaveLength(0)
  await screenshotSettled(win, { path: path.join(outputDir, '04-live-canvas-proposal.png') })
  // Only the node-plan control is approved; generic generation approvals are
  // never clicked, even if a model ignores the explicit no-generation request.
  await clickOrFail(plan.locator(INTERVENTION_CONFIRM), '批准真模型建两个节点及参考连线')
  await waitForV4TurnIdle(win, { panel: CANVAS_PANEL, doneTimeout: 120_000, settledBy: win.locator(`${CANVAS_PANEL} ${TOOL_RECEIPT}`).last() })
  expect(modelResponses().at(-1).stopReason).toBe('stop')
  await expect.poll(async () => {
    const canvas = (await readProject(win, projectId)).payload.generationCanvas
    return { nodes: canvas.nodes.length, edges: canvas.edges.length }
  }, { timeout: 30_000 }).toEqual({ nodes: 2, edges: 1 })
  const landed = (await readProject(win, projectId)).payload.generationCanvas
  const from = landed.nodes.find((node) => node.title === 'NOMILIVESOURCE')
  const to = landed.nodes.find((node) => node.title === 'NOMILIVETARGET')
  expect(from?.kind).toBe('image')
  expect(to?.kind).toBe('image')
  expect(landed.edges[0]).toMatchObject({ source: from.id, target: to.id })
  expect(landed.edges[0].mode ?? 'reference').toBe('reference')
  const allMessages = readLaneTranscripts(projectRoot).flatMap(laneMessages)
  const toolCalls = allMessages.filter((message) => message.role === 'assistant').flatMap((message) => message.content)
    .filter((part) => part.type === 'toolCall')
  const allowedTools = ['read_full_text', 'read_selection', 'append_to_end', 'nomi_canvas_read', 'nomi_canvas_write']
  const mediaCalls = toolCalls.filter((part) => !allowedTools.includes(part.name))
  expect(mediaCalls, 'No media generation or unrelated tool may be requested in this smoke').toHaveLength(0)
  const createCalls = toolCalls.filter((part) => part.name === 'nomi_canvas_write')
  expect(createCalls[0]?.arguments.operation).toBe('create_canvas_nodes')
  const createResults = allMessages.filter((message) => message.role === 'toolResult' && message.toolName === 'nomi_canvas_write')
  expect(createCalls).toHaveLength(1)
  expect(createResults).toHaveLength(1)
  expect(createResults[0]).toMatchObject({ toolCallId: createCalls[0].id, isError: false, details: { applied: true, operation: 'create_canvas_nodes' } })
  const actualResult = createResults[0].details
  expect(actualResult.affectedNodeIds.toSorted()).toEqual([from.id, to.id].toSorted())
  const receipt = win.locator(`${CANVAS_PANEL} ${TOOL_RECEIPT}`).last()
  await expect(receipt).toHaveCount(1)
  await screenshotSettled(win, { path: path.join(outputDir, '05-live-canvas-committed.png') })
  await clickOrFail(receipt.getByRole('button', { name: '撤销', exact: true }), '撤销真模型的两节点提案')
  await expect.poll(async () => {
    const canvas = (await readProject(win, projectId)).payload.generationCanvas
    return { nodes: canvas.nodes.length, edges: canvas.edges.length }
  }, { timeout: 30_000 }).toEqual({ nodes: 0, edges: 0 })
  // v4 里发送与停止是同一颗钮：运行态由 composer 的 data-mode 标记，回合落地后它必须不在。
  await expect(win.locator(`${CANVAS_PANEL} ${COMPOSER}[data-mode="running"]`)).toBeHidden()
  await screenshotSettled(win, { path: path.join(outputDir, '06-live-canvas-undone.png') })
  report.modelResponses = allMessages.filter((message) => message.role === 'assistant').length
  report.mediaToolRequests = mediaCalls.length
  report.verified = ['real-text-response', 'document-approval-apply-undo', 'reported-canvas-task-approval-apply-undo']
  report.responses = modelResponses().map(({ stopReason, usage }) => ({ stopReason, usage }))
  report.totalTokens = report.responses.reduce((sum, response) => sum + response.usage.totalTokens, 0)
} catch (error) {
  failure = error
  process.exitCode = 1
  if (launched) {
    try { await launched.win.screenshot({ path: path.join(outputDir, 'FAIL.png') }) }
    catch (captureError) { console.error('Failure screenshot unavailable:', captureError.message) }
  }
} finally {
  await finalizeRuntimeWalk(report, {
    error: failure,
    cleanup: [
      () => launched && stopRuntimeApp(launched.app),
      () => {
        // Only our exclusive temporary credential copy is removed; never write the source.
        if (fs.existsSync(catalogFile)) fs.unlinkSync(catalogFile)
        report.temporaryCredentialRemoved = !fs.existsSync(catalogFile)
      },
    ],
    collect: () => {
      report.responses ??= modelResponses().map(({ stopReason, usage }) => ({ stopReason, usage }))
      report.sourceUnchanged = createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex')
        === createHash('sha256').update(sourceBytes).digest('hex')
      expect(report.sourceUnchanged, 'source catalog changed during live evaluation').toBe(true)
    },
  })
}
