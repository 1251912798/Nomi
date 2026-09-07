// Agent lane · 主进程宿主（**薄**）
//
// 它只做三件事，方案 §2.1 ⑤ 写死的那三件：
//   a. lane 生命周期（会话打开/关闭、项目 ↔ lane 映射）
//   b. 把 Nomi 的闸与两条上限（回合请求数、连续同一失败）挂到 pi 的 `before_tool` / `after_tool`
//   c. 把 Nomi 的领域记录以 `appendCustomEntry` 放进**同一条** transcript
//
// 它**不存转录 · 不排序 · 不重试 · 不算钱**——四条都是 pi 的活，这也是
// `docs/engineering/framework-boundaries.json` 把 `electron/agentLane/` 加进
// session-persistence / retry-policy / steering / ordered-transcript 四条 scope 的原因：
// 新目录里再出现自研版本，`check:framework-boundary` **当场报红**（R28）。
// 「不重试」说的是不写重试循环：`LANE_RETRY_POLICY` 是**配置**，退避、事件、状态全是 pi 的。
//
// 对照今天的宿主：`electron/projectAgentHost/` 是 52 个生产文件、9 688 行。
import { AgentHarness, reduceLaneSnapshot, type AgentLane, type LaneSnapshot } from '@earendil-works/pi-agent-core';
import { BACKGROUND_CONTEXT, type Context } from '@earendil-works/pi-agent-core/harness/context';
import { createModels } from '@earendil-works/pi-ai';
import { createNomiProvider } from '../harness/runtime/pi/model.mjs';
import { LANE_APPROVAL_NOTE_TYPE, type LaneApprovalNote, type LaneCommand, type LaneHandle, type LaneProjection }
  from '../shared/agentLane/laneContracts.js';
import type { OpenLane, OpenLaneOptions } from './laneRuntimePort.js';
import { composeLaneSystemPrompt } from './lanePromptSections.js';
import { openLaneSession } from './laneSession.mjs';
import { createLaneTools } from './laneTools.mjs';
import { projectLaneSnapshot, type LaneModelFacts } from './laneProjection.mjs';

/** 阶段 1 的观测：pi 每个 delta 自报的 `contentIndex`，与我们从 content 数组下标推出来的那个。 */
export interface LaneOrderObservation {
  /** pi 说的（`AssistantMessageEvent.contentIndex`，探针报告 §5.1）。 */
  reported: number
  /** 该下标处那一段的类型，用来证明「我们数的和它说的是同一段」。 */
  partType: string
}

/**
 * 传输层看门狗的两个预算。**旧路 `run.mts` 用的是同样两个数**（90s / 120s），
 * 而它们在这里第一次对新通路生效——影子期的 lane 在供应商流卡住时会永远转圈
 * （方案 §0 的实核，G3c 的先红后绿就是这条）。
 */
export const LANE_FIRST_RESPONSE_MS = 90_000;
export const LANE_IDLE_MS = 120_000;

/**
 * 重试策略。**显式传，不吃默认值**——数值和 pi 的 `DEFAULT_RETRY_POLICY` 相同
 * （`harness/config.js:1`），但「相同」和「继承」是两件事：上游哪天改了默认值，
 * 我们的退避窗口会跟着变而没有任何一条测试会红。
 *
 * 3 次上限下最长退避 1+2+4 = 7s，所以上游那条「退避无上限」的 open issue
 * （[#8826](https://github.com/earendil-works/pi/issues/8826)）对我们无感。
 */
export const LANE_RETRY_POLICY = Object.freeze({ enabled: true, maxRetries: 3, baseDelayMs: 1_000 } as const);

/**
 * 一个回合最多几次模型请求。**唯一一层策略**（方案 §1.6 第六行）。
 *
 * 挂点是 `before_request`：harness 没有 `shouldStopAfterTurn`（那是老路
 * `createAgentSession` 的），它能停一个 run 的口子只有 `before_tool` 的 `block.terminate`、
 * `after_tool` 的 `terminate` 和 `requestAbort` 三个。所以这里数数、在 `before_tool` 拦。
 */
export const LANE_MAX_MODEL_REQUESTS = 24;

/**
 * 同一个工具连着撞同一堵墙几次就拦下来（Nomi 独有的那条规则）。
 *
 * 它在解决哪个真实摩擦：用户撞到过「连续 6 次被自己拒收」——模型收到一句它读不懂的
 * 错误，于是把一模一样的调用又发一遍，六次。上游没有这条规则（它假设错误正文足够
 * 可行动），我们两边都做：正文可行动（`laneToolContract`）**且**连续撞墙有上限。
 */
export const LANE_REPEATED_FAILURE_BLOCK = 3;
export const LANE_REPEATED_FAILURE_TERMINATE = 5;

