// 「这家这一行发出去的型号名，是不是由档案提供」——按供应商映射算，唯一的计算处（用户 2026-10-23 拍板方案 A）。
//
// 型号名的家是供应商的映射：请求体（或命令行参数、URL、自定义脚本）模板里读 `request.params.model` = 这家声明
// 「型号名由档案的当前变体 / 当前方式提供」（APIMart 的变体模型、KIE 拆 id 的图片模型、Dreamina……）；
// 写死型号或读 `{{model.modelKey}}` = 型号名就是这家目录里这一行自己的 key（Runway 的 `wan3`……）。
// 映射怎么选与发送时完全一样（selectTaskMapping：同一任务种类下精确绑定这一行的映射优先，没有才用这家的通用模板），
// 所以这里说「接受」的行，发送时真会把档案型号名发出去；说「不接受」的行，档案型号名一个字都进不了请求。
// 不写任何供应商名、型号名；用户自建中转按它自己的映射自动对上。结果随目录读出给渲染层（listModelCatalogModels），
// 并装成本进程的查询口（catalogStore），两侧的档案解析（resolveArchetypeForModel / buildVideoModelCandidates）只认这个结果。
import type { ModelNameSource } from "../shared/modelArchetypes/modelNameSource";
import { selectTaskMapping, type Mapping } from "./types";

const ARCHETYPE_MODEL_REF = "request.params.model";

function operationReadsArchetypeModel(mapping: Mapping): boolean {
  return JSON.stringify(mapping.create ?? {}).includes(ARCHETYPE_MODEL_REF);
}

export function deriveModelNameSource(model: { vendorKey: string; modelKey: string }, mappings: readonly Mapping[]): ModelNameSource {
  const vendorMappings = mappings.filter((mapping) => mapping.enabled && mapping.vendorKey === model.vendorKey);
  const taskKinds = [...new Set(vendorMappings.map((mapping) => mapping.taskKind))];
  for (const taskKind of taskKinds) {
    // 与发送同一个选法；按方式区分的映射逐个看（selectTaskMapping 只回一条，这里把这一桶里选得中的全看一遍）。
    const modeIds = [...new Set(vendorMappings.filter((mapping) => mapping.taskKind === taskKind).map((mapping) => (mapping.modeId ?? "").trim()))];
    for (const modeId of modeIds) {
      const selected = selectTaskMapping(vendorMappings as Mapping[], model.vendorKey, taskKind, model.modelKey, modeId || undefined);
      if (selected && operationReadsArchetypeModel(selected)) return "archetype";
    }
  }
  return "row";
}

/** 表的键：一行的（供应商, 目录 key）。 */
export function modelNameSourceKey(vendorKey: string, modelKey: string): string {
  return JSON.stringify([vendorKey, modelKey]);
}

/** 整份目录的「（供应商, 目录 key）→ 来源」表（目录状态不变就不重算）。 */
export function modelNameSourceTable(state: { models: readonly { vendorKey: string; modelKey: string; modelAlias?: string | null }[]; mappings: readonly Mapping[] }): ReadonlyMap<string, ModelNameSource> {
  const table = new Map<string, ModelNameSource>();
  for (const model of state.models) {
    const source = deriveModelNameSource(model, state.mappings);
    table.set(modelNameSourceKey(model.vendorKey, model.modelKey), source);
    const alias = typeof model.modelAlias === "string" ? model.modelAlias.trim() : "";
    if (alias && !table.has(modelNameSourceKey(model.vendorKey, alias))) table.set(modelNameSourceKey(model.vendorKey, alias), source);
  }
  return table;
}
