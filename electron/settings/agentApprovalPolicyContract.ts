import {
  DEFAULT_PROJECT_AGENT_APPROVAL_POLICY,
  PROJECT_AGENT_APPROVAL_MODES,
  type ProjectAgentApprovalMode,
  type ProjectAgentApprovalPolicy,
} from "../shared/agentCapabilities/capabilityApprovalPolicy";

/**
 * 「用户选的权限档」（请求批准 / 直接生成）在主进程这一份**权威值**的形状。
 *
 * 为什么它必须住在主进程：这一档是**用户设置**，不是某条 lane 的会话状态（外部 MCP 宿主那条路读不到渲染层的档位；
 * 刚打开项目、渲染层还没推上来的那一小段时间里，主进程也不该答别人的档位）。
 * 词表本身的 owner 是 `shared/agentCapabilities/capabilityApprovalPolicy.ts`，这里只负责「持久化那一份」。
 * 归一化刻意保守：认不出的值一律回落到默认档（更常问，不会更少问）。
 *
 * schemaVersion 2（2026-10-12）：三档 `step / safe-auto / project` + `spend` 轴 → 两档 `request / direct`。
 * **迁移只发生在 `normalize` 这一处**：盘上旧词表的值（包括旧的「全自动」）一律落 `request`
 * （用户拍板「全部落在请求批准」），直接生成必须是升级后用户自己重新点出来的。不留旧词的运行时别名。
 */
export type AgentApprovalPolicySettings = {
  schemaVersion: 2;
  policy: ProjectAgentApprovalPolicy;
};

export const DEFAULT_AGENT_APPROVAL_POLICY_SETTINGS: AgentApprovalPolicySettings = Object.freeze({
  schemaVersion: 2,
  policy: DEFAULT_PROJECT_AGENT_APPROVAL_POLICY,
});

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeAgentApprovalPolicySettings(value: unknown): AgentApprovalPolicySettings {
  const raw = record(value);
  // 既接受 { schemaVersion, policy }，也接受裸的 { mode }：写入口只有一个，但读的是盘上可能被手改过的文件，
  // 形状宽一点比整份丢掉诚实（丢掉 = 静默回到默认档，用户不会知道）。
  const candidate = record(raw.policy ?? raw);
  // 旧三档的词（step / safe-auto / project）与新词表没有交集，所以「认不出就落默认」本身就是迁移：
  // 旧的「全自动」也落 request，直接生成必须是升级后用户自己重新点出来的。
  const mode = PROJECT_AGENT_APPROVAL_MODES.includes(candidate.mode as ProjectAgentApprovalMode)
    ? candidate.mode as ProjectAgentApprovalMode
    : DEFAULT_PROJECT_AGENT_APPROVAL_POLICY.mode;
  return { schemaVersion: 2, policy: { mode } };
}
