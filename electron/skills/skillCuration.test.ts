import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { parseSkillFrontmatter, readSkillFrontmatterIdentity } from "./skillFrontmatter";
import { readSkillCuration } from "./skillCuration";
import { discoverSkillRecordsFromRoots } from "./skillStore";
import { buildSkillPackage, validateSkillPackage } from "./skillPackage";
import { getCuratedPrompts } from "../promptLibrary/curatedPrompts";

const root = path.resolve(__dirname, "../..");
const read = (relative: string): string => fs.readFileSync(path.join(root, relative), "utf8");
function rewrite(source: string, mutate: (front: Record<string, unknown>) => void): string {
  const front = parseSkillFrontmatter(source).values;
  mutate(front);
  return `---\n${yaml.dump(front)}---\n${source.replace(/^---\n[\s\S]*?\n---\n/, "")}`;
}

describe("curated Skill and effect intake", () => {
  it.each(["tests/fixtures/standard-formats/agent-skill/SKILL.md", "tests/fixtures/standard-formats/agent-skill/anthropic-algorithmic-art.md"])("reads unmodified official sample %s", (file) => {
    const source = read(file);
    expect(readSkillFrontmatterIdentity(source).error).toBeUndefined();
    expect(validateSkillPackage(buildSkillPackage("official", { "SKILL.md": source }, 0)).ok).toBe(true);
  });

  for (const dir of ["curated-multi-view", "effect-character-three-view"]) {
    const source = read(`skills/${dir}/SKILL.md`);
    it(`${dir}: rejects missing redistribution license through the real importer`, () => {
      const broken = rewrite(source, (front) => { delete front.license; });
      expect(validateSkillPackage(buildSkillPackage(dir, { "SKILL.md": broken }, 0)).ok).toBe(false);
    });
    it(`${dir}: rejects unsupported node applicability`, () => {
      const broken = rewrite(source, (front) => {
        const metadata = front.metadata as { nomi: { library: { appliesTo: string[] } } };
        metadata.nomi.library.appliesTo = ["audio"];
      });
      expect(validateSkillPackage(buildSkillPackage(dir, { "SKILL.md": broken }, 0)).ok).toBe(false);
    });
    it(`${dir}: rejects a preview escaping its own package`, () => {
      const broken = rewrite(source, (front) => {
        const metadata = front.metadata as { nomi: { library: { preview: unknown } } };
        metadata.nomi.library.preview = { path: "assets/../../private.png", type: "image", provenance: "illustration" };
      });
      expect(validateSkillPackage(buildSkillPackage(dir, { "SKILL.md": broken }, 0)).ok).toBe(false);
    });
  }

  it("discovers 15 Skills and projects 40 effects from the same packages", () => {
    const { records } = discoverSkillRecordsFromRoots([{ path: path.join(root, "skills"), origin: "builtin" }]);
    expect(records.filter((record) => record.curation?.kind === "skill")).toHaveLength(15);
    const prompts = getCuratedPrompts(records);
    expect(prompts).toHaveLength(40);
    expect(new Set(prompts.map((prompt) => prompt.id)).size).toBe(40);
    for (const record of records.filter((record) => record.curation)) {
      expect(record.manifestError, record.directoryName).toBeUndefined();
      const item = readSkillCuration(parseSkillFrontmatter(record.body).values)!;
      for (const slot of item.slots) expect(record.body).toContain(slot.token);
      if (item.preview) expect(fs.existsSync(path.join(path.dirname(record.filePath), item.preview.path))).toBe(true);
    }
    const record = records.find((item) => item.directoryName === "effect-character-three-view")!;
    const changed = { ...record, body: record.body.replace("纯白背景", "中性背景") };
    expect(getCuratedPrompts([changed])[0].prompt).toContain("中性背景");
    expect(getCuratedPrompts([{ ...changed, origin: "user" }])).toEqual([]);
  });
});
