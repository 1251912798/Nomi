// 能力校验（纯函数，可单测）——从 requiredProviders + stages.modelPrefs.kind
// 算出工作流元数据所描述的依赖 / 当前实例缺哪些。这些字段不参与运行时授权；
// requestedCapabilities 才能在 Host capability ceiling 内进一步收窄工具。
// 这是 Flova 式「能力清单 + 缺啥去接入」
// 的根（docs/plan/2026-06-19-skill-playbook-system.md §0.5.b/0.5.d）。
// 关键：缺能力 ≠ 报错，而是产出一张「缺什么」清单交给 UI 引导用户去接入（n8n 二分 / Dify 三态）。
import type { SkillManifest, SkillProviderKind } from "./skillManifestSchema";
import type { RuntimeToolDescriptor } from "../harness/runtime/runtimePort";
import {
  CAPABILITY_CONTRACTS,
  capabilityAliasesFor,
  capabilityOperationAliasesFor,
} from "../shared/agentCapabilities/registry";
import { modelToolSurfaceManifest } from "../harness/tools/modelToolSurfaceManifest";

export type SkillCapabilityNeeds = {
  /** 这个 skill 端到端需要的 provider 模态（去重）。 */
  providers: SkillProviderKind[];
};

/** 只派生供应商 chip 使用的模态：requiredProviders ∪ stages.modelPrefs.kind。 */
export function deriveSkillNeeds(manifest: SkillManifest): SkillCapabilityNeeds {
  const providers = new Set<SkillProviderKind>(manifest.requiredProviders);
  for (const stage of manifest.stages ?? []) {
    for (const pref of stage.modelPrefs ?? []) {
      providers.add(pref.kind);
    }
  }
  return {
    providers: [...providers],
  };
}

/** A Skill request is a shrink-only filter over tools already granted by the Host capability. */
export function restrictToolsToSkillCapabilities(
  hostTools: readonly RuntimeToolDescriptor[],
  requestedCapabilities: readonly string[] | undefined,
): RuntimeToolDescriptor[] {
  if (requestedCapabilities === undefined) return [...hostTools];
  const canonicalCapabilityIds = new Set<string>(CAPABILITY_CONTRACTS.map((contract) => contract.id));
  const allowedPiAliases = new Set<string>();
  for (const capabilityId of requestedCapabilities) {
    if (!canonicalCapabilityIds.has(capabilityId)) {
      throw new Error(`Unknown canonical Skill capability: ${capabilityId}`);
    }
    for (const alias of capabilityAliasesFor(capabilityId, "pi")) allowedPiAliases.add(alias);
    for (const alias of capabilityOperationAliasesFor(capabilityId, "pi")) allowedPiAliases.add(alias);
  }
  const semanticNamesByCapability = new Map<string, Set<string>>();
  for (const descriptor of [
    ...modelToolSurfaceManifest.canvas,
    ...modelToolSurfaceManifest.document,
    ...modelToolSurfaceManifest.generation,
  ]) {
    for (const capability of descriptor.capabilityRefs) {
      const names = semanticNamesByCapability.get(capability) ?? new Set<string>();
      names.add(descriptor.name);
      semanticNamesByCapability.set(capability, names);
    }
  }
  const allowedSemanticNames = new Set<string>(requestedCapabilities.flatMap((capability) => [
    ...(semanticNamesByCapability.get(capability) ?? []),
  ]));
  return hostTools.filter((tool) => allowedPiAliases.has(tool.name) || allowedSemanticNames.has(tool.name));
}
