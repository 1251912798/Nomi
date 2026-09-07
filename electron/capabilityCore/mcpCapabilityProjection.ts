import { z, type ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { CapabilityContract } from "../shared/agentCapabilities/capabilityContract";
import { CANVAS_READ_CAPABILITY } from "../shared/agentCapabilities/canvasRead";
import { CANVAS_WRITE_CAPABILITY, canvasWriteSemanticInputSchema, canvasWriteResultSchema } from "../shared/agentCapabilities/canvasWrite";
import { CANVAS_DELETE_CAPABILITY, canvasDeleteSemanticInputSchema, canvasDeleteResultSchema } from "../shared/agentCapabilities/canvasDelete";
import { DOCUMENT_READ_CAPABILITY, documentReadSemanticInputSchema, documentReadResultSchema } from "../shared/agentCapabilities/documentRead";
import { DOCUMENT_WRITE_CAPABILITY, documentWriteSemanticInputSchema, documentWriteResultSchema } from "../shared/agentCapabilities/documentWrite";
import { ASSET_READ_CAPABILITY } from "../shared/agentCapabilities/assetRead";
import { EXPORT_READ_CAPABILITY } from "../shared/agentCapabilities/exportCapabilities";
import { TIMELINE_READ_CAPABILITY, timelineEditPlanSchema } from "../shared/agentCapabilities/timelineRead";
import { TIMELINE_WRITE_CAPABILITY } from "../shared/agentCapabilities/timelineWrite";
import { LAYOUT_READ_CAPABILITY, LAYOUT_WRITE_CAPABILITY, layoutReadInputSchema, layoutWriteInputSchema, layoutWriteTransportInputSchema, layoutResultSchema } from "../shared/agentCapabilities/layout";
import {
  MCP_LEASE_FIELD_NAMES,
  mcpAnnotationsFor,
  prepareMcpArguments,
  resolveMcpSpec,
  toSemanticInput,
  type McpProfileTool,
} from "../shared/agentCapabilities/modelFacingTools";
import { mcpProfileToolFor } from "../shared/agentCapabilities/modelFacingToolRegistry";
import { findUnsupportedSchemaFeatures, type SchemaLike } from "./mcpArgValidation";
import { transportSchemaFromZod } from "./mcpTransportSchemaFromZod";
import { buildCanonicalMcpToolResult, type CanonicalMcpToolResult } from "./mcpCanonicalToolResult";
import { emitMcpToolCatalogChanged } from "./mcpToolCatalogChanges";

type AnyCapabilityContract = CapabilityContract<unknown, unknown>;
const convertZodToJsonSchema = zodToJsonSchema as unknown as (
  schema: unknown,
  options: {
    $refStrategy: "none";
    target: "openApi3";
    effectStrategy: "input";
    removeAdditionalStrategy: "strict";
  },
) => unknown;

export type McpCapabilityAuthority = {
  readonly kind: "project_session";
  readonly requiredScope: string;
};

export type McpCapabilityPortBinding = {
  readonly kind: AnyCapabilityContract["execution"]["port"];
  readonly access: "read" | "write" | "paid";
};

export type McpCapabilityCall = {
  readonly semanticInput: unknown;
  readonly transport: Record<string, unknown>;
};

/**
 * Explicit adapter registration. Contracts never become MCP tools merely by appearing in the
 * shared contract registry: the transport must bind a concrete authority mode, port access,
 * wire schema, and call projection here. The resolver owns safe-result presentation and derives
 * it only from the canonical contract output schema.
 */
export type McpCapabilityAdapter = {
  readonly contract: AnyCapabilityContract;
  readonly authority: McpCapabilityAuthority;
  readonly port: McpCapabilityPortBinding;
  /**
   * `tools/list` 上真正广播出去的那份 JSON Schema。
   *
   * 阶段 5a 删掉了并列的 `semanticInputJsonSchema`：每个适配器都把它设成和这份**一模一样**的
   * 对象，除了两处测试没有任何消费者——它是一份不会被任何东西证伪的第二真相源（P1）。
   * 语义输入的形状由契约的 `inputSchema` 说了算，模型可见的那一半由共享描述符说了算。
   */
  readonly transportInputSchema: SchemaLike;
  readonly parseCall: (args: Record<string, unknown>) => McpCapabilityCall;
  /**
   * 描述符声明的容忍钩子，**在传输层校验之前**跑（`mcpProtocol.ts`）。
   *
   * 只有从共享描述符派生的适配器有它——手写适配器没有描述符可读，那正是它们还剩多少的度量。
   */
  readonly prepareArguments?: (args: unknown) => Record<string, unknown>;
  /** Composite semantic tools can return a read/approval projection rather than one legacy output union. */
  readonly outputSchema?: ZodTypeAny;
  /** A capability may have one semantic MCP intent per safe operation. */
  readonly mcpName?: string;
};

export type McpCapabilityTool = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: SchemaLike;
  readonly method: string;
  readonly build: (args: Record<string, unknown>) => Record<string, unknown>;
  /** 见 `McpCapabilityAdapter.prepareArguments`。协议层在校验参数之前调用它。 */
  readonly prepareArguments?: (args: unknown) => Record<string, unknown>;
  readonly presentResult: (result: unknown) => CanonicalMcpToolResult;
  readonly annotations?: { readonly readOnlyHint?: true; readonly destructiveHint?: true };
};

