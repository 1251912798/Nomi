import { readSkillRecords, type SkillRecord } from "../skills/skillStore";
import type { LibraryPrompt } from "./promptLibraryTypes";

/** SKILL.md remains the body owner; the library receives a projection, never a second content file. */
export function getCuratedPrompts(records: SkillRecord[] = readSkillRecords()): LibraryPrompt[] {
  return records.flatMap((record) => {
    const item = record.curation;
    if (record.origin !== "builtin" || record.manifestError || item?.kind !== "effect") return [];
    const promptType = item.appliesTo.find((kind) => kind === "image" || kind === "video");
    // Text remains a valid Skill modality, but the current prompt panel only creates image/video nodes.
    if (!promptType) return [];
    const prompt = record.body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
    return [{
      id: record.directoryName,
      title: item.title["zh-CN"],
      prompt,
      promptType,
      mediaType: item.preview?.type ?? "image",
      mediaUrl: item.preview ? `skills/${record.directoryName}/${item.preview.path}` : "",
      origin: "public" as const,
      source: item.group["zh-CN"],
      sourceId: "builtin-curated-effects",
      sourceUrl: item.source.url,
      tags: [item.group["zh-CN"], item.group.en, ...item.appliesTo],
      curation: item,
    }];
  });
}
