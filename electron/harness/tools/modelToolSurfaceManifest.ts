import { z } from "zod";
import type { ZodTypeAny } from "zod";
import { generationPlanInputSchema, generationStatusInputSchema } from "../../shared/agentCapabilities/generationPlanSchemas";
import { timelineEditPlanSchema } from "../../shared/agentCapabilities/timelineRead";
import { canvasReadSemanticInputSchema, canvasReadResultSchema } from "../../shared/agentCapabilities/canvasRead";
import { canvasWriteSemanticInputSchema, canvasWriteResultSchema } from "../../shared/agentCapabilities/canvasWrite";
import { canvasDeleteSemanticInputSchema, canvasDeleteResultSchema } from "../../shared/agentCapabilities/canvasDelete";
import { documentReadSemanticInputSchema, documentReadResultSchema } from "../../shared/agentCapabilities/documentRead";
import { documentWriteSemanticInputSchema, documentWriteResultSchema } from "../../shared/agentCapabilities/documentWrite";
import { hostOnlyTransitions, type HostOnlyTransition } from "../../shared/agentCapabilities/paidBoundary";

export type SemanticToolDescriptor = Readonly<{
  name: `nomi_${string}`;
  version: number;
  intent: string;
  capabilityRefs: readonly string[];
  inputSchema: ZodTypeAny;
  outputSchema: ZodTypeAny;
  sideEffect: "none" | "proposal" | "external";
  execution: "parallel" | "sequential";
  risk: "read" | "project_write" | "paid_external";
  disclosure: "eager" | "deferred";
  availability: Readonly<{ phases: readonly string[]; requiredScopes: readonly string[] }>;
}>;

const descriptorDefaults = {
  version: 1,
  sideEffect: "proposal" as const,
  execution: "sequential" as const,
  disclosure: "eager" as const,
  availability: { phases: ["generation"], requiredScopes: ["project:bound"] },
};

const generationDescriptors = [
  {
    ...descriptorDefaults,
    name: "nomi_generation_plan" as const,
    intent: "Form and revise one editable generation plan, then preview its proposed execution.",
    capabilityRefs: ["generation.context.read", "generation.plan"],
    inputSchema: generationPlanInputSchema,
    outputSchema: z.unknown(),
    risk: "project_write" as const,
  },
  {
    ...descriptorDefaults,
    name: "nomi_generation_status" as const,
    intent: "Read or reconcile the state and artifacts of one generation operation, or request a controlled cancellation.",
    capabilityRefs: ["generation.run.read", "generation.control"],
    inputSchema: generationStatusInputSchema,
    outputSchema: z.unknown(),
    risk: "read" as const,
  },
] as const satisfies readonly SemanticToolDescriptor[];

const editingDescriptors = [
  {
    version: 1,
    name: "nomi_timeline_read" as const,
    intent: "Read the current timeline or a bounded frame range without changing the project.",
    capabilityRefs: ["timeline.read"],
    inputSchema: z.discriminatedUnion("operation", [
      z.object({ operation: z.literal("read") }).strict(),
      z.object({ operation: z.literal("range"), startFrame: z.number().int().nonnegative(), endFrame: z.number().int().positive() }).strict(),
    ]),
    outputSchema: z.unknown(),
    sideEffect: "none" as const,
    execution: "parallel" as const,
    risk: "read" as const,
    disclosure: "eager" as const,
    availability: { phases: ["editing"], requiredScopes: ["timeline:read"] },
  },
  {
    version: 1,
    name: "nomi_timeline_edit" as const,
    intent: "Preview, apply, or undo one revision-guarded timeline edit plan through Host approval.",
    capabilityRefs: ["timeline.read", "timeline.write"],
    inputSchema: z.discriminatedUnion("operation", [
      z.object({ operation: z.literal("preview"), plan: timelineEditPlanSchema }).strict(),
      z.object({ operation: z.literal("apply"), plan: timelineEditPlanSchema }).strict(),
      z.object({ operation: z.literal("undo"), undoToken: z.string().trim().min(1), expectedRevision: z.string().trim().min(1), reason: z.string().trim().max(300).optional() }).strict(),
    ]),
    outputSchema: z.unknown(),
    sideEffect: "proposal" as const,
    execution: "sequential" as const,
    risk: "project_write" as const,
    disclosure: "eager" as const,
    availability: { phases: ["editing"], requiredScopes: ["timeline:read", "timeline:write"] },
  },
  {
    version: 1,
    name: "nomi_export_job" as const,
    intent: "Inspect or verify an export job receipt; starting and cancelling exports remain Host-only.",
    capabilityRefs: ["export.read", "export.write"],
    inputSchema: z.object({ operation: z.enum(["status", "verify"]), jobId: z.string().trim().min(1) }).strict(),
    outputSchema: z.unknown(),
    sideEffect: "none" as const,
    execution: "parallel" as const,
    risk: "read" as const,
    disclosure: "eager" as const,
    availability: { phases: ["editing"], requiredScopes: ["export:read"] },
  },
  {
    version: 1,
    name: "nomi_media_query" as const,
    intent: "Query project media, technical metadata, source usage, or waveform data without changing the project.",
    capabilityRefs: ["asset.read"],
    inputSchema: z.object({ operation: z.enum(["list", "get", "inspect", "search", "source_range", "waveform"]), assetId: z.string().trim().min(1).optional(), query: z.string().max(200).optional(), kinds: z.array(z.enum(["image", "video", "audio"])).max(3).optional(), limit: z.number().int().min(1).max(100).optional() }).strict(),
    outputSchema: z.unknown(),
    sideEffect: "none" as const,
    execution: "parallel" as const,
    risk: "read" as const,
    disclosure: "deferred" as const,
    availability: { phases: ["editing"], requiredScopes: ["asset:read"] },
  },
] as const satisfies readonly SemanticToolDescriptor[];

