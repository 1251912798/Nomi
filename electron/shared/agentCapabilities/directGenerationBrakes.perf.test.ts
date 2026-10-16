import { describe, expect, it } from "vitest";

import { spendDecisionByPolicy } from "./directGenerationBrakes";

// 设计卡 ★7：刹车判断在最坏规模下的开销。
// 计时那一条不进常规套件（量的是本机 CPU，机器忙时数会漂、会误红；与 canvasShotLatency.perf.test.ts 同一约定）：
//   NOMI_PERF=1 pnpm exec vitest run electron/shared/agentCapabilities/directGenerationBrakes.perf.test.ts --silent=false
// 「请求批准档不读 Run」是正确性断言，常规套件照跑。
// 最坏规模：一个 Run 里 1000 镜、每镜 3 次失败 + 1 次待重试（共 3000 个 job）。
// 预算：一次「策略代批」判定 ≤ 50ms（同步在草稿落盘之后、封印之前，远小于用户感知的 100ms 反馈线）。
// 这是纯函数的计时，不是页面交互；页面交互（打开权限弹层 / 切档）只渲染两行，不依赖 Run 规模。
const SHOTS = 1000;
const BUDGET_MS = 50;
const enabled = process.env.NOMI_PERF === "1";

function worstRun() {
  const ids = Array.from({ length: SHOTS }, (_, index) => `s${index}`);
  const jobs = ids.flatMap((shotId, shot) => [1, 2, 3].map((attempt) => ({
    stageId: "generate", attempt, status: "needs_attention",
    createdAt: new Date(Date.UTC(2026, 9, 12, 0, 0, attempt + (shot % 50))).toISOString(),
    metadata: { shotId },
  })));
  return { generationPlan: { shots: ids.map((shotId) => ({ shotId })) }, jobs, status: "running" } as never;
}

describe("刹车判断开销（★7）", () => {
  it.skipIf(!enabled)(`直接生成档：${SHOTS} 镜 × 3 次失败，一次代批判定 p95 ≤ ${BUDGET_MS}ms`, () => {
    const run = worstRun();
    const samples: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      const verdict = spendDecisionByPolicy({ mode: "direct" }, run);
      samples.push(performance.now() - started);
      expect(verdict).toMatchObject({ decided: false, brake: { reason: "retry-limit" } });
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
    const median = samples[Math.floor(samples.length / 2)];
    console.log(`[direct-generation-brakes-perf] ${JSON.stringify({ shots: SHOTS, medianMs: Math.round(median * 10) / 10, p95Ms: Math.round(p95 * 10) / 10 })}`);
    expect(p95, `median ${median.toFixed(2)}ms / p95 ${p95.toFixed(2)}ms`).toBeLessThanOrEqual(BUDGET_MS);
  });

  it("请求批准档不读 Run：惰性来源一次都不调用", () => {
    let reads = 0;
    spendDecisionByPolicy({ mode: "request" }, () => { reads += 1; return worstRun(); });
    expect(reads).toBe(0);
  });
});
