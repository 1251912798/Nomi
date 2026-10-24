// 「哪一步把参考素材交给供应商」的唯一 owner。
// 执行器（runtime.executeProfileOperation）每一步都问这里：只有提交步本地化（读盘 + 上传），
// 查任务 / 取结果按任务号寻址，一张参考都不碰。
import { collectLocalAssetUrls } from "./assetLocalization";
import { describeAssetValue } from "./assetValueScheme";
import { desktopT } from "../desktopStrings";
import type { ProfileOperationStage } from "../runtime";

/**
 * 参考素材只在「提交」这一步交给供应商。
 *
 * 为什么是硬规则而不是逐个映射声明：缓存里的任务请求刻意保留原始 `nomi-local://`（指纹、溯源要用），
 * 若执行器每一步都本地化，每轮询一次就重传一遍（2026-10-22 #1279 真付费样本：首尾帧两张图各传 26 次），
 * 而且提交后参考被删 / 随项目搬走，已付费的任务就再也查不回来。
 */
export function stageSubmitsReferences(stage: ProfileOperationStage): boolean {
  return stage === "create";
}

/**
 * 查任务 / 取结果的出站请求里不许出现本地素材值（`nomi-local://` / `data:`）；通过则原样返回请求。
 *
 * 内置映射的查询步全靠任务号（`referenceFreeQueryOps.class.test.ts` 钉死）；这道闸拦的是用户自配映射
 * 把参考写进了查询步——宁可当场报错，也不把本机地址发给供应商、更不为查询重传参考。
 * 报错不带 asset-* 码：那一族的意思是「请求还没发出去」，而走到查询这一步，任务已经提交、钱已经花了。
 */
export function assertNoReferencesOutsideSubmit<T extends { url: string; query: unknown; body: unknown }>(
  stage: ProfileOperationStage,
  outbound: T,
): T {
  if (stageSubmitsReferences(stage)) return outbound;
  const leaked = Array.from(collectLocalAssetUrls([outbound.query, outbound.body]));
  if (/nomi-local(:|%3A)/i.test(outbound.url)) leaked.push(outbound.url);
  if (leaked.length === 0) return outbound;
  throw new Error(desktopT(stage === "query" ? "tasks.stepReferencesForbidden.query" : "tasks.stepReferencesForbidden.result", { asset: describeAssetValue(leaked[0]) }));
}