export type McpCapabilityResolver = {
  readonly list: () => readonly McpCapabilityTool[];
  readonly resolve: (alias: string) => McpCapabilityTool | undefined;
};

function jsonSchemaFromCanonicalInput(contract: AnyCapabilityContract): SchemaLike {
  const schema = JSON.parse(
    JSON.stringify(
      convertZodToJsonSchema(contract.inputSchema, {
        $refStrategy: "none",
        target: "openApi3",
        effectStrategy: "input",
        removeAdditionalStrategy: "strict",
      }),
    ),
  ) as SchemaLike;
  const unsupported = findUnsupportedSchemaFeatures(schema);
  if (unsupported.length) {
    throw new Error(`Unsupported canonical MCP input schema for ${contract.id}: ${unsupported.join("; ")}`);
  }
  return schema;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

/** Clone transport JSON before freezing so registration callers cannot mutate the resolver later. */
export function immutableSchemaSnapshot(schema: SchemaLike): SchemaLike {
  return deepFreeze(JSON.parse(JSON.stringify(schema)) as SchemaLike);
}

function isMcpExposable(adapter: McpCapabilityAdapter): boolean {
  if (!adapter.contract.aliases.mcp || !adapter.contract.projections.mcp) return false;
  if (adapter.contract.exposure === "internal_only") return false;
  // Generic self-asserted mcp_safe registrations remain hidden. The exact
  // module-owned adapter identity is the registration brand.
  return Object.isFrozen(adapter) && MCP_SAFE_ADAPTERS.has(adapter);
}

/**
 * 注解**全量派生**（方案 §3.1 第三行）。判据住 `mcpAnnotationsFor`，与内部 profile 同一处。
 *
 * 上一版是一张手写的 `MCP_READ_ONLY_ADAPTERS` 名单，只覆盖 4 个工具。手写名单的失败方向
 * 只有一个：**漏**——而漏掉 `readOnlyHint` 的后果是宿主把一次读当成可能改状态的调用，
 * 每次都去问用户；漏掉 `destructiveHint` 的后果严重得多（Codex 的硬闸靠它）。
 * MCP 规范说 hint 不可信除非来自受信服务器，所以我们只用它**抬高**摩擦，从不降低。
 */
function readOnlyAnnotations(adapter: McpCapabilityAdapter): McpCapabilityTool["annotations"] {
  return mcpAnnotationsFor(adapter.contract);
}

const leaseField = { leaseHandle: z.string().trim().min(1), projectId: z.string().trim().min(1).optional() };

// ── 从共享描述符派生一个对外适配器（方案 §3.1，阶段 5a） ──────────────────────
//
// 上一版这里的每个适配器都自己带三样东西：一份手抄的 JSON Schema、一份 zod 入参、
// 一段 `parseCall` 里的动作名映射（`"read"` → `read_timeline`）。三样都是第二份真相源，
// 而第三样是**最贵的那一份**：外部宿主读到的动作名，Nomi 自己的日志、收据、错误里
// 一个都搜不到；渲染层还得再写一遍反向映射才能把调用接回领域端口
// （`capabilityApplyHandler.ts` 曾有三处，同 commit 一起删）。
//
// 派生之后这三样都没有了：schema 由 `projectMcpTool` 从同一批说明书机械合并，
// 动作名**就是**内部别名，`parseCall` 只剩「剥租约 → 认领别名 → 契约 parse」三步。
function derivedAdapter(
  contract: AnyCapabilityContract,
  binding: Readonly<{
    authority: McpCapabilityAuthority;
    port: McpCapabilityPortBinding;
    outputSchema?: ZodTypeAny;
  }>,
): McpCapabilityAdapter {
  const tool = mcpProfileToolFor(contract.id);
  if (!tool) throw new Error(`No model-facing descriptor projects ${contract.id} to MCP`);
  const schema = immutableSchemaSnapshot(tool.inputSchema as SchemaLike);
  const unsupported = findUnsupportedSchemaFeatures(schema);
  if (unsupported.length) {
    throw new Error(`Unsupported derived MCP transport schema for ${contract.id}: ${unsupported.join("; ")}`);
  }
  return Object.freeze({
    contract,
    authority: Object.freeze(binding.authority),
    port: Object.freeze(binding.port),
    transportInputSchema: schema,
    ...(binding.outputSchema ? { outputSchema: binding.outputSchema } : {}),
    parseCall(args: Record<string, unknown>) {
      return parseDerivedCall(contract, tool, args);
    },
    prepareArguments(args: unknown) {
      return prepareMcpArguments(tool, args);
    },
  });
}

const derivedLeaseEnvelope = z.object({ ...leaseField }).passthrough();

function parseDerivedCall(
  contract: AnyCapabilityContract,
  tool: McpProfileTool,
  args: Record<string, unknown>,
): McpCapabilityCall {
  const { leaseHandle, projectId } = derivedLeaseEnvelope.parse(args);
  const spec = resolveMcpSpec(tool, args);
  if (!spec) {
    const allowed = Object.entries(tool.discriminators)
      .map(([field, values]) => `${field}: ${values.join(", ")}`)
      .join("; ");
    throw new Error(
      `${tool.name} received no recognised action${allowed ? ` (allowed — ${allowed})` : ""}. `
      + "Send one of the listed values; every other field is required by, or only meaningful to, one of them.",
    );
  }
  // 模型填的那一部分 = 入参剥掉三类**声明出来的**差异：租约、别名已经定死的判别字段、
  // 以及「外部才有」的传输寻址字段（`documentId`）。剩下的必须原样通过说明书自己的
  // strict schema——多一个字段就是模型编的，当场拒收，不静默丢掉。
  const declaredDifference = new Set([
    ...MCP_LEASE_FIELD_NAMES,
    ...Object.keys(tool.discriminators),
    ...tool.transportOnlyFields,
  ]);
  const modelArgs: Record<string, unknown> = {};
  const transportRest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (MCP_LEASE_FIELD_NAMES.includes(key)) continue;
    transportRest[key] = value;
    if (declaredDifference.has(key)) continue;
    modelArgs[key] = value;
  }
  const semanticInput = contract.inputSchema.parse(toSemanticInput(spec, spec.schema.parse(modelArgs) as Record<string, unknown>));
  return {
    semanticInput,
    transport: { leaseHandle, ...(projectId ? { projectId } : {}), ...transportRest },
  };
}

