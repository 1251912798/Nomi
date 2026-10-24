import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockedUserDataRoot = "";

vi.mock("electron", () => ({
  app: {
    getPath: () => mockedUserDataRoot,
    getAppPath: () => process.cwd(),
  },
}));

import { addUserPrompt, deleteUserPrompt, listUserPrompts, resetUserPromptCache, restoreUserPrompt, updateUserPrompt } from "./userPromptStore";

const tempRoots: string[] = [];

beforeEach(() => {
  mockedUserDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-userprompt-"));
  tempRoots.push(mockedUserDataRoot);
  resetUserPromptCache();
});

afterEach(() => {
  for (const dir of tempRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("userPromptStore", () => {
  it("add → list 落盘且可读回", () => {
    const item = addUserPrompt({ title: "黄昏剪影", prompt: "屋顶逆光少年", promptType: "image" });
    expect(item.id).toMatch(/^user-/);
    expect(item.origin).toBe("user");
    // 来源标签不落盘(存了就把当时的界面语言焊进数据):origin 表达「这是我的库」,显示名由渲染层取。
    expect(item.source).toBe("");
    const list = listUserPrompts();
    expect(list).toHaveLength(1);
    expect(list[0]?.prompt).toBe("屋顶逆光少年");
    // 真落盘:重置内存缓存后从盘水合仍在
    resetUserPromptCache();
    expect(listUserPrompts()).toHaveLength(1);
  });

  it("空提示词拒绝写入", () => {
    expect(() => addUserPrompt({ prompt: "   ", promptType: "image" })).toThrow();
    expect(listUserPrompts()).toHaveLength(0);
  });

  it("无标题存空串(不落本地化文案),类型默认 image", () => {
    const item = addUserPrompt({ prompt: "纯文本", promptType: "video" });
    // 空 = 未命名。**不能**在这里落「未命名提示词」:它会进库文件,把建条目那一刻的界面语言
    // 焊死在数据里(英文用户建的条目永远带中文标题)。显示名由 promptDisplay.promptDisplayTitle 取。
    expect(item.title).toBe("");
    expect(item.promptType).toBe("video");
    expect(item.mediaType).toBe("video");
  });

  it("update 改内容 + 类型,mediaType 跟随,updatedAt 刷新", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const item = addUserPrompt({ title: "A", prompt: "old", promptType: "image" });
    const before = item.updatedAt;
    vi.setSystemTime(new Date("2026-01-01T00:00:01Z"));
    const after = updateUserPrompt(item.id, { prompt: "new", promptType: "video" });
    const updated = after.find((p) => p.id === item.id);
    expect(updated?.prompt).toBe("new");
    expect(updated?.promptType).toBe("video");
    expect(updated?.mediaType).toBe("video");
    expect(updated?.updatedAt).not.toBe(before);
    vi.useRealTimers();
  });

  it("delete 移除指定条目,幂等", () => {
    const a = addUserPrompt({ prompt: "a", promptType: "image" });
    const b = addUserPrompt({ prompt: "b", promptType: "image" });
    const afterDel = deleteUserPrompt(a.id);
    expect(afterDel.prompts.map((p) => p.id)).toEqual([b.id]);
    expect(afterDel.deleted).toEqual(a);
    expect(deleteUserPrompt(a.id).prompts.map((p) => p.id)).toEqual([b.id]); // 再删不报错
  });

  it("delete → restore 原样保留 id、标签、参考图、时间和未来字段", () => {
    const original = addUserPrompt({
      title: "带元数据的提示词",
      prompt: "完整快照",
      promptType: "image",
      tags: ["tag-a", "tag-b"],
      referenceImages: [{ url: "nomi-local://asset/p1/ref.png", title: "参考图" }],
    });
    const file = path.join(mockedUserDataRoot, "prompt-library-user.json");
    const persisted = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>[];
    persisted[0] = { ...persisted[0], futureField: { keep: true } };
    fs.writeFileSync(file, JSON.stringify(persisted));
    resetUserPromptCache();

    const before = listUserPrompts()[0];
    expect(before).toMatchObject({ id: original.id, tags: original.tags, referenceImages: original.referenceImages });
    const deleted = deleteUserPrompt(original.id);
    expect(deleted.deleted).toMatchObject({ id: original.id, futureField: { keep: true } });
    expect(deleted.prompts).toHaveLength(0);

    const restored = restoreUserPrompt(deleted.deleted);
    const preservedFieldsMatrix = [
      "id",
      "title",
      "prompt",
      "promptType",
      "mediaType",
      "mediaUrl",
      "tags",
      "referenceImages",
      "updatedAt",
      "futureField",
    ] as const;
    for (const field of preservedFieldsMatrix) {
      expect((restored[0] as Record<string, unknown>)[field], field).toEqual(
        (deleted.deleted as Record<string, unknown>)[field],
      );
    }
    expect(restored[0]).toEqual(deleted.deleted);
    expect(restored[0]).toMatchObject({
      id: original.id,
      tags: ["tag-a", "tag-b"],
      referenceImages: [{ url: "nomi-local://asset/p1/ref.png", title: "参考图" }],
      futureField: { keep: true },
    });
  });

  it("删除后没有撤销时记录永久移除且不负责删除引用文件", () => {
    const referenceFile = path.join(mockedUserDataRoot, "reference.png");
    fs.writeFileSync(referenceFile, "reference");
    const item = addUserPrompt({ prompt: "保留引用文件", promptType: "image", referenceImages: [{ url: referenceFile }] });
    const deleted = deleteUserPrompt(item.id);
    expect(deleted.deleted?.id).toBe(item.id);
    expect(listUserPrompts()).toEqual([]);
    expect(fs.existsSync(referenceFile)).toBe(true);
  });

  it("最近更新排前", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const a = addUserPrompt({ prompt: "first", promptType: "image" });
    vi.setSystemTime(new Date("2026-01-01T00:00:01Z"));
    addUserPrompt({ prompt: "second", promptType: "image" });
    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));
    updateUserPrompt(a.id, { prompt: "first-edited" });
    expect(listUserPrompts()[0]?.id).toBe(a.id); // a 刚编辑过,冒到顶
    vi.useRealTimers();
  });
});

