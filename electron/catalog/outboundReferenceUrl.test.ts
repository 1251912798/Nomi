import { describe, expect, it } from "vitest";
import { normalizeOutboundReferenceMediaUrls, isOutboundReferenceMediaKey } from "./outboundReferenceUrl";
import { applyBuiltinSeeds } from "./seedBuiltins";
import { renderTemplateValue } from "../ai/requestPipeline";

describe("normalizeOutboundReferenceMediaUrls", () => {
  it("serializes the MiniMax-H3 image_urls reference before the request body is written", () => {
    const body = { image_urls: ["https://cdn.example.com/Windows ref.png"] };
    expect(normalizeOutboundReferenceMediaUrls(body)).toEqual({
      image_urls: ["https://cdn.example.com/Windows%20ref.png"],
    });
  });

  it.each([
    ["array", { image_urls: ["https://cdn.example.com/图 1.png"] }],
    ["string", { first_frame_image: "https://cdn.example.com/first frame.png" }],
    ["object", { image_with_roles: [{ url: "https://cdn.example.com/角色#1.png", role: "reference_image" }] }],
  ])("normalizes the %s reference shape", (_name, value) => {
    const normalized = normalizeOutboundReferenceMediaUrls(value);
    expect([...JSON.stringify(normalized)].some((char) => char <= " ")).toBe(false);
  });

  it("keeps encoded, signed, and data URLs unchanged", () => {
    const signed = "https://cdn.example.com/a%20b.png?X-Amz-Signature=abc%2F123&X-Amz-Date=20261025T000000Z";
    const data = "data:image/png;base64,AA==";
    expect(normalizeOutboundReferenceMediaUrls({ image_urls: [signed], first_frame_image: data })).toEqual({
      image_urls: [signed],
      first_frame_image: data,
    });
  });

  it("fails closed for an unparseable reference URL", () => {
    expect(() => normalizeOutboundReferenceMediaUrls({ image_urls: ["https://[bad"] })).toThrow(/参考|reference/i);
  });

  it("structurally covers every seeded mapping body that declares a reference-media parameter", () => {
    const state = applyBuiltinSeeds({ version: 4, vendors: [], models: [], mappings: [], apiKeysByVendor: {} }, "2026-10-25T00:00:00.000Z").state;
    let checked = 0;
    for (const mapping of state.mappings) {
      const source = JSON.stringify(mapping.create?.body || "");
      const keys = [...source.matchAll(/request\.params\.([A-Za-z0-9_]+)/g)].map((match) => match[1]).filter(isOutboundReferenceMediaKey);
      if (keys.length === 0) continue;
      const params = Object.fromEntries([...new Set(keys)].map((key) => [key, ["https://cdn.example.com/Windows ref.png"]]));
      const body = renderTemplateValue(mapping.create?.body, { request: { params } });
      const normalized = normalizeOutboundReferenceMediaUrls(body);
      expect(JSON.stringify(normalized), mapping.id).not.toContain("Windows ref.png");
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
