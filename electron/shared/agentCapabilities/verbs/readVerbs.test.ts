import { describe, expect, it } from "vitest";

import { toPublishedJsonSchema } from "../modelVisibleJsonSchema";
import { toSemanticInput } from "../modelFacingTools";
import { readVerbs } from "./readVerbs";

type JsonSchema = {
  type?: string;
  enum?: readonly unknown[];
  minimum?: number;
  minLength?: number;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
};

function sampleFor(schema: JsonSchema, field: string, seed: number): unknown {
  if (schema.enum?.length) return schema.enum[0];
  if (schema.type === "object") {
    return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([key, child], index) => [key, sampleFor(child, `${field}.${key}`, seed + index + 1)]));
  }
  if (schema.type === "array") return [sampleFor(schema.items ?? { type: "string" }, `${field}[]`, seed)];
  if (schema.type === "number" || schema.type === "integer") return Math.max(schema.minimum ?? 0, seed + 1);
  if (schema.type === "boolean") return seed % 2 === 0;
  return `${field}-read-probe-${seed}`;
}

function leaves(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(leaves);
  if (value && typeof value === "object") return Object.values(value).flatMap(leaves);
  return [value];
}

function containsLeaf(value: unknown, needle: unknown): boolean {
  return leaves(value).some((candidate) => Object.is(candidate, needle));
}

function subsets<T>(values: readonly T[]): T[][] {
  const out: T[][] = [[]];
  for (const value of values) out.push(...out.map((current) => [...current, value]));
  return out;
}

describe("read verb parameter ownership", () => {
  it("accounts for every model-facing read parameter as semantic or presentation-only", () => {
    for (const spec of readVerbs()) {
      const schema = toPublishedJsonSchema(spec.schema) as JsonSchema;
      const fields = Object.entries(schema.properties ?? {});
      const presentation = new Set(spec.presentationInputFields ?? []);

      expect([...presentation].every((field) => fields.some(([name]) => name === field)), spec.name).toBe(true);
      const semanticFields = new Set<string>();
      for (const [field, fieldSchema] of fields) {
        const sample = sampleFor(fieldSchema, field, fields.findIndex(([name]) => name === field));
        for (const selected of subsets(fields.map(([name]) => name))) {
          if (!selected.includes(field)) continue;
          const args = Object.fromEntries(selected.map((name) => [name, sampleFor(schema.properties![name]!, name, fields.findIndex(([candidate]) => candidate === name))]));
          if (!spec.schema.safeParse(args).success) continue;
          let semantic: Record<string, unknown>;
          try {
            semantic = toSemanticInput({ ...spec, description: "", promptSnippet: "", execution: { timeoutMs: 0 } } as never, args);
          } catch {
            continue;
          }
          if (leaves(sample).some((needle) => containsLeaf(semantic, needle))) {
            semanticFields.add(field);
            break;
          }
        }
      }

      for (const [field] of fields) {
        expect(presentation.has(field) || semanticFields.has(field), `${spec.name}.${field}`).toBe(true);
      }
    }
  });

  it("declares look_at_canvas selectedFrom as presentation-only", () => {
    const lookAtCanvas = readVerbs().find((spec) => spec.name === "look_at_canvas");
    expect(lookAtCanvas?.presentationInputFields).toEqual(["selectedFrom"]);
  });
});