// plan 直接用 timelineEditPlanSchema（不是 `z.object({}).passthrough()` 再在 parseCall 里二次 parse）：
// 二次 parse 让 Zod 的错误路径相对于 plan（报 `planId` 而不是 `plan.planId`），宿主看不出该往哪儿填；
// 而传输层把 plan 广播成一个不透明对象，planId/baseRevision/summary/operations 四个必填在 tools/list 上
// 一个字都看不见 —— preview/apply 因此结构性不可构造（check:mcp-operation-constructible 现在会红）。
const timelineEditMcpInput = z.discriminatedUnion("operation", [
  z.object({ ...leaseField, operation: z.literal("preview"), plan: timelineEditPlanSchema }).strict(),
  z.object({ ...leaseField, operation: z.literal("apply"), plan: timelineEditPlanSchema }).strict(),
  z.object({ ...leaseField, operation: z.literal("undo"), undoToken: z.string().trim().min(1), expectedRevision: z.string().trim().min(1), reason: z.string().trim().max(300).optional() }).strict(),
]);
const exportJobMcpInput = z.object({ ...leaseField, operation: z.enum(["status", "verify"]), jobId: z.string().trim().min(1) }).strict();

// Keep the broadcast schema compact while the Zod schema above remains the
// strict execution boundary. This makes all valid operation kinds discoverable
// without repeating every branch's conditional requirements in tools/list.
const timelineEditTransportSchema = immutableSchemaSnapshot({
  type: "object",
  properties: {
    leaseHandle: { type: "string" }, projectId: { type: "string" },
    operation: { type: "string", enum: ["preview", "apply", "undo"] },
    plan: {
      type: "object", additionalProperties: false,
      properties: {
        planId: { type: "string" }, baseRevision: { type: "string" }, summary: { type: "string" },
        operations: { type: "array", minItems: 1, maxItems: 128, items: {
          type: "object", additionalProperties: false,
          properties: {
            kind: { type: "string", enum: ["move", "remove", "split", "trim", "source-window", "ripple", "transition", "text", "clip-audio"] },
            action: { type: "string", enum: ["set", "remove", "add", "edit", "style", "time"] },
            clipId: { type: "string" }, clipIds: { type: "array", items: { type: "string" } },
            fromClipId: { type: "string" }, toClipId: { type: "string" }, targetTrackId: { type: "string" }, trackId: { type: "string" },
            startFrame: { type: "integer", minimum: 0 }, endFrame: { type: "integer", minimum: 0 }, atFrame: { type: "integer", minimum: 0 }, deltaFrame: { type: "integer" },
            sourceStartFrame: { type: "integer", minimum: 0 }, sourceEndFrame: { type: "integer", minimum: 0 }, rightClipId: { type: "string", minLength: 1 },
            type: { type: "string", enum: ["cut", "dissolve", "fade", "match_cut", "whip_pan"] }, durationFrames: { type: "integer", minimum: 1 },
            id: { type: "string" }, sourceNodeId: { type: "string" }, text: { type: "string" }, style: { type: "string", enum: ["caption", "title"] },
            audio: { type: "object", additionalProperties: false, properties: { gainDb: { type: "number" }, muted: { type: "boolean" }, fadeInFrames: { type: "integer", minimum: 0 }, fadeOutFrames: { type: "integer", minimum: 0 } } },
            ripple: { type: "boolean" }, includeText: { type: "boolean" },
          },
        } },
      },
      required: ["planId", "baseRevision", "summary", "operations"],
    },
    undoToken: { type: "string" }, expectedRevision: { type: "string" }, reason: { type: "string" },
  },
  required: ["leaseHandle", "operation"], additionalProperties: false,
});
const exportJobTransportSchema = immutableSchemaSnapshot({
  type: "object", properties: { leaseHandle: { type: "string", minLength: 1 }, projectId: { type: "string", minLength: 1 }, operation: { type: "string", enum: ["status", "verify"] }, jobId: { type: "string", minLength: 1 } },
  required: ["leaseHandle", "operation", "jobId"], additionalProperties: false,
});

