// Agent lane · 一个项目的多条对话（方案 §2.2 G2「多线程 = 多 lane」）
//
// ── 它解决的真实摩擦（D1）──
// 今天一个项目只有一条 Agent 对话（`laneIpc.ts` 自陈「一个窗口一条」）。用户想一边让它
// 改第三场戏、一边另起一条问「这个片种一般怎么排」，就只能把两件事挤进同一条历史里——
// 于是上下文越滚越长、压缩把前面那件事的细节吃掉、模型开始把两件事搅在一起。
// 「多条对话」不是一个多窗口功能，它是**上下文隔离**：一条对话一件事。
//
// ── 为什么它是独立一层，而不是给 `laneHost` 加几个方法 ──
// `openLane()` 返回的那个 handle 按定义只认识**自己这一条**：它持有一条会话的写权、
// 一份快照、一个闸。让它同时知道「隔壁还有几条」，就等于给每条 lane 发一份全局视图——
// 而两条 lane 各自更新那份视图的那一刻，就有了第二个所有者。所以列表、切换、增删住这里，
// 转录、用量、审批住 `laneHost`，两边不重叠。
//
// ── 落盘长什么样（R29：全是 pi 自己的能力）──
// 一条对话 = 一条 pi 会话，住在 `<project>/.nomi/agent-sessions/--nomi-lane-<名字>--/` 下。
//   · 列表 = `JsonlSessionRepo.list()`（只读每个文件的表头，不读转录）
//   · 新建 = `repo.create({cwd})`
//   · 删除 = `repo.delete(metadata)`
// 四条命令里只有「切换」是我们的活，而它就是「关掉这条、打开那条」。**没有第二份对话索引**：
// 索引文件会和盘上的真相分叉（用户手动删掉一个会话文件之后，索引仍然说它在），表头不会。
import { BACKGROUND_CONTEXT, type Context } from '@earendil-works/pi-agent-core/harness/context';

import type {
  LaneCommand, LaneCommandOutcome, LaneHandle, LaneSummary, LaneWorkspaceHandle, LaneWorkspaceProjection,
} from '../shared/agentLane/laneContracts.js';
import { openLane } from './laneHost.mjs';
import { deleteLaneSession, listLaneSessions } from './laneSession.mjs';
import type { OpenLaneOptions } from './laneRuntimePort.js';

/** 打开一个项目的对话工作区。`laneName` = 一开始停在哪一条（缺省 `main`）。 */
export type LaneWorkspaceOptions = Omit<OpenLaneOptions, 'sessionId'>;

/** 换 lane 时怎么造那条 lane 的宿主。测试用它注入一个假宿主；生产恒 `openLane`。 */
export type LaneOpener = (options: OpenLaneOptions) => Promise<LaneHandle>;

const DEFAULT_LANE = 'main';

export async function openLaneWorkspace(
  options: LaneWorkspaceOptions,
  openOne: LaneOpener = openLane,
): Promise<LaneWorkspaceHandle> {
  const context: Context = BACKGROUND_CONTEXT;
  const listeners = new Set<(projection: LaneWorkspaceProjection) => void>();

  let active: LaneHandle = await openOne({ ...options, laneName: options.laneName ?? DEFAULT_LANE });
  let unsubscribeActive = active.subscribe(() => publish());
  let lanes: readonly LaneSummary[] = await readLanes();
  let projection: LaneWorkspaceProjection = { lanes, active: active.projection() };

  function publish(): void {
    projection = { lanes, active: active.projection() };
    for (const listener of listeners) listener(projection);
  }

  /**
   * 盘上有哪些对话。**每次结构性变化后重读，不维护一份内存副本**：内存副本要靠每条改动
   * 路径都记得同步，而漏掉的那一条不会报错——它只是让列表少一行，看起来像「那条对话没了」。
   */
  async function readLanes(): Promise<readonly LaneSummary[]> {
    const summaries = await listLaneSessions(options.projectDir, context);
    return summaries.map((summary) => ({
      laneName: summary.laneName, sessionId: summary.sessionId,
      createdAt: summary.createdAt, updatedAt: summary.updatedAt,
    }));
  }

  /**
   * 切到另一条对话：**先关掉这一条，再开那一条**。
   *
   * 顺序不能反，也不能两条同时开着。pi 的单打开者名单是按会话算的（#8852），两条不同会话
   * 同时开着虽然不写坏文件，但意味着用户看不见的那一条仍然在跑、在花钱——而他以为自己
   * 已经离开了。关掉这一条同时也让等待中的审批卡以 `window-closed` 收尾（`laneHost.close`），
   * 那正是「我切走了，那个动作不该背着我执行」的正确语义。
   */
  async function switchTo(laneName: string): Promise<void> {
    unsubscribeActive();
    await active.close();
    active = await openOne({ ...options, laneName });
    unsubscribeActive = active.subscribe(() => publish());
  }

  async function handleLaneCommand(command: Extract<LaneCommand, { laneName: string }>): Promise<void> {
    if (command.kind === 'lane-create') {
      // 同名已存在 → 抛。「新建」悄悄变成「打开一条有历史的对话」是最坏的那种默认值：
      // 用户以为自己在一张白纸上开始，而模型看得见上一件事的全部上下文。
      if (lanes.some((lane) => lane.laneName === command.laneName)) {
        throw new Error(`This project already has a conversation named "${command.laneName}"`);
      }
      await switchTo(command.laneName);
      lanes = await readLanes();
      return;
    }
    if (command.kind === 'lane-select') {
      if (command.laneName === active.laneName) return;
      // 不存在 → 抛，不静默新建：面板拿着一份过期列表点进一条已被删掉的对话时，
      // 静默新建会给他一条空白对话，而他以为那是自己昨天写的东西。
      if (!lanes.some((lane) => lane.laneName === command.laneName)) {
        throw new Error(`This project has no conversation named "${command.laneName}"`);
      }
      await switchTo(command.laneName);
      lanes = await readLanes();
      return;
    }
    // 删除。当前这条不许删——删完就没有活着的对话了，而「工作区没有 active」这个状态
    // 下游一个消费者都没有。产品上的正确姿势是先切走再删，面板照这条来。
    if (command.laneName === active.laneName) {
      throw new Error('Switch to another conversation before deleting this one');
    }
    if (!(await deleteLaneSession(options.projectDir, command.laneName, context))) {
      throw new Error(`This project has no conversation named "${command.laneName}"`);
    }
    lanes = await readLanes();
  }

  let closing: Promise<void> | undefined;
  return {
    projection: () => projection,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    execute: async (command: LaneCommand): Promise<LaneCommandOutcome> => {
      if (command.kind === 'lane-select' || command.kind === 'lane-create' || command.kind === 'lane-delete') {
        await handleLaneCommand(command);
        publish();
        return {};
      }
      const outcome = await active.execute(command);
      publish();
      return outcome;
    },
    appendTaskNote: (note) => active.appendTaskNote(note),
    refreshTasks: () => active.refreshTasks(),
    close: () => closing ??= (async () => {
      unsubscribeActive();
      listeners.clear();
      await active.close();
    })(),
  };
}
