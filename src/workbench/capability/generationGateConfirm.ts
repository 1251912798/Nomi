// 外部 MCP 的生成确认卡（渲染层）：一张语义生成挑战 → 一张确认卡。
// 从 capabilityApplyHandler.ts 按职责拆出（该文件已到 800 行上限）；付费确认仍复用全仓唯一的 useSpendConfirmStore，不另造并行 UI（P1）。
import i18n from '../../i18n'
import { useSpendConfirmStore } from '../generationCanvas/spend/spendConfirm'
import { buildMultiShotContractView, type MultiShotGatePayload } from '../generationCanvas/spend/productionContractView'

export type GenerationGateConfirmPayload = {
  challengeId?: string
  projectName?: string
  shotSummary?: string
  model?: string
  referenceCount?: number
  /** `null`/缺席 = 目录算不出价。绝不是 0 元。 */
  maximumCost?: number | null
  /** 这批里价格未知的镜数（> 0 时卡上如实说出来）。 */
  unknownShotCount?: number
  currency?: string
  expiresAt?: string
  /**
   * P4 S3a — 多镜合同投影（三层管线末端）。有它 → 弹多镜确认卡（复用唯一 spendConfirm 漏斗的 contract 槽，
   * 不造并行卡，P1）；无它 → 走今日扁平单镜卡（字节不动，单镜 E2E 是回归门）。
   */
  shots?: MultiShotGatePayload
}

/**
 * One user-facing confirmation card for the semantic generation challenge.
 *
 * P4 S3a：payload 带 `shots`（多镜合同投影）→ 弹**多镜确认卡**（唯一 spendConfirm 漏斗的 contract 槽，
 * 逐镜清单 + 固定 footer + 试拍/返回修改，P1 不造并行卡）；无 `shots` → 走今日扁平单镜卡（字节不动）。
 * 试拍/返回修改经回调回传：`{ confirmed:false, trialFirst:true }`。缩到首镜 + 重封存 + 重发 gate = S4。
 */
export async function confirmGenerationGateForAgent(
  info: GenerationGateConfirmPayload,
): Promise<{ confirmed: boolean; trialFirst?: boolean; challengeId?: string }> {
  const withChallenge = <T extends Record<string, unknown>>(base: T) => ({
    ...base,
    ...(info.challengeId ? { challengeId: info.challengeId } : {}),
  })

  // ── 多镜路径（S3a 用户可见 UI）──
  if (info.shots && Array.isArray(info.shots.shots) && info.shots.shots.length > 0) {
    const payload: MultiShotGatePayload = {
      ...info.shots,
      ...(info.projectName ? { projectName: info.projectName } : {}),
      // gate 有效期兜底进投影（payload 自带优先）。
      ...(info.shots.expiresAt ? {} : info.expiresAt ? { expiresAt: info.expiresAt } : {}),
    }
    const contract = buildMultiShotContractView(payload)
    const projectName = typeof info.projectName === 'string' ? info.projectName.trim() : ''
    let trialFirst = false
    let backToEdit = false
    const ok = await useSpendConfirmStore.getState().requestConfirm({
      kind: 'contract',
      title: i18n.t('runtime.capability.generationGateBatchTitle'),
      // 一句话正文：项目名 +「先出主角形象给你过目，点头后才开拍」（零内部术语）。
      message: i18n.t('generationCommon.production.batch.body', {
        project: projectName || i18n.t('runtime.capability.generationGateProject'),
      }),
      confirmLabel: i18n.t('generationCommon.production.batch.confirm', { count: payload.shots.length }),
      source: 'agent',
      contract,
      onTrialFirst: () => {
        trialFirst = true
      },
      onBackToEdit: () => {
        backToEdit = true
      },
    })
    // 试拍/返回修改都不算确认；只有试拍需要给主进程一个「缩到首镜重发」的信号（S4 落地）。
    void backToEdit
    return withChallenge({ confirmed: Boolean(ok), ...(trialFirst ? { trialFirst: true } : {}) })
  }

  // ── 单镜路径（今日形态，字节不动；单镜 E2E 是回归门）──
  const model =
    typeof info.model === 'string' && info.model.trim() ? info.model.trim() : i18n.t('runtime.capability.defaultModel')
  // 镜头摘要是调用方给的内容，不拼进句子（英文界面会混进中文）；正文的动作半句永远走词典，摘要单独放一行。
  const shotSummary = typeof info.shotSummary === 'string' ? info.shotSummary.trim() : ''
  // 「算不出价」和「0 元」是两件事：只有后者才该印出一个数。缺席/非数 → 走未知那一档的文案，
  // 绝不落成 ¥0（2026-09-21 未知价开闸；三种可能里只有 0 会被读成「这次免费」）。
  const costKnown = typeof info.maximumCost === 'number' && Number.isFinite(info.maximumCost)
  const cost = costKnown
    ? `${typeof info.currency === 'string' ? info.currency : ''}${Number(info.maximumCost)}`
    : i18n.t('runtime.capability.generationGateCostUnknown')
  const ok = await useSpendConfirmStore.getState().requestConfirm({
    kind: 'generation',
    title: i18n.t('runtime.capability.generationGateTitle'),
    message: costKnown
      ? i18n.t('runtime.capability.generationGateMessage', { model, cost })
      : i18n.t('runtime.capability.generationGateMessageUnknownCost', { model }),
    confirmLabel: i18n.t('runtime.capability.confirmGenerate'),
    source: 'agent',
    details: [
      ...(info.projectName
        ? [{ label: i18n.t('runtime.capability.generationGateProject'), value: info.projectName }]
        : []),
      { label: i18n.t('runtime.capability.generationGateModel'), value: model },
      ...(shotSummary ? [{ label: i18n.t('runtime.capability.generationGateShot'), value: shotSummary }] : []),
      ...(Number.isInteger(info.referenceCount)
        ? [{ label: i18n.t('runtime.capability.generationGateReferences'), value: String(info.referenceCount) }]
        : []),
      { label: i18n.t('runtime.capability.generationGateCost'), value: cost },
      ...(info.expiresAt ? [{ label: i18n.t('runtime.capability.generationGateExpires'), value: formatGateExpiry(info.expiresAt) }] : []),
    ],
  })
  return withChallenge({ confirmed: Boolean(ok) })
}

/** 有效期给人看：本地时间的短格式（按界面语言），不是原始 ISO 串；解析不了就原样给。 */
export function formatGateExpiry(iso: string, locale: string = i18n.language): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  return new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(at)
}
