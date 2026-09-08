// 旧路 `createAgentSession` 的模型接缝。**随 `electron/harness/runtime/` 一起在阶段 4 删掉。**
//
// provider 的装配已经搬到 `electron/agentLane/laneModelProvider.mts`（阶段 4 前置 ③）：
// 新通路每开一条 lane 都要用它，留在这个要删的目录里就是一条反向边。这里剩下的
// `createNomiModelRuntime` 只有旧路 `session.mts` 一个消费者，**不是第二份装配**——
// 它调的就是搬走的那一个 `createNomiProvider`（P1）。
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { createNomiProvider } from '../../../agentLane/laneModelProvider.mjs';
import type { NomiModelConfig } from '../../../shared/agentLane/laneModelConfig.js';

export type { NomiStreamGuard } from '../../../agentLane/laneProviderGuard.mjs';

export type { NomiModelConfig } from '../../../shared/agentLane/laneModelConfig.js';

/** The legacy `createAgentSession` seam. Unchanged behaviour; it just no longer owns the assembly. */
export async function createNomiModelRuntime(input: NomiModelConfig) {
  const { provider, model, credentials } = await createNomiProvider(input);
  const modelRuntime = await ModelRuntime.create({ credentials, modelsPath: null,
    allowModelNetwork: false, refreshOnCreate: false });
  modelRuntime.registerNativeProvider(provider);
  return { modelRuntime, model };
}
