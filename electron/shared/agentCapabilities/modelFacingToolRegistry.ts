// 模型可见工具的**唯一注册表**，与从它派生的两个 profile（方案 §3.1，阶段 5a）。
//
// 这个文件回答的是一个问题：**「模型看得见什么」这件事，谁说了算。**
// 阶段 5a 之前答案是「看你问谁」——Agent lane 问 `electron/agentLane/lane*Tools.ts`，
// 外部宿主经 MCP 问 `mcpCapabilityProjection.ts` 里另一份手抄的 JSON Schema。
// 现在两边都问这里，而这里只是把每个能力自己声明的描述符收齐。
//
// 差异**只能**来自声明，共三种，全部机器可查：
//   ① `spec.profiles`      —— 「外部才有 / 内部才有」（`asset.read` 只投 mcp）；
//   ② `effect:"paid"`      —— 付费能力不进内部 profile（`paidBoundary.ts`，唯一判据）；
//   ③ MCP 的租约与归并    —— `leaseHandle` 首字段 + 一契约一工具（`projectMcpTool`）。
//
// 除此之外的任何不同都是漂移，`scripts/check-model-schema.ts` 的 `profile-schema-drift`
// 规则按能力逐条比指纹，当场红。
import { CAPABILITY_CONTRACTS, resolveCapabilityAlias } from "./registry";
import type { CapabilityContract } from "./capabilityContract";
import { extendedModelToolSpecs } from "./extendedModelTools";
import { productionModelToolSpecs } from "./productionModelTools";
import { assetModelToolSpecs } from "./assetModelTools";
import { canvasModelToolSpecs } from "./canvasModelTools";
import { documentModelToolSpecs } from "./documentModelTools";
import { timelineModelToolSpecs } from "./timelineModelTools";
import { projectsToInternalProfile } from "./paidBoundary";
import {
  projectMcpTool,
  modelToolCapabilityId,
  projectsToProfile,
  type McpProfileTool,
  type ModelFacingToolSpec,
  type ToolProfile,
} from "./modelFacingTools";

type AnyCapabilityContract = CapabilityContract<unknown, unknown>;

/**
 * **顺序是合同，不是审美**：`agentToolCatalog.ts:31-35` 已经把「`tools/list` 的确定性顺序」
 * 定成 prompt/KV-cache 合同（上游 `splitDeferredTools` 靠稳定前缀保住缓存）。这里同一条纪律：
 * 目录按固定顺序拼，别按 `Object.keys` 之类会随实现漂的东西。
 */
function collectSpecs(): readonly ModelFacingToolSpec[] {
  const specs = [
    ...documentModelToolSpecs(),
    ...canvasModelToolSpecs(),
    ...timelineModelToolSpecs(),
    ...assetModelToolSpecs(),
    ...extendedModelToolSpecs(),
    ...productionModelToolSpecs(),
  ];
  const names = new Set<string>();
  for (const spec of specs) {
    if (names.has(spec.name)) throw new Error(`Duplicate model-facing tool name: ${spec.name}`);
    names.add(spec.name);
    if (!contractById(spec.contractId)) {
      throw new Error(`Model-facing tool ${spec.name} names an unregistered capability: ${spec.contractId}`);
    }
    // 装配期不变量（阶段 2 第 ⑨ 维）：只读必然没有要收回的东西，花钱必然改状态。
    // 编译器管不了这两条，所以它们在这里当场抛——加一个工具而不说清它花不花钱、
    // 可不可逆，App 起不来（R28：防线建在最早能拦住的那层）。
    if (!spec.effects.mutates && spec.effects.reversal !== "none") {
      throw new Error(`${spec.name} is read-only but declares reversal ${spec.effects.reversal}`);
    }
    if (spec.effects.billable && !spec.effects.mutates) {
      throw new Error(`${spec.name} is billable but declares it changes nothing`);
    }
  }
  return Object.freeze(specs);
}

function contractById(id: string): AnyCapabilityContract | undefined {
  return CAPABILITY_CONTRACTS.find((contract) => contract.id === id);
}

export const MODEL_FACING_TOOL_SPECS: readonly ModelFacingToolSpec[] = collectSpecs();

/** Resolve current model names and external aliases through their actual descriptor owners. */
export function resolveModelToolCapabilityId(name: string, args?: unknown): string | undefined {
  const spec = MODEL_FACING_TOOL_SPECS.find(candidate => candidate.name === name);
  return spec ? modelToolCapabilityId(spec, args) : resolveCapabilityAlias(name)?.contract.id;
}

/** 某个能力的全部别名说明书，按声明顺序。 */
export function specsForCapability(contractId: string): readonly ModelFacingToolSpec[] {
  return MODEL_FACING_TOOL_SPECS.filter((spec) => spec.contractId === contractId);
}

/**
 * 一个 profile 真正投影出去的说明书。
 *
 * 两条过滤，都来自声明：`spec.profiles` 与付费边界。付费那一条特意写在这里而不是散在
 * 调用点——「模型面够不着花钱的工具」是一条不变量，不是每个调用点各自的礼貌。
 */
export function modelFacingToolSpecs(profile: ToolProfile): readonly ModelFacingToolSpec[] {
  return Object.freeze(MODEL_FACING_TOOL_SPECS.filter((spec) => {
    if (!projectsToProfile(spec, profile)) return false;
    if (profile !== "internal") return true;
    const contract = contractById(spec.contractId);
    return contract ? projectsToInternalProfile(contract) : false;
  }));
}

/** 有模型可见描述符、且对外投影的能力（按契约注册顺序）。 */
export function mcpProjectedCapabilities(): readonly AnyCapabilityContract[] {
  const projected = new Set(modelFacingToolSpecs("mcp").map((spec) => spec.contractId));
  return Object.freeze(CAPABILITY_CONTRACTS.filter((contract) => projected.has(contract.id)));
}

/**
 * 对外 MCP profile：一契约一工具，名字与描述取自契约自己声明的 `aliases.mcp` /
 * `projections.mcp`，schema 由 `projectMcpTool` 从同一批说明书机械合并。
 */
export function mcpProfileTools(): readonly McpProfileTool[] {
  const specs = modelFacingToolSpecs("mcp");
  return Object.freeze(mcpProjectedCapabilities().map((contract) =>
    projectMcpTool(contract, specs.filter((spec) => spec.contractId === contract.id))));
}

export function mcpProfileToolFor(contractId: string): McpProfileTool | undefined {
  return mcpProfileTools().find((tool) => tool.contractId === contractId);
}
