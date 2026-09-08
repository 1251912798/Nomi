import { z } from "zod";

export const GENERATION_RECONCILE_OUTCOMES = ["found", "not_found"] as const;

const reference = z.lazy(() => z.object({
  assetId: z.string().trim().min(1),
  contentHash: z.string().trim().min(1),
  version: z.number().int().min(1),
  kind: z.enum(["image", "video", "audio"]).optional(),
  role: z.enum(["character", "first_frame", "last_frame", "reference", "audio"]).optional(),
}).strict());

/** JSON values retain arbitrary nesting; the selected model catalog validates named parameters. */
type GenerationJsonValue = string | number | boolean | null | GenerationJsonValue[] | { [key: string]: GenerationJsonValue };
const generationJsonValueSchema: z.ZodType<GenerationJsonValue> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(),
  z.array(generationJsonValueSchema), z.record(generationJsonValueSchema),
]));
const parameters = z.record(generationJsonValueSchema);

/** The explicit candidate accepted by the generation domain owner. */
export const generationCandidateSchema = z.object({
  candidateId: z.string().trim().min(1), revision: z.number().int().min(1),
  moduleId: z.string().trim(), providerId: z.string().trim(), modelId: z.string().trim(),
  mode: z.string().trim(), modeId: z.string().trim().min(1).optional(),
  variantId: z.string().trim().min(1).optional(), prompt: z.string(),
  parameters: parameters.default({}), references: z.array(reference).default([]),
}).strip();

const candidatePatch = z.object({
  prompt: z.string().optional(),
  taskKind: z.enum(["text_to_image", "image_edit", "text_to_video", "image_to_video"]).optional(),
  moduleId: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  mode: z.string().optional(),
  modeId: z.string().optional(),
  variantId: z.string().optional(),
  parameters: parameters.optional(),
  references: z.array(reference).optional(),
}).strict();

const createFields = {
  prompt: z.string().trim().min(1).optional(),
  taskKind: z.enum(["text_to_image", "image_edit", "text_to_video", "image_to_video"]).optional(),
  moduleId: z.string().trim().min(1).optional(),
  providerId: z.string().trim().min(1).optional(),
  modelId: z.string().trim().min(1).optional(),
  mode: z.string().trim().min(1).optional(),
  modeId: z.string().trim().min(1).optional(),
  variantId: z.string().trim().min(1).optional(),
  parameters: parameters.optional(),
  references: z.array(reference).optional(),
  candidate: generationCandidateSchema.optional(),
  shots: z.array(z.object({
    shotId: z.string().trim().min(1).optional(),
    role: z.enum(["anchor", "shot"]).optional(),
    included: z.boolean().optional(),
    candidate: generationCandidateSchema.optional(),
    prompt: z.string().trim().min(1).optional(),
    taskKind: z.enum(["text_to_image", "image_edit", "text_to_video", "image_to_video"]).optional(),
    modelId: z.string().trim().min(1).optional(),
    mode: z.string().trim().min(1).optional(),
    modeId: z.string().trim().min(1).optional(),
    variantId: z.string().trim().min(1).optional(),
    parameters: parameters.optional(),
    references: z.array(reference).optional(),
  }).strict()).optional(),
  scriptText: z.string().trim().min(1).optional(),
} as const;

const operationId = z.string().trim().min(1);

export const generationPlanInputSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("context") }).strict(),
  z.object({ operation: z.literal("create"), ...createFields }).strict(),
  z.object({ operation: z.literal("patch"), operationId, patch: candidatePatch }).strict(),
  z.object({ operation: z.literal("preview"), operationId }).strict(),
  // Strategy resolution is the separate GENERATION_RESOLVE_CAPABILITY owner.
]);

export const generationStatusInputSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("read"), operationId }).strict(),
  z.object({ operation: z.literal("cancel"), operationId }).strict(),
  z.object({ operation: z.literal("reconcile"), operationId, outcome: z.enum(GENERATION_RECONCILE_OUTCOMES) }).strict(),
]);
