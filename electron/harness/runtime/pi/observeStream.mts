// 旧运行核对原生流看门狗的**再导出接缝**。**随 `electron/harness/runtime/` 一起在阶段 4 删掉。**
//
// 实现已经搬到 `electron/agentLane/laneStreamObserver.mts`（阶段 4 前置 ③）：新通路的
// `laneProviderGuard.mts` 每条 lane 都要用它，留在这个要删的目录里就是一条 agentLane → harness
// 的反向边。这里**只有 re-export、没有第二份实现**（P1），好让本目录里的旧代码一行都不用改——
// `run.mts` 与 `errorFacts.mts` 的 import 因此保持原样，本 PR 对旧通路的 diff 为零。
export { NativeStreamTimeout, observeNativeStream } from '../../../agentLane/laneStreamObserver.mjs';
export type { NativeClock, NativeStreamObservation } from '../../../agentLane/laneStreamObserver.mjs';
