// 「Agent 定的 = 节点上的 = 实际发出的」真付费核对（agent-ratio-variant-landing.paid.mjs）的判定——纯函数，不起 App、不花钱就能单测。
//
// 这一档写死在这里，由协调在跑之前核对（脚本不读价目、不写金额）：
//   APIMart · Seedance 2.0 · **Mini 变体**（带变体的那档里按档案顺序 standard / fast / mini 取最省的一个）· 9:16 · 480p · 4 秒 · 无音频。
// 选 Mini 而不是默认的 Fast：默认变体落到节点上本来就对（两边恰好都落到默认），证明不了「落地线带上了变体」（#1288）；
// 选 9:16 而不是 16:9：16:9 恰好是旧挂载 effect 改成的值，证明不了「打开节点不改比例」（PR-b）。
// `wireModel` 是 APIMart 请求体里 Mini 的型号名，由 _ratioVariantWire.test.mjs 用真 runtime.runTask 渲染这一档时钉住，不是手猜的。
export const RATIO_VARIANT_SHOT = Object.freeze({
  vendorKey: 'apimart',
  modelKey: 'doubao-seedance-2.0',
  variantId: 'mini',
  modeId: 't2v',
  aspect: '9:16',
  resolution: '480p',
  durationSec: 4,
  generateAudio: false,
  wireModel: 'seedance-2.0-mini',
})

/** 节点（落地后 / 打开后）和这一档对不上的地方；空 = 对得上。读的是节点 meta：节点上点生成派发的就是它。 */
export function nodeShotProblems(meta, shot = RATIO_VARIANT_SHOT) {
  const problems = []
  if (meta?.modelKey !== shot.modelKey || (meta?.modelVendor ?? meta?.vendor) !== shot.vendorKey) problems.push(`模型是 ${meta?.modelVendor ?? meta?.vendor}/${meta?.modelKey}`)
  if (meta?.archetype?.variantId !== shot.variantId) problems.push(`变体是 ${JSON.stringify(meta?.archetype?.variantId)}（应为 ${shot.variantId}）`)
  if (meta?.size !== shot.aspect) problems.push(`比例（size）是 ${JSON.stringify(meta?.size)}（应为 ${shot.aspect}）`)
  if (String(meta?.resolution ?? '').toLowerCase() !== shot.resolution) problems.push(`resolution 是 ${JSON.stringify(meta?.resolution)}`)
  if (Number(meta?.duration) !== shot.durationSec) problems.push(`duration 是 ${JSON.stringify(meta?.duration)}`)
  if (meta?.generate_audio !== shot.generateAudio) problems.push(`generate_audio 是 ${JSON.stringify(meta?.generate_audio)}`)
  return problems
}

/** 宿主 Run 里这一镜的候选（Agent 定的那一份）和这一档对不上的地方。 */
export function candidateShotProblems(candidate, shot = RATIO_VARIANT_SHOT) {
  const problems = []
  const params = candidate?.parameters ?? {}
  if (candidate?.providerId !== shot.vendorKey || candidate?.modelId !== shot.modelKey) problems.push(`候选模型是 ${candidate?.providerId}/${candidate?.modelId}`)
  if (candidate?.variantId !== shot.variantId) problems.push(`候选变体是 ${JSON.stringify(candidate?.variantId)}`)
  if (params.size !== shot.aspect) problems.push(`候选比例（size）是 ${JSON.stringify(params.size)}`)
  if (String(params.resolution ?? '').toLowerCase() !== shot.resolution) problems.push(`候选 resolution 是 ${JSON.stringify(params.resolution)}`)
  if (Number(params.duration) !== shot.durationSec) problems.push(`候选 duration 是 ${JSON.stringify(params.duration)}`)
  if (params.generate_audio !== shot.generateAudio) problems.push(`候选 generate_audio 是 ${JSON.stringify(params.generate_audio)}`)
  return problems
}

/**
 * 网络闸账本（scripts/walkthrough-network-guard.cjs 在 NOMI_WALK_NET_BODIES=1 时写的 allowed-request）→
 * 这一场发往供应商的视频创建请求：恰好 1 次，型号 = 这一档的型号，比例 = 9:16。
 * @param {Array<Record<string, any>>} entries
 * @param {{ host: string, shot?: typeof RATIO_VARIANT_SHOT }} scene
 */
export function judgeRatioVariantWire(entries, { host, shot = RATIO_VARIANT_SHOT }) {
  const problems = []
  const creates = entries.filter((entry) => entry.kind === 'allowed-request' && entry.host === host && entry.method === 'POST' && /\/videos\/generations$/.test(new URL(entry.url).pathname))
  if (creates.length !== 1) problems.push(`发往 ${host} 的视频创建请求有 ${creates.length} 次（应恰好 1 次）`)
  let body = null
  try { body = creates[0]?.body?.text ? JSON.parse(creates[0].body.text) : null } catch { problems.push('创建请求的请求体不是 JSON（或被截断）') }
  if (creates[0]?.body?.truncated) problems.push('创建请求的请求体超过记账上限被截断')
  if (body && body.model !== shot.wireModel) problems.push(`请求体型号是 ${JSON.stringify(body.model)}（应为 ${shot.wireModel}）`)
  if (body && body.size !== shot.aspect) problems.push(`请求体比例（size）是 ${JSON.stringify(body.size)}（应为 ${shot.aspect}）`)
  return {
    problems,
    summary: {
      createRequests: creates.length,
      endpoint: creates[0] ? `${new URL(creates[0].url).host}${new URL(creates[0].url).pathname}` : null,
      model: body?.model ?? null,
      size: body?.size ?? null,
      resolution: body?.resolution ?? null,
      duration: body?.duration ?? null,
      generateAudio: body?.generate_audio ?? null,
    },
  }
}