export const TIMELINE_READ_MCP_ADAPTER: McpCapabilityAdapter = derivedAdapter(TIMELINE_READ_CAPABILITY, {
  authority: { kind: "project_session", requiredScope: "timeline:read" },
  port: { kind: "timeline", access: "read" },
  outputSchema: z.unknown(),
});

export const TIMELINE_EDIT_MCP_ADAPTER: McpCapabilityAdapter = Object.freeze({
  contract: TIMELINE_WRITE_CAPABILITY,
  authority: Object.freeze({ kind: "project_session", requiredScope: "timeline:write" }),
  port: Object.freeze({ kind: "timeline", access: "write" }),
  transportInputSchema: timelineEditTransportSchema,
  outputSchema: z.unknown(),
  parseCall(args) {
    const input = timelineEditMcpInput.parse(args);
    const { leaseHandle, projectId, operation } = input;
    if (operation === "preview" || operation === "apply") {
      const plan = input.plan;
      return {
        semanticInput: { operation: operation === "preview" ? "propose_edit_plan" : "apply_edit_plan", ...plan },
        transport: { leaseHandle, ...(projectId ? { projectId } : {}), operation, plan },
      };
    }
    return {
      semanticInput: { operation: "undo_timeline_edit", undoToken: input.undoToken, expectedRevision: input.expectedRevision, ...(input.reason ? { reason: input.reason } : {}) },
      transport: input,
    };
  },
});

