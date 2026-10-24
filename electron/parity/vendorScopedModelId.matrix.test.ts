/**
 * 型号名按供应商作用域解析（用户 2026-10-23：通用修复，不许针对某个型号或某家供应商打补丁）。
 *
 * 共享档案上写着某一家的型号名（`catalogModelKey`、`variants[].modelKey` / `identifierPatterns`、`modes[].modelEnum`）。
 * 以前宿主归一、画布发出、变体条把它们当成所有供应商的名字用（R-runway-wan3：Runway 的 `wan3` 被改写成 KIE 的
 * `wan/3-0-video`；Runway 的 `seedance2_fast` 发成 `bytedance/seedance-2`；APIMart `kling-v3` 的发出型号是 KIE 的
 * `kling-3.0/video`……）。型号名的家是供应商的映射（electron/catalog/modelNameSource.ts）。
 *
 * 这里不挑模型、不点名供应商：遍历**真实内置目录里全部供应商 × 全部带档案的目录行 × 档案每个方式 × 每个变体**，
 * 逐格核「这一格出去的每个型号名都在这家的作用域里」：
 *   · 宿主归一（Agent 起草 / 补丁 / 多镜封印 / 预览共用的 normalizeVideoCandidate）：providerId 不变，modelId 是这家目录里的一行；
 *     Agent 路的合同照样编得出来（不再报 Unknown model），宿主交给供应商的请求体里的 model（引擎 B 同一个投影 + 同一个 provider）
 *     在这家作用域里；
 *   · 画布发出（buildCatalogTaskRequest → 主进程按同一个选法挑映射 → templateContext 的 request.params.model，即线上模型名
 *     owner 的输出）：在这家作用域里；
 *   · 档案解析（resolveArchetypeForModel / buildVideoModelCandidates）：不接受档案型号名的行，解析出来的档案上一个型号名都没有。
 * 「这家的作用域」= 这家目录行自己的 key / 别名 ∪（这家映射声明接受档案型号名的那些行所用档案的型号名）。
 * 新加供应商 / 档案 / 目录行自动进格子。
 */
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("electron", async () => {
  const nodeFs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { electronStub } = await import("./parityElectronMock");
  return electronStub(nodeFs.mkdtempSync(path.join(os.tmpdir(), "nomi-vendor-scope-")));
});

vi.mock("../capabilityCore/rendererBridge", () => ({
  requestRendererDecision: async () => ({ confirmed: true }),
  requestRenderer: async (operation: string) => { throw new Error(`付费路径不该走带超时的桥: ${operation}`); },
}));

import type { CatalogState } from "../catalog/types";
import type { PlanCandidate } from "../capabilityCore/executionContract";
import { deriveModelNameSource } from "../catalog/modelNameSource";
import { getArchetypeById, resolveArchetypeForModel, type ModelArchetype } from "../shared/modelArchetypes";
import { buildVideoModelCandidates, videoArchetypeIdFromMeta } from "../shared/videoCapabilities";
import { selectTaskMapping } from "../catalog/types";
import { templateContext } from "../catalog/profileHttpRequest";
import type { TaskRequest } from "../runtime";
import { modeTransportFor } from "../shared/videoCapabilities/modeTransport";
import { toCatalogModelOptions } from "../../src/config/modelOptionMappers";
import { buildAgentModelEntries } from "../../src/workbench/generationCanvas/agent/availableModels";
import { buildModelEntryIndex, buildPlannedNodeMeta } from "../../src/workbench/generationCanvas/agent/plannedNodeMeta";
import { createGenerationNode } from "../../src/workbench/generationCanvas/model/graphOps";
import { buildCatalogTaskRequest } from "../../src/workbench/generationCanvas/runner/catalogTaskActions";
import { resolveGenerationReferences } from "../../src/workbench/generationCanvas/runner/generationReferenceResolver";
import type { GenerationCanvasNode } from "../../src/workbench/generationCanvas/model/generationCanvasTypes";
import { installFetchCapture, seedParityCatalog, type FetchCapture } from "./generationParityTestUtils";

