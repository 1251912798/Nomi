// G3b ③ 的「崩溃」那一半：一个走**生产路径**打开 lane、停在审批卡上、然后等着被 SIGKILL 的进程。
//
// 为什么要一个真的子进程：同一个进程里第二次打开同一条会话会撞 `laneSession.mts` 的单持有者
// 名单，绕过它就等于测了一条生产走不到的路。真崩溃是「进程没了，转录里留下一个 toolCall
// 没有 toolResult」——只有把自己杀掉才制造得出来。
import { openLane } from '../../electron/agentLane/laneHost.mjs';
import { createDocumentLaneTools } from '../../electron/agentLane/laneDocumentTools.js';
import { createDocumentPort, LANE_SYSTEM_PROMPT } from './laneFixture.mjs';

const [projectDir, baseURL] = process.argv.slice(2);

const lane = await openLane({
  projectDir,
  systemPrompt: LANE_SYSTEM_PROMPT,
  model: {
    kind: 'openai-compatible', providerId: 'nomi-lane', modelId: 'chosen-model',
    baseURL, authType: 'api-key', apiKey: 'fixture-key',
  },
  tools: createDocumentLaneTools(createDocumentPort()),
  // 每步问 + 有窗口 = 这次写入必然停下来等人，而这个进程永远不回答。
  approval: { hasUserInterface: true, policy: () => ({ mode: 'step', spend: 'confirm' }) },
});
lane.subscribe((projection) => {
  if (projection.pending) process.stdout.write(`PARKED session=${lane.sessionId}\n`);
});
void lane.execute({ kind: 'prompt', text: 'Append a closing line.' });
// 不 close：父进程 SIGKILL 我们，转录里就留下一个没有结果的 toolCall。
await new Promise(() => {});
