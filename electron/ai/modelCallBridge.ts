// CJS 主进程 → pi 岛的「调一次模型」。pi 是 ESM-only，主进程只能经编译出的 `laneNativeLoader.cjs` 动态 import 过去
// （与 skillStore.readSkillRecords 同一座桥）。签名只认 `shared/agentLane/modelCallPort.ts` 那一份。
// 单测跑源码、没有这座桥：tests/setup/modelCallBridge.ts 把它直接接到岛上（同一个 callModelOnce，只是不经 .cjs）。
import { createRequire } from "node:module";
import type { CallModelOnce } from "../shared/agentLane/modelCallPort";

type Native = { callModelOnce: CallModelOnce; prewarmModelCall(): Promise<void> };
const native = () => createRequire(__filename)("../agentLane/laneNativeLoader.cjs") as Native;

export const callModelOnce: CallModelOnce = (options) => native().callModelOnce(options);

/** 把核心（连同 pi-ai）先装好，第一次真用时不再现装（electron/ai/modelCallPrewarm.ts）。 */
export const prewarmModelCall = (): Promise<void> => native().prewarmModelCall();
