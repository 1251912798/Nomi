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

describe("reference-key projection census — current known-bad behavior", () => {
  it("counts false positives from every real seeded creation body", () => {
    const census = buildReferenceKeyCensus();
    expect(census.summary.seededMappings).toBe(246);
    expect(census.summary.rowsWithClassifiedKeys).toBe(135);
    expect(census.summary.falsePositiveRows).toBe(26);
    expect(census.summary.falsePositiveKeys).toBe(12);
    expect(census.summary.falsePositiveKeyNames).toEqual([
      "audio",
      "audio_setting",
      "frame_rate",
      "generateAudio",
      "image_size",
      "num_frames",
      "num_images",
      "video_require_audio",
      "video_start_seconds",
      "voice",
      "voice_id",
      "voice_preset_id",
    ].sort());
  });

  it("known-bad: image-only headless input can land in a quantity field", () => {
    const mapping = seededMapping("seed-fal-openai-gpt-image-2-t2i");
    const overlay = projectReferencesOntoBodyKeys({ referenceImages: [IMAGE] }, mapping.create.body);
    expect(bodyReferencedParamKeys(mapping.create.body)).toContain("num_images");
    expect(overlay).toEqual({ num_images: [IMAGE] });
  });

  it.each([
    ["seed-rh-seedance-global-i2v", "generateAudio"],
    ["seed-kie-happyhorse-text_to_video", "audio_setting"],
    ["seed-apimart-kling-3.0-image_to_video", "audio"],
  ])("known-bad: audio-only headless input lands in the %s non-reference field", (mappingId, key) => {
    const mapping = seededMapping(mappingId);
    const overlay = projectReferencesOntoBodyKeys({ referenceAudioUrls: [AUDIO] }, mapping.create.body);
    expect(bodyReferencedParamKeys(mapping.create.body)).toContain(key);
    expect(overlay[key]).toBe(AUDIO);
  });

  it("known-bad class variation: removing the declared video input from a real body projects a video URL into a numeric control", () => {
    const mapping = seededMapping("seed-agnes-video-2.5-text_to_video");
    const bodyWithoutDeclaredVideoInput = { ...(mapping.create.body as Record<string, unknown>) };
    delete bodyWithoutDeclaredVideoInput.videos;
    const overlay = projectReferencesOntoBodyKeys({ referenceVideoUrls: [VIDEO] }, bodyWithoutDeclaredVideoInput);
    expect(overlay).toEqual({ video_start_seconds: VIDEO });
  });
});
