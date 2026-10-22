#!/usr/bin/env node
// creation-ai-rewrite-real.paid.mjs 的 loopback 演练：**零额度、不出网**。
// 同一份步骤本体（_creationAiRewriteSteps.mjs）、真 Electron、真接入页、真 IPC、真文本任务流；
// 差别只有：凭据是一把假 key，APIMart 的地址被重定向到本机夹具，模型是夹具里一个「先想 35 秒再回话」的思考型模型。
// 它证的是「真机走查的脚本走得通、读数读得出」，不证真模型会改成什么样（那只有真跑才证得了）。
// 放行名单清空：就算哪一层没重定向，真请求也会被走查闸当场挡下。
import { expect } from './_assert.mjs'
import { BRAIN } from './_agentVideoPaid.mjs'
import { ENV_KEY_VAR } from './_paidEnvKey.mjs'
import { openPaidWalk } from './_paidRun.mjs'
import { uiText } from './full-walk/invariants.mjs'
import { runCreationAiRewriteJourney } from './_creationAiRewriteSteps.mjs'
import { CREATION_PANEL, chooseAssistantModel, createRuntimeWalk, expandResidentPanel } from './agent-runtime-walk-support.mjs'

const FAKE_KEY = 'rehearsal-fake-key-0123456789abcdef'
const SHORTER = '她慢慢展开纸条，像怕它碎掉。'
// 假模型像 DeepSeek V4 这类思考型模型：先想 35 秒（每 5 秒一帧 reasoning）、再给正文。35 秒 > 主进程的 30 秒首字闸：
// 首字闸只数正文时，这一格会在 30 秒处红「首字 30s 未响应」（2026-10-21 真模型走查就是这样红的，而立刻回话的假模型演练看不出来）。
const THINK_FRAMES = 7
const THINK_INTERVAL_MS = 5_000

const paid = await openPaidWalk('creation-ai-rewrite-real.rehearsal.walk.mjs', 'creation-ai-rewrite-rehearsal', [BRAIN], {
  env: { ...process.env, CI: '', NOMI_SPEND_OK: '1', [ENV_KEY_VAR]: FAKE_KEY },
  buildMarkers: [uiText('zh-CN', 'creationAi.rewrite.inputAria')],
  createWalk: (name, options) => createRuntimeWalk(name, {
    ...options, generationProvider: 'apimart', seedApimartKey: false, env: { ...options.env, NOMI_WALK_ALLOW_ORIGINS: '' },
  }),
})
const { walk } = paid
let failure
try {
  const { win } = await walk.start({ first: true })
  walk.fixture.respond({ label: 'rehearsal rewrite', match: () => true, reply: { type: 'think-then-text', text: SHORTER, thinkFrames: THINK_FRAMES, intervalMs: THINK_INTERVAL_MS } })
  await walk.newProject()
  await expandResidentPanel(win)
  await chooseAssistantModel(win, paid.label(BRAIN.vendorKey, BRAIN.modelKey), CREATION_PANEL)
  walk.report.rewrite = await runCreationAiRewriteJourney({ win, snap: walk.snap })
  expect(walk.report.rewrite.acceptedText.split('\n')[1], '接受后正文是夹具回的那一句').toBe(SHORTER)
  const request = walk.fixture.requests.at(-1)
  expect(request.authorization, '改写请求带的是接入页填的 key，只到过本机夹具').toBe(`Bearer ${FAKE_KEY}`)
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await paid.finish(failure)
}