export interface LaneHandleWithObservations extends LaneHandle {
  /**
   * 为什么要留这个：`lane.watch()` **故意剥掉** `message_update` 的 `event` 字段
   * （`LaneWatchSourceEvent` 里写着 `Omit<…, "event">`），所以想看 `contentIndex`
   * 必须走 `harness.events.on()`。这里把两条流对上，证明投影里的 `contentIndex`
   * 是 pi 说的那个、不是我们数出来的巧合——顺序只有一个来源（不变量 I1）。
   */
  orderObservations(): readonly LaneOrderObservation[]
}

const PART_TYPE_BY_EVENT: Readonly<Record<string, string>> = {
  text_start: 'text', text_delta: 'text', text_end: 'text',
  thinking_start: 'thinking', thinking_delta: 'thinking', thinking_end: 'thinking',
  toolcall_start: 'toolCall', toolcall_delta: 'toolCall', toolcall_end: 'toolCall',
};

export const openLane: OpenLane = async (options: OpenLaneOptions): Promise<LaneHandleWithObservations> => {
  const context: Context = BACKGROUND_CONTEXT;
  const laneName = options.laneName ?? 'main';
  const { session, sessionId, release } = await openLaneSession(options, context);
  // 会话一旦打开，这个进程就是它**唯一**的持有者。装配到一半失败（模型配置写错、
  // 工具名重复、schema 门岗报红）而不交还持有权，用户下一次打开同一条历史会撞上
  // 「已经有人开着」——而那个人是一个早就失败退出的调用。
  try {
    return await assemble();
  } catch (cause) {
    await session.close(context).catch(() => undefined);
    await release(context);
    throw cause;
  }

  async function assemble(): Promise<LaneHandleWithObservations> {
  // 看门狗装在 provider 的流上，所以**每一次**模型请求都带着它——包括压缩与分支摘要那两次
  // （它们走 `streamSimple`，只用 `result()`）。装在别处就会漏掉那两条路，而它们卡住的样子
  // 和主请求卡住一模一样。
  const { provider, model, credentials, pricingBasis } = await createNomiProvider(options.model, {
    firstResponseMs: options.watchdog?.firstResponseMs ?? LANE_FIRST_RESPONSE_MS,
    idleMs: options.watchdog?.idleMs ?? LANE_IDLE_MS,
  });
  // 三行（花费/上下文/推理）需要的**模型侧事实**，在这里定死一次，投影层不再回头问任何人。
  // `contextWindow` 只收显式声明的那个：provider 内部的 128k 兜底是给 pi 的类型用的，不是分母。
  const modelFacts: LaneModelFacts = { model, pricing: pricingBasis,
    ...(options.model.contextWindow === undefined ? {} : { contextWindow: options.model.contextWindow }) };
  const models = createModels({ credentials });
  models.setProvider(provider);
  const tools = createLaneTools(options.tools);
  // `Available tools` / `Guidelines` 两段由宿主拼，不靠调用方记得（G-03 的后一半）。
  // 2026-09-07 合并评审实核：`composeLaneSystemPrompt` 此前零生产调用者——通道②③写满了，
  // 一个字都到不了模型。拼接点放在这里，是因为这里是唯一知道「这条 lane 装了哪些工具」的地方。
  const systemPrompt = composeLaneSystemPrompt(options.systemPrompt, options.tools);
  const { harness } = await AgentHarness.create<undefined>({
    session, models, model, systemPrompt, tools,
    activeToolNames: tools.map((tool) => tool.name),
    toolExecution: 'sequential',
    retry: { ...LANE_RETRY_POLICY },
    entryProjectors: {
      // 审批记录**不投给模型**：拒收的理由 pi 已经一字不改地做成了那次调用的 tool result
      // （探针 §4.2 臂 B），再投一遍就是同一句话说两遍、占两份上下文。留着这个注册点是因为
      // 阶段 3 的任务卡/失败卡要走同一个口子，那时它才真的需要投影。
      [LANE_APPROVAL_NOTE_TYPE]: () => undefined,
    },
  }, context);
  const lane: AgentLane = await harness.lane(laneName, context);

  const gate = options.gate;
  const maxModelRequests = options.limits?.maxModelRequests ?? LANE_MAX_MODEL_REQUESTS;
  // 计数按 **run** 走，不按 lane 走：上限说的是「这一轮」，一条 lane 活一整天。
  const requests = { runId: '', count: 0 };
  // 连续撞墙：一个 key + 一个计数。**连续**的定义就写在这两行里——换了 key 或者成功一次，
  // 计数归零。累计次数不在这里算，那是另一个问题（「这个工具总在坏」是审计的活，不是拦截的活）。
  const failures = { key: '', count: 0 };

  harness.hooks.on('before_request', (event) => {
    if (event.step !== 'assistant') return undefined;
    // 重试不消耗预算：`attempt` 在重试时递增，同一步会带着 2、3、4 再来一次。
    // 把重试算进步数，等于让一次网络抖动吃掉用户的回合。
    if (event.attempt !== 1) return undefined;
    if (requests.runId !== event.runId) { requests.runId = event.runId; requests.count = 0; }
    requests.count += 1;
    return undefined;
  });

  harness.hooks.on('before_tool', async (event, hookContext) => {
    // ① 回合上限。**模型看到的是一句人话，不是一个 `step-limit` 错误码**——它还有机会
    // 用这一步把结论说出来，而错误码只会让这一轮以「失败」收场，尽管活已经干了大半。
    if (requests.count >= maxModelRequests) {
      return { block: { terminate: true, reason:
        `This turn has reached its ${maxModelRequests}-model-request limit, so no further tool call will run. `
        + 'State your conclusion and what is still undone, in text, now.' } };
    }
    // ② 闸。上限先判：到了上限就没有「问用户要不要放行」这回事了。
    if (gate) {
      const decision = await gate({ toolCallId: event.toolCallId, toolName: event.toolName, args: event.args });
      const note: LaneApprovalNote = {
        toolCallId: event.toolCallId, toolName: event.toolName,
        decision: decision.allow ? 'granted' : 'denied',
        ...(decision.allow ? {} : { reason: decision.reason }),
      };
      // 宿主领域记录骑在**同一条**转录上，按 `toolCallId` join，永不复制工具正文
      // （方案 §7 岔路 2 = B，2026-09-07 用户拍板）。
      await lane.appendCustomEntry(LANE_APPROVAL_NOTE_TYPE, { ...note }, hookContext);
      if (!decision.allow) return { block: { reason: decision.reason } };
    }
    // ③ 连续撞同一堵墙。判在闸之后：被闸拒收不是工具坏了，那条路有自己的文案。
    if (failures.count >= LANE_REPEATED_FAILURE_BLOCK && failures.key.startsWith(`${event.toolName} `)) {
      const terminate = failures.count >= LANE_REPEATED_FAILURE_TERMINATE;
      return { block: { ...(terminate ? { terminate: true } : {}), reason:
        `${event.toolName} has failed the same way ${failures.count} times in a row. `
        + 'Do not send it again. Either take a different route — a different tool, a narrower scope, '
        + 'values re-read from the current state — or tell the user plainly that this cannot be done.' } };
    }
    return undefined;
  });

  harness.hooks.on('after_tool', (event) => {
    // 「同一个失败」按**工具名 + 失败正文首行**认。为什么是首行：`renderLaneToolFailure`
    // 把 `code` 留给了 UI 分档、没写进正文（那是刻意的，`[error] E_DENIED` 对模型等于没说），
    // 而首行正是那句「哪里错、期望什么」——同一堵墙每次都给同一句。
    const body = event.content.map((part) => (part.type === 'text' ? part.text : '')).join('');
    const key = event.isError ? `${event.toolName} ${body.split('\n', 1)[0]}` : '';
    // 「连续」的定义就在这一行：任何一条别的结果——成功了，或者换了一堵墙——都把计数清掉。
    if (key !== failures.key) { failures.key = key; failures.count = key ? 1 : 0; }
    else if (key) failures.count += 1;
    return undefined;
  });

  const observations: LaneOrderObservation[] = [];
  const stopObserving = harness.events.on('message_update', (event) => {
    const inner = event.event;
    // `start` 是这个联合体里唯一没有 `contentIndex` 的成员（`pi-ai` types.d.ts:410），
    // 因为它说的是「这条消息开始了」而不是「哪一段」。表里查不到就跳过——不编一个 0。
    const partType = PART_TYPE_BY_EVENT[inner.type];
    if (partType === undefined || !('contentIndex' in inner)) return;
    observations.push({ reported: inner.contentIndex, partType });
  });

  const watch = await lane.watch(context);
  let snapshot: LaneSnapshot = watch.snapshot;
  let projection: LaneProjection = projectLaneSnapshot(snapshot, modelFacts);
  const listeners = new Set<(next: LaneProjection) => void>();
  const publish = () => {
    projection = projectLaneSnapshot(snapshot, modelFacts);
    for (const listener of listeners) listener(projection);
  };
  watch.start((event, eventContext) => {
    if (reduceLaneSnapshot(snapshot, event) !== 'rebase') {
      publish();
      return;
    }
    // 导航（切分支）之后局部归约不成立，pi 明说要一份新快照。照做，不猜。
    void watch.resnapshot(eventContext).then((fresh) => { snapshot = fresh; publish(); });
  });

  let closing: Promise<void> | undefined;
  return {
    laneName, sessionId,
    projection: () => projection,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    orderObservations: () => observations,
    execute: async (command: LaneCommand) => {
      if (command.kind === 'prompt') {
        await lane.prompt(command.text, undefined, context);
        return;
      }
      await lane.abort(context);
    },
    close: () => closing ??= (async () => {
      stopObserving();
      watch.unsubscribe();
      listeners.clear();
      await harness.close(context);
      // repo 是**按项目共享的**（`laneSession.mts`：pi 的单打开者名单只有一张才拦得住 #8852），
      // 所以这里交还持有权，而不是替别的 lane 把它关掉。
      await release(context);
    })(),
  };
  }
};