const capture: FetchCapture = installFetchCapture();
const store = await import("../catalog/catalogStore");
store.ensureBuiltinModelSeeds();
// 全部内置供应商都存一把（假）钥匙：宿主只把「可用」的行算进视频候选表，这里要每一行都在格子里。
for (const vendor of store.readCatalog().vendors) {
  try { store.upsertModelCatalogVendorApiKey(vendor.key, { apiKey: `sk-parity-${vendor.key}` }); } catch { /* 不收钥匙的（本机 / 账号型）供应商照常列在目录里 */ }
}
const catalog: CatalogState = await seedParityCatalog([]);
afterAll(() => capture.restore());

type Row = CatalogState["models"][number];
const lower = (value: string) => value.trim().toLowerCase();

/** 档案上写着的全部型号名（不收窄的原样档案）。 */
function archetypeModelNames(archetype: ModelArchetype | null): string[] {
  if (!archetype) return [];
  return [
    archetype.catalogModelKey ?? "",
    ...(archetype.variants ?? []).flatMap((variant) => [variant.modelKey, ...(variant.identifierPatterns ?? [])]),
    ...archetype.modes.map((mode) => mode.modelEnum ?? ""),
  ].filter(Boolean).map(lower);
}

const unscopedArchetypeOf = (row: Row) => {
  const id = videoArchetypeIdFromMeta(row.meta);
  return (id ? getArchetypeById(id) : null) ?? resolveArchetypeForModel({ modelKey: row.modelKey, modelAlias: row.modelAlias, vendorKey: row.vendorKey, meta: row.meta, modelNameSource: "archetype" });
};
const sourceOf = (row: Row) => deriveModelNameSource(row, catalog.mappings);

/** 这家的作用域：这家目录行自己的 key / 别名 ∪ 这家接受档案型号名的行所用档案的型号名。 */
const scopeByVendor = new Map<string, Set<string>>();
for (const row of catalog.models) {
  const scope = scopeByVendor.get(row.vendorKey) ?? new Set<string>();
  scope.add(lower(row.modelKey));
  if (row.modelAlias) scope.add(lower(row.modelAlias));
  if (sourceOf(row) === "archetype") for (const name of archetypeModelNames(unscopedArchetypeOf(row))) scope.add(name);
  scopeByVendor.set(row.vendorKey, scope);
}
/** 全部「型号名」：全部目录行的 key ∪ 全部档案上写着的型号名。不在这家作用域里的就是别家的。 */
const allModelNames = new Set<string>([
  ...catalog.models.flatMap((row) => [row.modelKey, row.modelAlias ?? ""]).filter(Boolean).map(lower),
  ...catalog.models.flatMap((row) => archetypeModelNames(unscopedArchetypeOf(row))),
]);
function foreignNames(vendorKey: string, values: unknown[]): string[] {
  const scope = scopeByVendor.get(vendorKey) ?? new Set<string>();
  return values.filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .filter((value) => allModelNames.has(lower(value)) && !scope.has(lower(value)));
}

/** 带档案、而且档案上写着型号名的目录行（没有型号名的档案不存在「换成别家」的问题）。 */
const rows: Row[] = catalog.models.filter((row) => archetypeModelNames(unscopedArchetypeOf(row)).length > 0);
const videoRows = rows.filter((row) => row.kind === "video");
const options = toCatalogModelOptions(catalog.models.map((row) => ({
  modelKey: row.modelKey, modelAlias: row.modelAlias, vendorKey: row.vendorKey, kind: row.kind, labelZh: row.labelZh, meta: row.meta,
  modelNameSource: sourceOf(row),
})) as Parameters<typeof toCatalogModelOptions>[0]);
const entryByKey = buildModelEntryIndex(buildAgentModelEntries(options), []);
/** 真核到线上 model 串的格子数（最后一格用它防「全部格子都跳过」的空转）。 */
let hostWireCellsChecked = 0;
let canvasWireCellsChecked = 0;

