// CJS 主进程 → pi 岛的「调一次模型」。pi 是 ESM-only，主进程只能经编译出的 `laneNativeLoader.cjs` 动态 import 过去
// （与 skillStore.readSkillRecords 同一座桥）。签名只认 `shared/agentLane/modelCallPort.ts` 那一份。
// 单测跑源码、没有这座桥：tests/setup/modelCallBridge.ts 把它直接接到岛上（同一个 callModelOnce，只是不经 .cjs）。
import { createRequire } from "node:module";
import type { CallModelOnce, ModelCallPort, ModelProtocol } from "../shared/agentLane/modelCallPort";

const native = () => createRequire(__filename)("../agentLane/laneNativeLoader.cjs") as ModelCallPort;

export const callModelOnce: CallModelOnce = (options) => native().callModelOnce(options);

/** 预热那一段在主进程 User Timing 里的名字。 */
export const TEXT_MODEL_PREWARM_MEASURE = "nomi:text-model-prewarm";

let prewarmed: Promise<void> | null = null;

/**
 * 把核心（连同 pi-ai）先装好，第一次真用时不再现装。只装一次；失败了下次再试（第一次真用时也会照常现装）。
 * 谁来叫：渲染层在**有意图时**（指针移进 / 焦点进文本动作，空闲回调里，src/workbench/api/textActionIntent.ts）经 nomi:tasks:text:prewarm 叫（electron/ai/textStreamIpc.ts）。
 * 不在启动后固定时刻、也不在界面一挂上就叫：Electron 主进程里装一条协议的 SDK 是一段约 190–280ms 的同步活，固定时刻会撞上
 * 「启动后几秒打开项目」（冷打开中位 946 → 1341ms），带文本动作的界面又是随项目一起挂的（1257ms）——docs/evidence/2026-10-21-text-tasks-pi-ai/c6-prewarm-trigger.txt。
 */
export const prewarmModelCall = (protocols: readonly ModelProtocol[]): Promise<void> => {
  const startedAt = performance.now();
  // 主进程 User Timing 记一笔（只一条）：性能脚本据此找到预热那一段，量它期间主进程被占住多久（tests/perf/text-prewarm-loop-block.mjs）。
  prewarmed ??= native().prewarmModelCall(protocols).then(
    () => { performance.measure(TEXT_MODEL_PREWARM_MEASURE, { start: startedAt, detail: { protocols: [...protocols] } }); },
    (error: unknown) => { prewarmed = null; throw error; },
  );
  return prewarmed;
};