export const EXPORT_JOB_MCP_ADAPTER: McpCapabilityAdapter = Object.freeze({
  contract: EXPORT_READ_CAPABILITY,
  authority: Object.freeze({ kind: "project_session", requiredScope: "export:read" }),
  port: Object.freeze({ kind: "export", access: "read" }),
  transportInputSchema: exportJobTransportSchema,
  outputSchema: z.unknown(),
  parseCall(args) {
    const input = exportJobMcpInput.parse(args);
    return { semanticInput: { operation: input.operation === "status" ? "inspect_export_job" : "verify_render", jobId: input.jobId }, transport: input };
  },
});

export const MEDIA_QUERY_MCP_ADAPTER: McpCapabilityAdapter = derivedAdapter(ASSET_READ_CAPABILITY, {
  authority: { kind: "project_session", requiredScope: "asset:read" },
  port: { kind: "asset", access: "read" },
  outputSchema: z.unknown(),
});

const layoutReadTransportSchema = immutableSchemaSnapshot({ type: "object", properties: { leaseHandle: { type: "string", minLength: 1 }, projectId: { type: "string", minLength: 1 }, operation: { type: "string", enum: ["read"] } }, required: ["leaseHandle", "operation"], additionalProperties: false });
const layoutWriteTransportSchema = immutableSchemaSnapshot(transportSchemaFromZod(layoutWriteTransportInputSchema, {
  label: "layout.write",
  extraProperties: {
    leaseHandle: { type: "string", minLength: 1 },
    projectId: { type: "string", minLength: 1 },
  },
  required: ["leaseHandle", "operation", "layout"],
}));
export const LAYOUT_READ_MCP_ADAPTER: McpCapabilityAdapter = Object.freeze({
  contract: LAYOUT_READ_CAPABILITY, authority: Object.freeze({ kind: "project_session", requiredScope: "layout:read" }), port: Object.freeze({ kind: "document", access: "read" }), transportInputSchema: layoutReadTransportSchema, outputSchema: layoutResultSchema,
  parseCall(args) { const input = z.object({ ...leaseField, operation: z.literal("read") }).strict().parse(args); return { semanticInput: layoutReadInputSchema.parse({ operation: "read_layout" }), transport: input }; },
});
export const LAYOUT_WRITE_MCP_ADAPTER: McpCapabilityAdapter = Object.freeze({
  contract: LAYOUT_WRITE_CAPABILITY, authority: Object.freeze({ kind: "project_session", requiredScope: "layout:write" }), port: Object.freeze({ kind: "document", access: "write" }), transportInputSchema: layoutWriteTransportSchema, outputSchema: layoutResultSchema,
  parseCall(args) { const input = z.object({ ...leaseField, ...layoutWriteTransportInputSchema.shape }).strict().parse(args); const semantic = layoutWriteInputSchema.parse({ operation: "write_layout", layout: input.layout }); return { semanticInput: semantic, transport: input }; },
});

