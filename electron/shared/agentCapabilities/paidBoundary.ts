// 付费边界：**只在这里表达一次**（方案 §3.1 第二行、母方案 §1.3）。
//
// ── 它在解决哪个真实摩擦 ──
//
// 花钱的那一刀今天写在三个互不认识的地方：
//   ① 注册表里 `generation.gate` 是唯一 `effect:"paid"` 的契约（`generation.ts`）；
//   ② 内部面靠 `modelToolSurfaceManifest.ts` 里一张**手写**的三行名单
//      （`GENERATION_HOST_ONLY_TRANSITIONS`）把它挡在模型看不见的地方；
//   ③ 对外 MCP 的 `nomi_operation_gate` / `nomi_operation_execute` **根本不是注册表契约**，
//      是 `mcpGenerationToolCatalog.ts` 里两份手写 JSON Schema。
//
// 三份的后果不是难看：加第二个花钱的能力时，②要有人记得加一行，③要有人记得再抄一份，
// 而**漏掉任何一处都不会报错**——只会在某个真实用户的账单上出现。所以边界收成一处：
// 契约上的 `effect:"paid"`，其余全部 derive。
//
// ── 两个面，同一处派生 ──
//
//   · **内部面「不投影」**——付费能力的别名不进 Agent lane 的工具表。模型看不见它，
//     也就不可能自己发起一次付费调用；付费只从宿主/UI 那一侧发起。
//   · **外部面「够得着但永远批不动」**——MCP 宿主看得见这两个工具（它们是宿主自己的
//     确认流程要走的门），但它们**独立于任何审批档位**永不自动放行：`destructiveHint`
//     由 `effectClass:"spend"` 派生（`mcpAnnotationsFor`），审批闸按同一张名单 fail-closed。
//
// 两句话的判据是同一个函数（`isPaidBoundaryAlias`）。一个新的付费能力只要在契约上写
// `effect:"paid"`，两个面立刻同时生效——不需要任何人记得去改第二个地方。
import { CAPABILITY_CONTRACTS, capabilityAliasesFor, capabilityOperationAliasesFor } from "./registry";
import type { CapabilityContract, CapabilityProjectionSurface } from "./capabilityContract";

type AnyCapabilityContract = CapabilityContract<unknown, unknown>;

/** 花钱的契约。**唯一判据**：契约自己声明的 `effect:"paid"`。 */
export const PAID_CAPABILITY_CONTRACTS: readonly AnyCapabilityContract[] = Object.freeze(
  CAPABILITY_CONTRACTS.filter((contract) => contract.effect === "paid"),
);

function aliasesOf(contract: AnyCapabilityContract, surface: CapabilityProjectionSurface): readonly string[] {
  return [...capabilityAliasesFor(contract.id, surface), ...capabilityOperationAliasesFor(contract.id, surface)];
}

/**
 * 付费边界上的全部别名，按 surface 分。
 *
 * 名单是**算出来的**，不是抄的：契约声明了别名，这里只是把它们收齐。
 */
export function paidBoundaryAliases(surface: CapabilityProjectionSurface): readonly string[] {
  return Object.freeze(PAID_CAPABILITY_CONTRACTS.flatMap((contract) => aliasesOf(contract, surface)));
}

const PAID_ALIASES: ReadonlySet<string> = new Set(
  PAID_CAPABILITY_CONTRACTS.flatMap((contract) =>
    (["pi", "mcp", "ui"] as const).flatMap((surface) => aliasesOf(contract, surface))),
);

/**
 * 这个工具名在付费边界上吗？
 *
 * 内部面用它决定「不投影」，外部面用它决定「永不自动放行」——**同一个问题问同一个函数**，
 * 这正是「边界只表达一次」在代码里的形状。
 */
export function isPaidBoundaryAlias(toolName: string): boolean {
  return PAID_ALIASES.has(toolName);
}

/**
 * 为什么这一个别名不能由模型自己发起 / 由策略自动放行。
 *
 * 语义与原来 `GENERATION_HOST_ONLY_TRANSITIONS` 手写的三行**逐字保留**（它们是对的），
 * 变的只是来源：名字从契约派生，理由按 surface 语义派生，两者都不再手抄。
 */
export function paidBoundaryReason(toolName: string): string | undefined {
  if (!isPaidBoundaryAlias(toolName)) return undefined;
  return "Spending the user's provider credit is never model-initiated: the Host builds the confirmation card, "
    + "and only a verified Host/UI receipt can settle it. No approval mode auto-approves this.";
}

/** 内部（Agent lane）profile 投影它吗？付费能力一律不投影——模型面根本够不着。 */
export function projectsToInternalProfile(contract: AnyCapabilityContract): boolean {
  return contract.effect !== "paid";
}

/** 宿主/UI 独占的转换。名字派生自契约，理由派生自边界，登记表不再是第二份名单。 */
export interface HostOnlyTransition {
  readonly name: string;
  readonly capabilityRefs: readonly string[];
  readonly reason: string;
}

export function hostOnlyTransitions(): readonly HostOnlyTransition[] {
  return Object.freeze(PAID_CAPABILITY_CONTRACTS.flatMap((contract) =>
    aliasesOf(contract, "pi").map((name) => Object.freeze({
      name,
      capabilityRefs: Object.freeze([contract.id]),
      reason: paidBoundaryReason(name) ?? "",
    }))));
}
