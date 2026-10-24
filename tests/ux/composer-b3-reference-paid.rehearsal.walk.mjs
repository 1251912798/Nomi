#!/usr/bin/env node
// composer-b3-reference.paid.mjs 的 loopback 演练：**零额度、不出网**（协调真付费之前先跑它，P3「免费演练先过」）。
//   node tests/ux/composer-b3-reference-paid.rehearsal.walk.mjs
// 与真付费共用同一份步骤本体（_composerB3ReferenceSteps.mjs：布场景 → 经参数面板切首尾帧 → 花钱前核对 ①–④ → 点 ↑ →
// 确认框 → 等提交 → 等结局 → 量成片），不抄第二份；差别只在三处：
//   ① 凭据是一把假 key，APIMart 的地址被重定向到本机夹具，接入页真的走；
//   ② 供应商是夹具：假 Seedance 的上传 / 提交 / 查询 / 出片（片子先压着，提交之后放行）；
//   ③ 请求体按夹具收到的那一笔核（夹具的上传都回同一个本机地址、对不回文件名，所以按上传记录里的文件名核
//      「只上传过首帧、尾帧」，按 image_with_roles 核「只发了首帧、尾帧两项」，再核请求体里的每个图片地址都来自上传）。
// 它证的是「真付费脚本走得通、读数读得出、界面核对在真界面上判得对、生成方式是经参数面板切的」（点不到步骤本体当场停下，
// 没有写 store 的退路，所以只有一套判法：旅程走完、verified 齐全）；
// 不证 APIMart 真收到了什么（那只有真付费的账本证得了）。放行名单清空：哪一层没重定向，真请求也会被走查闸当场挡下。
import { expect } from './_assert.mjs'
import { ENV_KEY_VAR } from './_paidEnvKey.mjs'
import { openPaidWalk } from './_paidRun.mjs'
import { createRuntimeWalk } from './agent-runtime-walk-support.mjs'
import { COMPOSER_B3_PAID_MODELS, COMPOSER_B3_PAID_OPTIONS, FIRST_FILE, LAST_FILE, runComposerB3ReferenceJourney } from './_composerB3ReferenceSteps.mjs'

const SCRIPT = 'composer-b3-reference-paid.rehearsal.walk.mjs'
const FAKE_KEY = 'rehearsal-fake-key-0123456789abcdef'
const MEDIA_NOT_IMAGE = /\.(mp4|mov|webm|mp3|wav|m4a)(\?|$)/i

const paid = await openPaidWalk(SCRIPT, 'composer-b3-reference-rehearsal', COMPOSER_B3_PAID_MODELS, {
  ...COMPOSER_B3_PAID_OPTIONS,
  env: { ...process.env, CI: '', NOMI_SPEND_OK: '1', [ENV_KEY_VAR]: FAKE_KEY },
  // trustFixtureOrigin：画布直生成要从本机夹具取回成片，产品出站策略默认拒 127.0.0.1（未打包构建里按精确 origin 放行）。
  createWalk: (name, options) => createRuntimeWalk(name, {
    ...options, generationProvider: 'apimart', seedApimartKey: false, trustFixtureOrigin: true, env: { ...options.env, NOMI_WALK_ALLOW_ORIGINS: '' },
  }),
})
const { walk } = paid
const evidence = { script: SCRIPT, mode: 'rehearsal' }
let failure
try {
  await runComposerB3ReferenceJourney({
    paid, evidence,
    onSubmitted: () => walk.fixture.releaseVideos(),
    judgeWire: () => judgeFixtureWire(walk.fixture),
  })
  expect(evidence.verified, '花钱前核对、请求体、落地全过').toEqual(expect.arrayContaining([
    'mode-switched-through-parameter-panel', 'composer-shows-frames-in-use-and-3-unused-before-spend',
    'apimart-body-only-first-and-last-frame', 'unused-references-never-uploaded', 'no-reference-not-in-use-rejection', 'result-landed-and-probed',
  ]))
  expect(walk.fixture.videos, '整条路上供应商只收到一笔提交').toHaveLength(1)
  walk.report.paidCalls = 0
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  walk.report.journey = evidence
  await paid.finish(failure)
}

/** 夹具收到的那一笔：上传过哪几张、请求体带了哪几项首尾帧、请求体里的图片地址是不是都来自上传。 */
function judgeFixtureWire(fixture) {
  const problems = []
  const creates = fixture.videos
  if (creates.length !== 1) problems.push(`夹具收到的视频创建请求有 ${creates.length} 次（应恰好 1 次）`)
  const body = creates[0]?.body ?? {}
  const roles = (Array.isArray(body.image_with_roles) ? body.image_with_roles : []).map((item) => item?.role ?? null)
  if ([...roles].sort().join() !== 'first_frame,last_frame') problems.push(`请求体 image_with_roles 是 [${roles.join('、')}]（应恰好首帧、尾帧两项）`)
  const uploadedUrl = `${fixture.baseURL}/fixture/image.jpg`
  const strangers = urlsIn(body).filter((url) => !MEDIA_NOT_IMAGE.test(url) && url !== uploadedUrl)
  if (strangers.length) problems.push(`请求体里有 ${strangers.length} 个图片地址不是上传换来的：${strangers.map((url) => url.split('?')[0].split('/').pop()).join('、')}`)
  const uploaded = [...new Set(fixture.uploads.flatMap((record) => record.uploadFileNames ?? []))].sort()
  if (uploaded.join() !== [FIRST_FILE, LAST_FILE].sort().join()) problems.push(`上传过的图是 ${uploaded.join('、') || '（没有）'}（应只有 ${FIRST_FILE}、${LAST_FILE}；没在用的参考一张都不该上传）`)
  return {
    problems,
    summary: { createRequests: creates.length, imageWithRoles: roles, imageUrlCount: Array.isArray(body.image_urls) ? body.image_urls.length : null, uploadedFiles: uploaded, uploadRequests: fixture.uploads.length, problems },
  }
}

function urlsIn(value, out = []) {
  if (typeof value === 'string') { if (/^(https?:|data:|nomi-local:|file:)/i.test(value)) out.push(value) }
  else if (Array.isArray(value)) value.forEach((item) => urlsIn(item, out))
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => urlsIn(item, out))
  return out
}