describe("目录前提（否则下面的格子是空转）", () => {
  it("同一个共享档案被至少一家「不接受档案型号名」的供应商用着（这一类真实存在）", () => {
    const shared = rows.filter((row) => sourceOf(row) === "row");
    expect(shared.length).toBeGreaterThan(0);
    expect(new Set(rows.map((row) => row.vendorKey)).size).toBeGreaterThan(1);
  });
});

describe("档案解析：不接受档案型号名的行，解析出来的档案上没有任何型号名（两个解析口同一个收窄）", () => {
  for (const row of rows) {
    it(`${row.vendorKey}/${row.modelKey}（${sourceOf(row)}）`, () => {
      const viaResolver = resolveArchetypeForModel({ modelKey: row.modelKey, modelAlias: row.modelAlias, vendorKey: row.vendorKey, meta: row.meta });
      const viaCandidates = row.kind === "video"
        ? buildVideoModelCandidates([{ provider: row.vendorKey, modelKey: row.modelKey, label: row.labelZh, archetypeId: videoArchetypeIdFromMeta(row.meta) }])[0]?.archetype ?? null
        : null;
      for (const archetype of [viaResolver, viaCandidates]) {
        if (!archetype) continue;
        expect(foreignNames(row.vendorKey, archetypeModelNames(archetype)), "档案上留着别家的型号名").toEqual([]);
        if (sourceOf(row) === "row") expect(archetypeModelNames(archetype), "这一行不接受档案型号名").toEqual([]);
      }
    });
  }
});

describe("宿主归一：身份留在这家目录里，发出型号在这家作用域里，合同编得出来", async () => {
  const { normalizeVideoCandidate } = await import("../capabilityCore/mcpGenerationVideoResolve");
  const { deriveUsableVideoModelCandidates } = await import("../capabilityCore/usableVideoModelCandidates");
  const { compileExecutionContract } = await import("../capabilityCore/executionContract");
  const { createCatalogModuleRegistry } = await import("../capabilityCore/moduleCatalogBootstrap");
  const { createGenerationProviderBootstrap } = await import("../capabilityCore/generationProviderBootstrap");
  const { createGenerationRuntimeAdapter } = await import("../capabilityCore/generationRuntimeAdapter");
  const usable = deriveUsableVideoModelCandidates();
  const registry = createCatalogModuleRegistry(store.readCatalog());
  // 宿主真正交给供应商的请求体：运行时适配器的 prepareAuthorization（合同 → provider 输入的投影与生产同一个）。
  const bootstrap = createGenerationProviderBootstrap(store.readCatalog(), { catalogReader: () => store.readCatalog() });
  const adapter = createGenerationRuntimeAdapter({ providers: bootstrap.providers });
  const hostHasProvider = (vendorKey: string) => bootstrap.providers.some((provider) => provider.providerId === vendorKey);
  const vendorRows = (vendorKey: string) => new Set(catalog.models.filter((row) => row.vendorKey === vendorKey).map((row) => lower(row.modelKey)));
  for (const row of videoRows) {
    const source = usable.find((candidate) => candidate.provider === row.vendorKey && candidate.modelKey === row.modelKey);
    if (!source) continue;
    const variants: Array<string | undefined> = [undefined, ...(source.archetype.variants ?? []).map((variant) => variant.id)];
    for (const mode of source.archetype.modes) {
      for (const variantId of variants) {
        it(`${row.vendorKey}/${row.modelKey} 方式=${mode.id} 变体=${variantId ?? "（不写）"}`, () => {
          const candidate = normalizeVideoCandidate({
            candidateId: "c", revision: 1, moduleId: "generation.single-shot", providerId: row.vendorKey, modelId: row.modelKey,
            mode: modeTransportFor(mode, source.archetype, source.provider) ?? "text_to_video", modeId: mode.id,
            ...(variantId ? { variantId } : {}), prompt: "a red kite", parameters: {}, references: [],
          } as PlanCandidate, usable);
          expect(candidate.providerId).toBe(row.vendorKey);
          expect(vendorRows(row.vendorKey).has(lower(candidate.modelId)), `modelId ${candidate.modelId} 是这家目录里的一行`).toBe(true);
          // Agent 路的合同：不再因为身份被改写成别家的 key 报 Unknown model（参考类方式缺参考图的拒绝不算这一类）。
          let hostWireModel: unknown;
          try {
            const contract = compileExecutionContract(candidate, registry, {});
            if (hostHasProvider(row.vendorKey)) {
              const { providerRequest } = adapter.prepareAuthorization({ contract, providerIdempotencyKey: "vendor-scope-matrix" });
              hostWireModel = (providerRequest as Record<string, unknown>).model;
              if (typeof hostWireModel === "string") hostWireCellsChecked += 1;
            }
          } catch (error) {
            expect(String((error as Error)?.message ?? error)).not.toMatch(/Unknown model/i);
          }
          expect(foreignNames(row.vendorKey, [candidate.modelId, hostWireModel]), "别家的型号名").toEqual([]);
        });
      }
    }
  }
});

