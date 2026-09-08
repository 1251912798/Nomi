import { describe, expect, it } from "vitest";

import { deriveSkillNeeds } from "./skillCapability";
import type { SkillManifest } from "./skillManifestSchema";

function manifest(partial: Partial<SkillManifest>): SkillManifest {
  return {
    name: "test.skill",
    version: "1.0.0",
    description: "d",
    tools: [],
    requiredProviders: [],
    permissions: ["create"],
    ...partial,
  } as SkillManifest;
}

describe("deriveSkillNeeds", () => {
  it("derives provider kinds without treating deprecated tools or families as requirements", () => {
    const needs = deriveSkillNeeds(
      manifest({
        requiredProviders: ["text"],
        tools: ["propose_storyboard_plan"],
        stages: [
          { id: "s1", goal: "g", tools: ["create_canvas_nodes"], modelPrefs: [{ kind: "image" }] },
          {
            id: "s2",
            goal: "g",
            tools: ["run_generation_batch"],
            modelPrefs: [{ kind: "video", family: "seedance" }],
          },
        ],
      }),
    );
    expect(needs).toEqual({ providers: ["text", "image", "video"] });
  });

  it("dedupes providers across stages", () => {
    const needs = deriveSkillNeeds(
      manifest({
        requiredProviders: ["image"],
        tools: ["create_canvas_nodes"],
        stages: [
          { id: "s1", goal: "g", tools: ["create_canvas_nodes"], modelPrefs: [{ kind: "image" }] },
        ],
      }),
    );
    expect(needs.providers).toEqual(["image"]);
  });
});
