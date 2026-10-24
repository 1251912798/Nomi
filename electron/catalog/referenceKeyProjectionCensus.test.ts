import { describe, expect, it } from "vitest";

import { bodyReferencedParamKeys } from "./paramTranslate";
import { projectReferencesOntoBodyKeys } from "./taskParams";
import { buildReferenceKeyCensus } from "../../scripts/reference-key-census";
import { applyBuiltinSeeds } from "./seedBuiltins";

const NOW = "2026-10-25T00:00:00.000Z";
const IMAGE = "https://ref.test/image.png";
const VIDEO = "https://ref.test/video.mp4";
const AUDIO = "https://ref.test/audio.mp3";

function seededMapping(id: string) {
  const { state } = applyBuiltinSeeds({ version: 4, vendors: [], models: [], mappings: [], apiKeysByVendor: {} }, NOW);
  const mapping = state.mappings.find((candidate) => candidate.id === id);
  if (!mapping) throw new Error(`missing seeded mapping: ${id}`);
  return mapping;
}

describe("reference-key projection census — declared reference behavior", () => {
  it("has no false positives in real seeded creation bodies", () => {
    const census = buildReferenceKeyCensus();
    expect(census.summary.seededMappings).toBe(246);
    expect(census.summary.rowsWithClassifiedKeys).toBe(124);
    expect(census.summary.falsePositiveRows).toBe(0);
    expect(census.summary.falsePositiveKeys).toBe(0);
    expect(census.summary.falsePositiveKeyNames).toEqual([]);
  });

  it("image-only headless input does not land in a quantity field", () => {
    const mapping = seededMapping("seed-fal-openai-gpt-image-2-t2i");
    const overlay = projectReferencesOntoBodyKeys({ referenceImages: [IMAGE] }, mapping.create.body);
    expect(bodyReferencedParamKeys(mapping.create.body)).toContain("num_images");
    expect(overlay).not.toHaveProperty("num_images");
    expect(overlay).toEqual({});
  });

  it("image-only headless input lands in a declared image slot", () => {
    const mapping = seededMapping("seed-kie-seedance2-image_to_video");
    const overlay = projectReferencesOntoBodyKeys({ referenceImages: [IMAGE] }, mapping.create.body);
    expect(overlay).toEqual({ reference_image_urls: [IMAGE] });
  });

  it.each([
    ["seed-rh-seedance-global-i2v", "generateAudio"],
    ["seed-kie-happyhorse-text_to_video", "audio_setting"],
    ["seed-apimart-kling-3.0-image_to_video", "audio"],
  ])("audio-only headless input does not land in the %s non-reference field", (mappingId, key) => {
    const mapping = seededMapping(mappingId);
    const overlay = projectReferencesOntoBodyKeys({ referenceAudioUrls: [AUDIO] }, mapping.create.body);
    expect(bodyReferencedParamKeys(mapping.create.body)).toContain(key);
    expect(overlay).not.toHaveProperty(key);
    expect(overlay).toEqual({});
  });

  it("removing the declared video input from a real body does not project into a numeric control", () => {
    const mapping = seededMapping("seed-agnes-video-2.5-text_to_video");
    const bodyWithoutDeclaredVideoInput = { ...(mapping.create.body as Record<string, unknown>) };
    delete bodyWithoutDeclaredVideoInput.videos;
    const overlay = projectReferencesOntoBodyKeys({ referenceVideoUrls: [VIDEO] }, bodyWithoutDeclaredVideoInput);
    expect(overlay).not.toHaveProperty("video_start_seconds");
    expect(overlay).toEqual({});
  });

  it("keeps an existing boolean value while projecting audio into its declared slot", () => {
    const mapping = seededMapping("seed-apimart-seedance-2-apimart-image_to_video");
    const overlay = projectReferencesOntoBodyKeys({ referenceAudioUrls: [AUDIO], audio: false }, mapping.create.body);
    expect(overlay).toEqual({ audio_urls: [AUDIO] });
  });
});
