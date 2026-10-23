#!/usr/bin/env node
// 写作区「选中文字 → AI 编辑」真机闭环 · 真文本模型（只花几百个 token 的文本调用）。
//
//   APIMART_API_KEY=<key> NOMI_SPEND_OK=1 node tests/ux/creation-ai-rewrite-real.paid.mjs
//
// 凭据：只从运行时环境变量 APIMART_API_KEY 读（_paidEnvKey.mjs 的 env-key 路：经可见接入页进被测 App，
// 不读真实资料目录；key 不进日志 / 报告 / 截图 / 网络账本落盘；跑完整个隔离副本删除）。脚本里没有 key。
// 流程（步骤本体 _creationAiRewriteSteps.mjs，与 loopback 演练同一份）：
//   接入 → 新建项目 → 选对话模型 → 敲三句 → 选中第二句 → 点「AI 编辑」→ 点「缩短」→ 等真模型回 →
//   就地新旧对比 → Enter 接受 → Ctrl+Z 撤回。
// 预期截图（证据目录 tests/ux/shots/creation-ai-rewrite-real/）：
//   rewrite-01-selected / 02-menu / 03-result / 04-accepted / 05-undone
// 隔离资料目录、窗口默认不抢焦点；只授权一个 APIMart 文本模型，不授权任何生成模型（这条走查不会出图、不会出视频）。
import { expect } from './_assert.mjs'
import { BRAIN } from './_agentVideoPaid.mjs'
import { openPaidWalk } from './_paidRun.mjs'
import { uiText } from './full-walk/invariants.mjs'
import { runCreationAiRewriteJourney } from './_creationAiRewriteSteps.mjs'
import { CREATION_PANEL, chooseAssistantModel, expandResidentPanel } from './agent-runtime-walk-support.mjs'

const paid = await openPaidWalk('creation-ai-rewrite-real.paid.mjs', 'creation-ai-rewrite-real', [BRAIN], { buildMarkers: [uiText('zh-CN', 'creationAi.rewrite.inputAria')] })
const { walk } = paid
let failure
try {
  const { win } = await walk.start({ first: true })
  await walk.newProject()
  // 改写用「Agent 面板选的那个文本模型」：先在面板里把对话模型选成被授权的那个。
  await expandResidentPanel(win)
  await chooseAssistantModel(win, paid.label(BRAIN.vendorKey, BRAIN.modelKey), CREATION_PANEL)
  walk.report.rewrite = await runCreationAiRewriteJourney({ win, snap: walk.snap })
  expect(walk.report.rewrite.undoRestoredOriginal, '撤回后回到改写前').toBe(true)
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await paid.finish(failure)
}