export const MCP_EDITING_METHODS = Object.freeze(new Set([
  TIMELINE_READ_CAPABILITY.id,
  TIMELINE_WRITE_CAPABILITY.id,
  DOCUMENT_WRITE_CAPABILITY.id,
  EXPORT_READ_CAPABILITY.id,
  ASSET_READ_CAPABILITY.id,
  LAYOUT_READ_CAPABILITY.id,
  LAYOUT_WRITE_CAPABILITY.id,
]));

export function isMcpEditingMethod(method: string): boolean {
  return MCP_EDITING_METHODS.has(method as typeof TIMELINE_READ_CAPABILITY.id);
}

export function createMcpCapabilityResolver(registrations: readonly McpCapabilityAdapter[]): McpCapabilityResolver {
  const tools = Object.freeze(
    registrations.filter(isMcpExposable).map((adapter): McpCapabilityTool => {
      const name = adapter.mcpName ?? adapter.contract.aliases.mcp;
      const description = adapter.contract.projections.mcp?.description;
      if (!name || !description) throw new Error(`Missing MCP projection metadata for ${adapter.contract.id}`);
      const annotations = readOnlyAnnotations(adapter);
      const inputSchema = immutableSchemaSnapshot(adapter.transportInputSchema);
      const method = adapter.contract.id;
      const parseCall = adapter.parseCall;
      const outputSchema = adapter.outputSchema ?? adapter.contract.outputSchema;
      return Object.freeze({
        name,
        description,
        inputSchema,
        method,
        build: (args) => parseCall(args).transport,
        ...(adapter.prepareArguments ? { prepareArguments: adapter.prepareArguments } : {}),
        presentResult: (result) => buildCanonicalMcpToolResult(outputSchema, result),
        ...(annotations ? { annotations } : {}),
      });
    }),
  );
  const byAlias = new Map<string, McpCapabilityTool>();
  for (const tool of tools) {
    if (byAlias.has(tool.name)) throw new Error(`Duplicate explicit MCP capability alias: ${tool.name}`);
    byAlias.set(tool.name, tool);
  }
  const resolver = Object.freeze({
    list: () => tools,
    resolve: (alias: string) => byAlias.get(alias),
  });
  emitMcpToolCatalogChanged();
  return resolver;
}

export const CANVAS_READ_MCP_ADAPTER: McpCapabilityAdapter = derivedAdapter(CANVAS_READ_CAPABILITY, {
  authority: { kind: "project_session", requiredScope: CANVAS_READ_CAPABILITY.requiredScope },
  port: { kind: "canvas", access: "read" },
});

// 画布语义写在 MCP 上**只有一个名字**：CANVAS_WRITE_CAPABILITY.aliases.mcp。
// 曾经并列的 nomi_canvas_plan 与 nomi_canvas_edit 在 tools/list 里 description / inputSchema /
// method 字节级完全相同，只有名字不同 —— 宿主没有任何依据选哪个，正是 P1 说的并行版发生在公开面上。
// 合成一个之后，operation 枚举就是全部合法动作。
//
// 阶段 5a：schema 不再从 `canvasWriteSemanticInputSchema` 单独生成，而是与 Agent lane 的三个写工具
// **同源**——外部宿主因此第一次也拿到了 typed 的分镜 / 站位 / 运镜形状（以前它读到的是契约上
// 那两个 `z.record(z.unknown())`，25 个字段名一个都没有，那正是 #547 的 0/18）。
export const CANVAS_EDIT_MCP_ADAPTER: McpCapabilityAdapter = derivedAdapter(CANVAS_WRITE_CAPABILITY, {
  authority: { kind: "project_session", requiredScope: CANVAS_WRITE_CAPABILITY.requiredScope },
  port: { kind: "canvas", access: "write" },
  outputSchema: canvasWriteResultSchema,
});

