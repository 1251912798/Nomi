// 接入说明卡编译器走真栈（2026-10-21 起与文本任务同一个「调一次模型」核心，不再是 ai@4 的 generateObject）：
// 真 pi-ai、真 HTTP（本机假上游），不注入 generate。证三件事：
//   · 请求仍声明 JSON 输出（response_format: json_object，与迁移前 generateObject(mode:"json") 一致）、带系统提示；
//   · 思考型模型先想再给 JSON：照常编出来（判活看任意事件）；
//   · 会话取消：核心收到 signal，立刻收口，不再换候选模型重试。
import { describe, expect, it } from "vitest";
import type { Model, Vendor } from "../catalog/types";
import { nomiModelConfigFor } from "../ai/vendorModelConnection";
import { reply, startTextUpstream, type UpstreamReply } from "../../tests/fixtures/textTasks/textUpstream";
import { compileProviderAdapter } from "./compiler";

const contract = JSON.stringify({ modes: [{ taskKind: "text_to_image",
  create: { method: "POST", path: "/images/generations", body: { model: "{{model.modelKey}}", prompt: "{{request.prompt}}" },
    response_mapping: { image_url: "data.0.url" } },
  sourceUrls: ["https://docs.example.com/api"] }] });

async function compileAgainst(script: (index: number) => UpstreamReply, signal?: AbortSignal) {
  const server = await startTextUpstream("openai-compatible", (_request, index) => script(index));
  try {
    const model = nomiModelConfigFor({ key: "compiler", baseUrlHint: server.baseURL, providerKind: "openai-compatible", authType: "bearer" } as unknown as Vendor,
      { modelKey: "compiler-model", kind: "text" } as unknown as Model, "sk-compiler");
    const result = await compileProviderAdapter({
      languageModel: model, providerBaseUrl: "https://api.example.com/v1", authType: "bearer",
      selectedModels: [{ modelKey: "paint-v2", label: "Paint V2", kind: "image" }],
      docs: [{ url: "https://docs.example.com/api", text: "POST /v1/images/generations accepts model and prompt" }],
      ...(signal ? { signal } : {}),
    }).then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
    return { result, requests: server.requests };
  } finally {
    await server.close();
  }
}

describe("编译器走唯一核心（真 HTTP）", () => {
  it("声明 JSON 输出、带系统提示，回来的文本修框 + 校验后编成说明卡", async () => {
    const { result, requests } = await compileAgainst(() => reply.text(`好的：\n\`\`\`json\n${contract}\n\`\`\``));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.draft.models[0]?.modes[0]?.taskKind).toBe("text_to_image");
    expect(requests[0]?.body.response_format).toEqual({ type: "json_object" });
    const messages = requests[0]?.body.messages as Array<{ role: string; content: unknown }>;
    expect(messages[0]?.role === "system" || messages[0]?.role === "developer").toBe(true);
  });

  it("思考型模型先想再给 JSON：照常编出来", async () => {
    const { result } = await compileAgainst(() => reply.thinkThenText(5, 100, contract));
    expect(result.ok).toBe(true);
  });

  it("会话取消：立刻收口，不再换候选重试", async () => {
    const controller = new AbortController();
    const { result, requests } = await compileAgainst((index) => {
      if (index === 0) setImmediate(() => controller.abort(new Error("Adapter compilation cancelled")));
      return reply.drip(200, 50);
    }, controller.signal);
    expect(result.ok).toBe(false);
    expect(requests).toHaveLength(1);
  });
});
