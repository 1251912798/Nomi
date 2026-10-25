// 付费门里那把挑战令牌的唯一读法。
//
// 以前这里还有「决一次付费门并开跑」的那条链（`decideGenerationSpend`：面板付费卡与「直接生成」档共用）。D2 第③步之后
// 两者都不再开制作流程自己的付费门：卡上点「生成」与策略代答都只把那几镜交给画布（`canvasHandOver.ts`），每一镜派发时
// 主进程按决定者铸收据（`approvalReceipt.issueDecisionReceipt`：手势 | 策略），那条链随之删掉。剩下的只有外部宿主那一条
// （`generationTransportAdapters.requestGate`：开门 → 宿主问人 → 认收据），它从门的回包里读令牌就用这一个函数。

/** 门里那把挑战令牌。拿不到就是这条链的前提不成立——不许接着往下走。 */
export function generationChallengeTokenOf(value: unknown): string {
  const token = value && typeof value === "object" && !Array.isArray(value)
    && (value as { handoff?: { challengeToken?: unknown } }).handoff?.challengeToken;
  if (typeof token !== "string" || !token.trim()) {
    throw Object.assign(new Error("generation_challenge_unavailable"), { code: "generation_challenge_unavailable" });
  }
  return token.trim();
}
