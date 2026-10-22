// 主进程发送前的参考残留守（契约②，见 catalog/archetypeInput 文件头）。
//
// runtime.runTask 在任何一处读 extras 之前先过这里：带档案投影的请求，通用参考键里不在 archetypeInput 的地址
// 剥掉（stripReferenceResidue，纯函数，渲染层也能 import 的那一份），剥了什么记一条开发态诊断（打包版空操作）。
// 剥到东西 = 渲染层 buildReferenceExtras 的契约被破了（渲染层回归、或某个新入口绕过了它），开发时在终端看得见。
// 单独成文件是为了不喂 runtime.ts 这个巨壳，也让渲染层可 import 的 archetypeInput 不碰 logger。
import type { JsonRecord } from "../jsonUtils";
import { stripReferenceResidue } from "../catalog/archetypeInput";
import { logDevDetail } from "../logging/logger";

export function stripReferenceResidueBeforeSend(extras: JsonRecord | undefined, label: string): JsonRecord | undefined {
  if (!extras) return extras;
  return stripReferenceResidue(extras, (stripped) =>
    logDevDetail("tasks", `reference residue stripped before send (renderer contract broken): ${label} ${stripped.join(",")}`));
}