const canvasMaintenanceTransportSchema = immutableSchemaSnapshot({
  type: "object",
  properties: {
    leaseHandle: { type: "string", minLength: 1 }, projectId: { type: "string", minLength: 1 },
    operation: { type: "string", enum: ["delete_canvas_nodes", "undo_canvas_delete"] },
    nodeIds: { type: "array", maxItems: 24, items: { type: "string", minLength: 1 } },
    reason: { type: "string", maxLength: 300 }, confirmation: { type: "boolean" }, undoToken: { type: "string", minLength: 1 },
  },
  required: ["leaseHandle", "operation"], additionalProperties: false,
});
export const CANVAS_MAINTENANCE_MCP_ADAPTER: McpCapabilityAdapter = Object.freeze({
  contract: CANVAS_DELETE_CAPABILITY,
  authority: Object.freeze({ kind: "project_session", requiredScope: CANVAS_DELETE_CAPABILITY.requiredScope }),
  port: Object.freeze({ kind: "canvas", access: "write" }),
  transportInputSchema: canvasMaintenanceTransportSchema,
  outputSchema: canvasDeleteResultSchema,
  parseCall(args) {
    const input = z.object({ ...leaseField, operation: z.enum(["delete_canvas_nodes", "undo_canvas_delete"]), nodeIds: z.array(z.string().trim().min(1)).min(1).max(24).optional(), reason: z.string().trim().max(300).optional(), confirmation: z.boolean().optional(), undoToken: z.string().trim().min(1).optional() }).strict().parse(args);
    const { leaseHandle, projectId, ...transport } = input;
    const semantic = input.operation === "delete_canvas_nodes"
      ? canvasDeleteSemanticInputSchema.parse({ operation: input.operation, nodeIds: input.nodeIds, ...(input.reason ? { reason: input.reason } : {}) })
      : { operation: input.operation, undoToken: input.undoToken };
    return { semanticInput: semantic, transport: { leaseHandle, ...(projectId ? { projectId } : {}), ...transport } };
  },
});
export const DOCUMENT_READ_MCP_ADAPTER: McpCapabilityAdapter = derivedAdapter(DOCUMENT_READ_CAPABILITY, {
  authority: { kind: "project_session", requiredScope: DOCUMENT_READ_CAPABILITY.requiredScope },
  port: { kind: "document", access: "read" },
  outputSchema: documentReadResultSchema,
});
export const DOCUMENT_EDIT_MCP_ADAPTER: McpCapabilityAdapter = derivedAdapter(DOCUMENT_WRITE_CAPABILITY, {
  authority: { kind: "project_session", requiredScope: DOCUMENT_WRITE_CAPABILITY.requiredScope },
  port: { kind: "document", access: "write" },
  outputSchema: documentWriteResultSchema,
});

const MCP_SAFE_ADAPTERS = new Set<McpCapabilityAdapter>([
  CANVAS_READ_MCP_ADAPTER, CANVAS_EDIT_MCP_ADAPTER, CANVAS_MAINTENANCE_MCP_ADAPTER,
  DOCUMENT_READ_MCP_ADAPTER, DOCUMENT_EDIT_MCP_ADAPTER, TIMELINE_READ_MCP_ADAPTER, TIMELINE_EDIT_MCP_ADAPTER, EXPORT_JOB_MCP_ADAPTER, MEDIA_QUERY_MCP_ADAPTER,
  LAYOUT_READ_MCP_ADAPTER, LAYOUT_WRITE_MCP_ADAPTER,
]);

// Deliberately explicit: do not map CAPABILITY_CONTRACTS, Skills, manifests, or plugin metadata.
export const MCP_CAPABILITY_RESOLVER = createMcpCapabilityResolver([
  CANVAS_READ_MCP_ADAPTER,
  CANVAS_EDIT_MCP_ADAPTER,
  CANVAS_MAINTENANCE_MCP_ADAPTER,
  DOCUMENT_READ_MCP_ADAPTER,
  DOCUMENT_EDIT_MCP_ADAPTER,
  TIMELINE_READ_MCP_ADAPTER,
  TIMELINE_EDIT_MCP_ADAPTER,
  EXPORT_JOB_MCP_ADAPTER,
  MEDIA_QUERY_MCP_ADAPTER,
  LAYOUT_READ_MCP_ADAPTER,
  LAYOUT_WRITE_MCP_ADAPTER,
]);
