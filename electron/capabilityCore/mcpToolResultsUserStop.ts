export type ResultLocale = "zh-CN" | "en";

type Ctx = { locale: ResultLocale };
type LandingRef = { index?: unknown; title?: unknown };

const L = (ctx: Ctx, zh: string, en: string): string => (ctx.locale === "en" ? en : zh);

export type UserStopFacts = { sent: LandingRef[]; notSent: LandingRef[] };

/** 用户停下（暂停 / 取消）的这一批的逐镜事实（投影 `stopped`，和落地失败同一份逐镜分类）。没有 = 不是用户停的 / 不是一批生成。 */
export function userStopFacts(value: Record<string, unknown>): UserStopFacts | null {
  const stopped =
    value.stopped && typeof value.stopped === "object" && !Array.isArray(value.stopped)
      ? (value.stopped as Record<string, unknown>)
      : {};
  const sent = Array.isArray(stopped.sent) ? (stopped.sent as LandingRef[]) : null;
  const notSent = Array.isArray(stopped.notSent) ? (stopped.notSent as LandingRef[]) : null;
  if (!sent || !notSent || sent.length + notSent.length === 0) return null;
  return { sent, notSent };
}

const stopShotLabel = (ref: LandingRef, en: boolean) =>
  typeof ref.title === "string" && ref.title
    ? en
      ? `"${ref.title}"`
      : `「${ref.title}」`
    : en
      ? `shot ${String(ref.index ?? "?")}`
      : `第 ${String(ref.index ?? "?")} 镜`;

/** 用户停下这一批之后那一句（债 b：按真实段数说）。 */
export function userStopLine(ctx: Ctx, facts: UserStopFacts): string {
  const en = ctx.locale === "en";
  const list = (refs: LandingRef[]) => refs.map((ref) => stopShotLabel(ref, en)).join(en ? ", " : "、");
  if (facts.notSent.length === 0) {
    return L(
      ctx,
      `这一批 ${facts.sent.length} 镜在停下之前都已经发出去了：停下没有拦下任何一镜，它们会照常生成并计费，产物保留在项目里。`,
      `All ${facts.sent.length} shots in this batch were already sent before the stop: stopping held back none of them; they finish and bill as usual, and the results stay in the project.`,
    );
  }
  return L(
    ctx,
    `发出了 ${facts.sent.length} 镜（照常生成并计费），${facts.notSent.length} 镜没发、不会再花钱：${list(facts.notSent)}。`,
    `${facts.sent.length} sent (they finish and bill as usual); ${facts.notSent.length} not sent and will not be charged: ${list(facts.notSent)}.`,
  );
}

export function userStopContinuation(ctx: Ctx, action: string, facts: UserStopFacts): string | null {
  return action === "pause" && facts.notSent.length > 0
    ? L(
        ctx,
        "可以继续（只会发没发的那几镜），或取消这次制作",
        "Resume (only the unsent shots are sent), or cancel the run",
      )
    : null;
}

export function userStopNextActions(hintAction: string | undefined, facts: UserStopFacts | null): string[] {
  return hintAction && !(facts && facts.notSent.length === 0) ? [hintAction] : [];
}

export function userStopDetails(
  ctx: Ctx,
  action: string,
  facts: UserStopFacts | null,
  hintAction?: string,
): {
  line: string | null;
  continuation: string | null;
  stoppedShots: { sent: number; notSent: number } | null;
  nextActions: string[];
} {
  return {
    line: facts ? userStopLine(ctx, facts) : null,
    continuation: facts ? userStopContinuation(ctx, action, facts) : null,
    stoppedShots: facts ? { sent: facts.sent.length, notSent: facts.notSent.length } : null,
    nextActions: userStopNextActions(hintAction, facts),
  };
}

export function userStopDetailsForValue(
  ctx: Ctx,
  value: Record<string, unknown>,
  enabled: boolean,
  action: string,
  hintAction?: string,
) {
  return userStopDetails(ctx, action, enabled ? userStopFacts(value) : null, hintAction);
}

export function userStopDetailsForRun(
  ctx: Ctx,
  value: Record<string, unknown>,
  stopReason: string,
  hintAction?: string,
) {
  return userStopDetailsForValue(
    ctx,
    value,
    stopReason === "user_paused" || stopReason === "user_cancelled",
    stopReason === "user_paused" ? "pause" : "cancel",
    hintAction,
  );
}

export function unsubmittedStopLine(ctx: Ctx, action: string, hasFacts: boolean): string | null {
  return action === "pause" && !hasFacts
    ? L(ctx, "未提交的任务不再提交、不计费", "unsubmitted jobs will not be submitted or charged")
    : null;
}

export function userStopDetailsForControl(
  ctx: Ctx,
  value: Record<string, unknown>,
  action: string,
  hintAction?: string,
) {
  return userStopDetailsForValue(ctx, value, action === "pause" || action === "cancel", action, hintAction);
}

export function userStopTextLines(
  ctx: Ctx,
  details: ReturnType<typeof userStopDetails>,
  hint: { nextZh: string; nextEn: string } | undefined,
): string[] {
  return [
    details.line,
    details.stoppedShots ? details.continuation : hint ? L(ctx, hint.nextZh, hint.nextEn) : null,
  ].filter((line): line is string => Boolean(line));
}
