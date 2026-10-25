// Fixture user accepts the quote card; the real taskSpend guard still runs.
vi.mock("./capabilityCore/rendererBridge", () => ({
  requestRendererDecision: vi.fn(async (operation: string) => {
    if (operation !== "spend.confirm") throw new Error(`Unexpected renderer operation: ${operation}`);
    return { confirmed: true };
  }),
  requestRenderer: vi.fn(async (operation: string) => {
    throw new Error(`Spend confirmation must not use the timeout-bound bridge: ${operation}`);
  }),
}));

// 第三闸照常执行，只是记下它收到的参数。
vi.mock("./catalog/taskParams", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./catalog/taskParams")>();
  return { ...actual, imageEditGuardError: vi.fn(actual.imageEditGuardError) };
});

/**
 * 运行时第三闸拿到的模型身份必须带连接自己的 meta（2026-10-25 #1331 独立验收）。
 *
 * 型号名认不出的模型（自建中转、用户接入）只能靠 meta 认档案：第三闸据此判哪些键是参考、
 * 拒发时怎么说下一步。runtime.ts 把身份交给第三闸时若丢了 meta，清单那条路照样对，
 * 第三闸却悄悄退回键名推断——这条锁的就是这根线。
 * 注意：参考数超过档案上限的拒发不在第三闸，在更早的 applyHeadlessParamDefaults（直接读 model.meta），
 * 所以这里锁「线接对了」，不拿超量拒发当判据。
 */

let mockedUserDataRoot = "";
const tempRoots: string[] = [];

vi.mock("electron", () => ({
  app: {
    getPath: () => mockedUserDataRoot,
    getAppPath: () => process.cwd(),
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
}));

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { upsertModelCatalogModel, upsertModelCatalogVendor, upsertModelCatalogVendorApiKey } from "./catalog/catalogStore";
import { imageEditGuardError } from "./catalog/taskParams";
import { mintSpendGrant } from "./spendGrant";
import { runTask } from "./runtime";

const META = { archetypeId: "rh-seedream-4.5" };

describe("runTask × 第三闸的模型身份", () => {
  beforeEach(() => {
    mockedUserDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-reference-selection-"));
    tempRoots.push(mockedUserDataRoot);
    vi.mocked(imageEditGuardError).mockClear();
  });
  afterEach(() => {
    for (const dir of tempRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("型号名认不出、只靠 meta.archetypeId 认档案的模型：第三闸收到的身份带着这份 meta 和这次的 kind", async () => {
    upsertModelCatalogVendor({ key: "custom-ref", name: "Ref", baseUrlHint: "https://ref.example/v1", authType: "bearer", enabled: true });
    upsertModelCatalogVendorApiKey("custom-ref", { apiKey: "sk-ref-1", enabled: true });
    upsertModelCatalogModel({
      vendorKey: "custom-ref",
      modelKey: "relay-custom-edit",
      kind: "image",
      enabled: true,
      meta: META,
      customCall: { modes: { edit: { script: "return 'data:image/png;base64,eA=='" } } },
    });
    const grantId = mintSpendGrant({ nodeIds: ["n1"] });

    const result = await runTask({
      vendor: "custom-ref",
      request: {
        kind: "image_edit",
        prompt: "keep the subject",
        extras: {
          modelKey: "relay-custom-edit",
          nodeId: "n1",
          grantId,
          archetype: { id: META.archetypeId, modeId: "edit" },
          referenceImages: ["https://cdn.example.com/reference.png"],
        },
      },
    });

    expect(result.status).toBe("succeeded");
    const calls = vi.mocked(imageEditGuardError).mock.calls;
    expect(calls).toHaveLength(1);
    // 第 7 个参数：交给第三闸的模型身份（selected）。
    expect(calls[0]?.[6]).toMatchObject({
      vendorKey: "custom-ref",
      modelKey: "relay-custom-edit",
      modelMeta: META,
      taskKind: "image_edit",
    });
  });
});
