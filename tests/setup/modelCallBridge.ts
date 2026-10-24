import { vi } from 'vitest';

// 「调一次模型」的核心住在 ESM 岛（electron/agentLane/laneModelCall.mts），主进程 CJS 侧经编译产物 `laneNativeLoader.cjs`
// 桥过去（electron/ai/modelCallBridge.ts）。vitest 跑的是源码，没有那座桥：这里把桥换成岛本身——同一个 callModelOnce，
// 只是不经 .cjs。与 skillCatalogBridge.ts 同款纪律：换的是传输，不是行为；桥本身由 agent-runtime 套件（编译出 .cjs）验。
// 岛在调用时才 import（工厂里 import 会和模块图互等）。
vi.mock('../../electron/ai/modelCallBridge', () => ({
  callModelOnce: async (options: Parameters<typeof import('../../electron/agentLane/laneModelCall.mjs')['callModelOnce']>[0]) =>
    (await import('../../electron/agentLane/laneModelCall.mjs')).callModelOnce(options),
  prewarmModelCall: async (protocols: Parameters<typeof import('../../electron/agentLane/laneModelCall.mjs')['prewarmModelCall']>[0]) =>
    (await import('../../electron/agentLane/laneModelCall.mjs')).prewarmModelCall(protocols),
}));
