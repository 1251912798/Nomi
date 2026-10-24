// 主进程发送前的参考守（契约②，见 catalog/archetypeInput 文件头）。
//
// runtime.runTask 在任何一处读 extras、碰任何网络之前先过这里：带档案投影的请求，通用参考键里有不在 archetypeInput 的
// 地址 → **拒发**（协调 10-22 定，热修 #1279 时期是「只剥不拒」）。理由：渲染层结构上已做不出这种请求
// （上传图落槽只有 placeUploadedImages 一个推导，请求组装值全取自它），出现了就是有新入口绕过了它——
// 悄悄剥掉会让「界面标的」与「用户以为发的」再次分家，拒在发出之前、说清楚，才是诚实的。
// 抛的错带机器码 reference-not-in-use：渲染层 classifyError 认码，给「没发出去、服务商没被请求到、重新点生成」的人话（中英词典）。
// 单独成文件是为了不喂 runtime.ts 这个巨壳，也让渲染层可 import 的 archetypeInput 不碰 logger。
import type { JsonRecord } from "../jsonUtils";
import { findReferenceResidue } from "../catalog/archetypeInput";
import { logDevDetail } from "../logging/logger";
import { tagNomiError } from "../shared/nomiErrorCodes";

export function assertNoReferenceResidueBeforeSend(extras: JsonRecord | undefined, label: string): JsonRecord | undefined {
  if (!extras) return extras;
  const residue = findReferenceResidue(extras);
  if (!residue.length) return extras;
  logDevDetail("tasks", `reference residue rejected before send (renderer contract broken): ${label} ${residue.join(",")}`);
  throw new Error(tagNomiError("reference-not-in-use", `Request rejected before sending: reference keys carry images that are not in use for the current mode (${label}: ${residue.join(", ")}). Nothing was sent to the provider.`));
}
