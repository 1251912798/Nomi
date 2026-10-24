// 「发给供应商的型号名从哪来」——按供应商作用域解析，唯一一处。
//
// 共享档案（Seedance 2 / Wan 3.0 / Veo 3.1 / Kling 3.0 / HappyHorse……）描述「这个模型长什么样」：方式、参考槽、参数。
// 但档案上还写着一些**型号名**——`catalogModelKey`、`variants[].modelKey`、`modes[].modelEnum`——它们是**某一家**供应商的
// 名字（KIE 的 `wan/3-0-video`、APIMart 的 `doubao-seedance-2.0-fast`……）。以前这些名字被当成所有供应商的名字用：
// Runway 的 `wan3` 行被宿主改写成 `wan/3-0-video`、Runway 的 `seedance2` 行出 KIE 的三个变体、APIMart `kling-v3` 的
// 发出型号写成 KIE 的 `kling-3.0/video`（2026-10-22 R-runway-wan3 / landingProjectionParity 实测）。
//
// 型号名的家是**供应商的映射**：这一行要用的 create op 声明了 `wireModel: "archetype-selection"`（只有内置目录契约的 op 有）
// = 这家声明「型号名由档案提供」；没有声明（写死 `model: "wan3"`、读 `{{model.modelKey}}`、用户自建中转）= 型号名就是
// 这一行连接自己的名字。与发送时决定 model 串的 owner（wireModelIdentity.resolveWireModel）是同一个谓词，这个判断只在
// 主进程目录层算一次（electron/catalog/modelNameSource.ts 的 deriveModelNameSource），随目录读出带给渲染层；这里只认结果：
//   · 'archetype'：这一行接受档案的型号名——档案原样（变体轴、方式型号名、基础行都在）；
//   · 'row'：这一行不接受——档案只给参数，变体轴、方式型号名、基础行全部去掉，发出的型号名就是这一行自己的 key。
// 不写任何供应商名、任何型号名（用户 2026-10-23 拍板方案 A；2026-10-24 拍板判据合一到 op 声明）。
import type { ModelArchetype } from "./types";

export type ModelNameSource = "archetype" | "row";

/** 「这家这一行接不接受档案的型号名」的查询口（主进程按目录、渲染层按模型目录缓存各装一个；都只转述目录层算好的结果）。 */
export type ModelNameSourceLookup = (vendorKey: string, modelKey: string) => ModelNameSource | undefined;

/**
 * 本进程装上的查询口。生产里每个进程只有一个（主进程 = 目录，渲染层 = 模型目录缓存）；同一个测试进程里两个都可能装上，
 * 按装的顺序问、第一个说得清的算（两个转述的是同一个目录层结果，不会互相矛盾）。
 */
const installedLookups: ModelNameSourceLookup[] = [];

/** 装上本进程的查询口（目录层模块加载时装）。返回卸载函数（测试用）。 */
export function installModelNameSourceLookup(lookup: ModelNameSourceLookup): () => void {
  if (!installedLookups.includes(lookup)) installedLookups.push(lookup);
  return () => {
    const index = installedLookups.indexOf(lookup);
    if (index >= 0) installedLookups.splice(index, 1);
  };
}

export function isModelNameSource(value: unknown): value is ModelNameSource {
  return value === "archetype" || value === "row";
}

/**
 * 这一行的型号名来源：调用方显式给的优先，否则问本进程的查询口（按目录行身份 vendor + modelKey / 别名）。
 * 都说不清（没有供应商身份、目录还没载入）→ undefined：档案原样，与改前一致——不猜。
 */
export function modelNameSourceFor(model: {
  vendorKey?: string | null;
  modelKey?: string | null;
  modelAlias?: string | null;
  modelNameSource?: unknown;
}): ModelNameSource | undefined {
  if (isModelNameSource(model.modelNameSource)) return model.modelNameSource;
  const vendorKey = typeof model.vendorKey === "string" ? model.vendorKey.trim() : "";
  if (!vendorKey) return undefined;
  for (const identity of [model.modelKey, model.modelAlias]) {
    const key = typeof identity === "string" ? identity.trim() : "";
    if (!key) continue;
    for (const lookup of installedLookups) {
      const source = lookup(vendorKey, key);
      if (source) return source;
    }
  }
  return undefined;
}

/**
 * 按型号名来源收窄档案：'row' → 去掉档案上全部型号名（变体轴、默认变体、变体别名、基础行、每个方式的 modelEnum），
 * 参数 / 方式 / 参考槽原样；'archetype' 或说不清 → 原样返回。
 */
export function scopeArchetypeModelNames(archetype: ModelArchetype, source: ModelNameSource | undefined): ModelArchetype {
  if (source !== "row") return archetype;
  const carriesModelNames = Boolean(archetype.variants?.length || archetype.catalogModelKey || archetype.modes.some((mode) => mode.modelEnum));
  if (!carriesModelNames) return archetype;
  const {
    variants: _variants, defaultVariantId: _defaultVariantId, variantIdAliases: _variantIdAliases, catalogModelKey: _catalogModelKey,
    ...rest
  } = archetype;
  return {
    ...rest,
    modes: archetype.modes.map((mode) => {
      if (!mode.modelEnum) return mode;
      const { modelEnum: _modelEnum, ...modeRest } = mode;
      return modeRest;
    }),
  };
}