describe("画布发出：request.params.model（线上模型名 owner 的输出）在这家作用域里", () => {
  for (const row of rows) {
    const archetype = resolveArchetypeForModel({ modelKey: row.modelKey, modelAlias: row.modelAlias, vendorKey: row.vendorKey, meta: row.meta });
    if (!archetype) continue;
    const variants: Array<string | undefined> = [undefined, ...(archetype.variants ?? []).map((variant) => variant.id)];
    for (const mode of archetype.modes) {
      for (const variantId of variants) {
        it(`${row.vendorKey}/${row.modelKey} 方式=${mode.id} 变体=${variantId ?? "（不写）"}`, () => {
          const meta = buildPlannedNodeMeta({ modelKey: row.modelKey, vendor: row.vendorKey, modeId: mode.id, ...(variantId ? { variantId } : {}), params: {} }, entryByKey);
          expect(meta, "落地 meta 造得出来").toBeTruthy();
          const kind = row.kind === "image" ? "image" : row.kind === "audio" ? "audio" : "video";
          const node = { ...createGenerationNode({ id: "n", kind, prompt: "a red kite" }), meta } as GenerationCanvasNode;
          let request: TaskRequest;
          try {
            request = buildCatalogTaskRequest(node, { references: resolveGenerationReferences(node, { nodes: [node], edges: [] }) }).request as unknown as TaskRequest;
          } catch { return; /* 这一格缺必需输入（参考图 / 提示词形状），不是这一类 */ }
          const extras = (request.extras ?? {}) as Record<string, unknown>;
          // 与 runtime.runTask 同一个选法（模型 key + 档案方式），渲染层只交身份与选择，型号名由主进程 owner 写进 params.model。
          const selection = extras.archetype as { modeId?: unknown } | undefined;
          const mapping = selectTaskMapping(store.readCatalog().mappings, row.vendorKey, request.kind as never, row.modelKey,
            typeof selection?.modeId === "string" ? selection.modeId : undefined);
          const params = (templateContext(request, row, "sk-matrix", {}, mapping?.create).request as { params: Record<string, unknown> }).params;
          if (typeof params.model === "string") canvasWireCellsChecked += 1;
          expect(foreignNames(row.vendorKey, [params.model, extras.model, extras.modelKey]), "别家的型号名").toEqual([]);
        });
      }
    }
  }
});

describe("出站型号真的核过（不是空转）", () => {
  it("宿主路与画布路都有格子核到了线上 model 串", () => {
    expect(hostWireCellsChecked, "宿主路一个出站 model 都没核到：引擎 B 那条没走到供应商请求体").toBeGreaterThan(0);
    expect(canvasWireCellsChecked, "画布路一个出站 model 都没核到").toBeGreaterThan(0);
  });
});
