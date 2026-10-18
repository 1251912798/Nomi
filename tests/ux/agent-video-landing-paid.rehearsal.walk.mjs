#!/usr/bin/env node
// 视频付费走查（agent-video-landing.paid.mjs）的 loopback 演练：**零额度、不出网**。
// 与真付费走查共用同一份步骤本体（_agentVideoLandingSteps.mjs：接入 → 开项目 → Agent 出卡 → 核草稿是最便宜那一档 →
// 点生成 → 片子落节点 → 任务面板 → 英文 + 重开），不抄第二份；差别只在三处：
//   ① 凭据是一把假 key，APIMart 的地址被重定向到本机夹具，接入页真的走（含项目库页上接入那一步——2026-10-18 真走查就死在这一步）；
//   ② 大脑是夹具里写好的剧本（起草一镜 Seedance 2.0 fast · 480p · 4 秒 · 无音频，再调 generate）；
//   ③ 供应商是夹具：假 Seedance 的提交 / 查询 / 出片，片子压在门口，先证「观察窗过了 Nomi 还在问、没有再交一次」，再放行。
// 它证的是「真付费走查的脚本走得通、读数读得出、判据判得对」，不证模型自己会不会写对那一档（那只有真付费能证）。
// 放行名单清空：就算哪一层没重定向，真请求也会被走查闸当场挡下（不是悄悄出网）。
import { expect } from './_assert.mjs'
import { BRAIN, VIDEO } from './_agentVideoPaid.mjs'
import { OBSERVATION_WINDOW_MS, runAgentVideoLanding } from './_agentVideoLandingSteps.mjs'
import { ENV_KEY_VAR } from './_paidEnvKey.mjs'
import { openPaidWalk } from './_paidRun.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { flattenRequestText } from './agent-runtime-fixture.mjs'
import { createRuntimeWalk, hasToolResult } from './agent-runtime-walk-support.mjs'

// 干净装机那一档（内置目录没有价目）：付费卡照样能确认，花费由供应商结算——夹具出站只认回环，一分钱不花。
process.env.NOMI_WALK_UNPRICED_MODEL = '1'
process.env.NOMI_POLL_TIMEOUT_MS = String(OBSERVATION_WINDOW_MS)

const FAKE_KEY = 'rehearsal-fake-key-0123456789abcdef'
const DRAFT_CALL = 'rh-video-1'
const GENERATE_CALL = `${DRAFT_CALL}-generate`
const lastUserText = (body) => flattenRequestText({ messages: (body.messages ?? []).filter((message) => message.role === 'user').slice(-1) })

/** 剧本大脑：起草一镜被授权的那一档 → 调 generate（等人在付费卡上点确认）→ 收尾。 */
function installBrain(fixture) {
  fixture.respond({
    label: 'rehearsal brain · one cheap video shot, then generate',
    match: (body) => lastUserText(body).includes('纸船在雨后的水洼里'),
    reply: (body) => {
      if (!hasToolResult(body, DRAFT_CALL)) {
        return { type: 'tool', id: DRAFT_CALL, name: 'draft_shots', args: { shots: [{
          title: '纸船', prompt: '一只纸船在雨后的水洼里慢慢漂，清晨的光', taskKind: 'text_to_video',
          candidate: { providerId: VIDEO.vendorKey, modelId: VIDEO.modelKey },
          parameters: { model: 'doubao-seedance-2.0-fast', duration: 4, resolution: '480p', generate_audio: false },
        }] } }
      }
      if (!hasToolResult(body, GENERATE_CALL)) {
        const result = (body.messages ?? []).find((message) => message.role === 'tool' && message.tool_call_id === DRAFT_CALL)
        return { type: 'tool', id: GENERATE_CALL, name: 'generate', args: { operationId: /"operationId":"([^"]+)"/.exec(String(result?.content ?? ''))?.[1] } }
      }
      return { type: 'text', text: '已经开始生成。' }
    },
  })
}

const paid = await openPaidWalk('agent-video-landing-paid.rehearsal.walk.mjs', 'agent-video-landing-rehearsal', [BRAIN, VIDEO], {
  env: { ...process.env, CI: '', NOMI_SPEND_OK: '1', [ENV_KEY_VAR]: FAKE_KEY },
  createWalk: (name, options) => createRuntimeWalk(name, {
    ...options, generationProvider: 'apimart', seedApimartKey: false, env: { ...options.env, NOMI_WALK_ALLOW_ORIGINS: '' },
  }),
})
const { walk } = paid
let failure
try {
  installBrain(walk.fixture)
  const { win } = await walk.start({ first: true })
  await runAgentVideoLanding({
    paid, win, realMedia: false,
    duringObservation: async () => {
      const { fixture } = walk
      // 供应商收到了这一笔，而且只收到一笔；片子压在门口，观察窗（OBSERVATION_WINDOW_MS）过了 Nomi 还在查、没有再交一次。
      await expect.poll(() => fixture.videos.length, { message: '确认之后供应商真的收到了视频生成请求', timeout: stationTimeout({ operations: 4 }) }).toBe(1)
      const pollsFirst = await expect.poll(() => fixture.videoTaskPolls()[0] ?? 0, { timeout: stationTimeout({ operations: 4 }) }).toBeGreaterThan(0).then(() => fixture.videoTaskPolls()[0])
      await expect.poll(() => fixture.videoTaskPolls()[0] ?? 0, {
        message: `观察窗（${OBSERVATION_WINDOW_MS}ms）过了之后 Nomi 还在查询这笔任务`, timeout: stationTimeout({ operations: 4 }),
      }).toBeGreaterThan(pollsFirst + 2)
      expect(fixture.videos, '只查不交：同一笔钱没有被再提交一次').toHaveLength(1)
      fixture.releaseVideos()
    },
  })
  expect(walk.report.observationWindowExercised, '演练里压着出片，观察窗必然过过').toBe(true)
  expect(walk.fixture.videos, '整条路上供应商只收到一笔提交').toHaveLength(1)
  walk.report.paidCalls = 0
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await paid.finish(failure)
}