describe("userPromptStore · 素材面收敛随迁字段(2026-07-22)", () => {
  it("referenceImages/tags 落盘,封面 mediaUrl 取首图", () => {
    const item = addUserPrompt({
      title: "赛博雨夜",
      prompt: "cyberpunk city, rainy night",
      promptType: "image",
      tags: ["tag-a", "tag-b"],
      referenceImages: [
        { url: "nomi-local://asset/p1/a.png", title: "参考A", sourceUrl: "https://example.com/a" },
        { url: "nomi-local://asset/p1/b.png" },
      ],
    });
    expect(item.mediaUrl).toBe("nomi-local://asset/p1/a.png");
    expect(item.referenceImages).toHaveLength(2);
    expect(item.tags).toEqual(["tag-a", "tag-b"]);
    resetUserPromptCache();
    const hydrated = listUserPrompts()[0];
    expect(hydrated?.referenceImages?.[0]?.url).toBe("nomi-local://asset/p1/a.png");
    expect(hydrated?.tags).toEqual(["tag-a", "tag-b"]);
  });

  it("非法 referenceImages/超量 tags 被清洗,不落脏数据", () => {
    const item = addUserPrompt({
      prompt: "sanitize check",
      promptType: "video",
      tags: [" a ", "", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
      referenceImages: [{ url: "" } as { url: string }, { url: "ok://x" }, null as unknown as { url: string }],
    });
    expect(item.referenceImages).toHaveLength(1);
    expect(item.mediaUrl).toBe("ok://x");
    expect(item.tags).toHaveLength(8);
    expect(item.tags?.[0]).toBe("a");
  });
});