const canvasDescriptors = [
  {
    version: 1, name: "nomi_canvas_read" as const,
    intent: "Read the current generation canvas as bounded, safe nodes and reference edges.",
    capabilityRefs: ["canvas.read"], inputSchema: canvasReadSemanticInputSchema, outputSchema: canvasReadResultSchema,
    sideEffect: "none" as const, execution: "parallel" as const, risk: "read" as const, disclosure: "eager" as const,
    availability: { phases: ["canvas", "storyboard"], requiredScopes: ["canvas:read"] },
  },
  {
    version: 1, name: "nomi_canvas_plan" as const,
    intent: "Propose storyboard, staging, camera, or timeline landing intent for review before changing the canvas.",
    capabilityRefs: ["canvas.write"], inputSchema: canvasWriteSemanticInputSchema, outputSchema: canvasWriteResultSchema,
    sideEffect: "proposal" as const, execution: "sequential" as const, risk: "project_write" as const, disclosure: "eager" as const,
    availability: { phases: ["canvas", "storyboard"], requiredScopes: ["canvas:write"] },
  },
  {
    version: 1, name: "nomi_canvas_edit" as const,
    intent: "Propose a validated reversible edit to canvas nodes or reference edges.",
    capabilityRefs: ["canvas.write"], inputSchema: canvasWriteSemanticInputSchema, outputSchema: canvasWriteResultSchema,
    sideEffect: "proposal" as const, execution: "sequential" as const, risk: "project_write" as const, disclosure: "eager" as const,
    availability: { phases: ["canvas"], requiredScopes: ["canvas:write"] },
  },
  {
    version: 1, name: "nomi_canvas_maintenance" as const,
    intent: "Request confirmed destructive canvas maintenance with an explicit recovery receipt.",
    capabilityRefs: ["canvas.delete"], inputSchema: canvasDeleteSemanticInputSchema, outputSchema: canvasDeleteResultSchema,
    sideEffect: "proposal" as const, execution: "sequential" as const, risk: "project_write" as const, disclosure: "eager" as const,
    availability: { phases: ["canvas"], requiredScopes: ["canvas:write"] },
  },
] as const satisfies readonly SemanticToolDescriptor[];

const documentDescriptors = [
  {
    version: 1, name: "nomi_document_read" as const,
    intent: "Read the current creation document or its selected text as plain text.",
    capabilityRefs: ["document.read"], inputSchema: documentReadSemanticInputSchema, outputSchema: documentReadResultSchema,
    sideEffect: "none" as const, execution: "parallel" as const, risk: "read" as const, disclosure: "eager" as const,
    availability: { phases: ["creation", "storyboard"], requiredScopes: ["document:read"] },
  },
  {
    version: 1, name: "nomi_document_edit" as const,
    intent: "Propose an insert, selection replacement, or append to the creation document.",
    capabilityRefs: ["document.write"], inputSchema: documentWriteSemanticInputSchema, outputSchema: documentWriteResultSchema,
    sideEffect: "proposal" as const, execution: "sequential" as const, risk: "project_write" as const, disclosure: "eager" as const,
    availability: { phases: ["creation"], requiredScopes: ["document:write"] },
  },
] as const satisfies readonly SemanticToolDescriptor[];

/**
 * Host/UI transitions are wire contracts, never model-authored tools.
 *
 * 阶段 5a：名单**派生**自付费边界（`paidBoundary.ts`），不再手写。语义逐字保留——
 * 这三行原来说的是同一件事：花用户在供应商那里的钱这件事永远不由模型发起，宿主搭确认卡，
 * 只有经核验的 Host/UI 收据能结清它。变的只是来源：以前加第二个付费能力时要有人**记得**
 * 来这里补一行，漏掉不会报错；现在契约上写下 `effect:"paid"` 的那一刻这里就多一行。
 */
export const GENERATION_HOST_ONLY_TRANSITIONS: readonly HostOnlyTransition[] = hostOnlyTransitions();

export const modelToolSurfaceManifest = Object.freeze({
  version: "m2-canvas-document-v1",
  generation: Object.freeze(generationDescriptors),
  editing: Object.freeze(editingDescriptors),
  canvas: Object.freeze(canvasDescriptors),
  document: Object.freeze(documentDescriptors),
});

const modelSurface = [...modelToolSurfaceManifest.generation, ...modelToolSurfaceManifest.editing, ...modelToolSurfaceManifest.canvas, ...modelToolSurfaceManifest.document];
const modelNames = new Set<string>(modelSurface.map(({ name }) => name));
if (modelNames.size !== modelSurface.length) throw new Error("Duplicate semantic model tool");
for (const transition of GENERATION_HOST_ONLY_TRANSITIONS) {
  if (modelNames.has(transition.name)) throw new Error(`Host-only transition leaked into model surface: ${transition.name}`);
}
