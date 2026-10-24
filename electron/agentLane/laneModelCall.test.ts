// 「调一次模型」唯一核心（laneModelCall.mts）的类测试：真 pi-ai、真 HTTP（本机假上游），只把看门狗的三个数缩小。
// 证的是**判活口径**，不是某一个模型：任何事件（正文、思考）都算活着；响应头之后一个事件都没有才算死；
// 没有停止键的调用有整体兜底，有停止键的没有；重试在退避里也能被停止打断；三种协议一个口径。
import { describe, expect, it, vi } from "vitest";
import type { Model, Vendor } from "../catalog/types";

vi.mock("./laneProviderGuard.mjs", async (importOriginal) => {
  const original = await importOriginal<typeof import("./laneProviderGuard.mjs")>();
  // 真实预算是 90s / 300s / 120s / 10 分钟；缩到毫秒级，判活的**结构**不变。
  return { ...original, LANE_STREAM_WATCHDOG: Object.freeze({ firstResponseMs: 3_000, firstTokenMs: 1_500, idleMs: 1_000 }), MODEL_CALL_CEILING_MS: 3_000 };
});

import { callModelOnce, ModelCallCeilingError } from "./laneModelCall.mjs";
import { nomiModelConfigFor } from "../ai/vendorModelConnection";
import { reply, startTextUpstream, type UpstreamProtocol, type UpstreamReply } from "../../tests/fixtures/textTasks/textUpstream";

async function withUpstream<T>(protocol: UpstreamProtocol, script: (index: number) => UpstreamReply,
  run: (config: ReturnType<typeof nomiModelConfigFor>, server: Awaited<ReturnType<typeof startTextUpstream>>) => Promise<T>,
  vendorPatch: (origin: string) => Partial<Vendor> = () => ({}), modelKey = "fixture-model"): Promise<T> {
  const server = await startTextUpstream(protocol, (_request, index) => script(index));
  try {
    const vendor = { key: "fixture", baseUrlHint: protocol === "anthropic" ? `${server.origin}/v1` : server.baseURL,
      providerKind: protocol, authType: "bearer", ...vendorPatch(server.origin) } as unknown as Vendor;
    return await run(nomiModelConfigFor(vendor, { modelKey, kind: "text" } as unknown as Model, "sk-fixture"), server);
  } finally {
    await server.close();
  }
}

const textOf = (message: { content: Array<{ type: string; text?: string }> }) =>
  message.content.filter((part) => part.type === "text").map((part) => part.text).join("");

describe("判活：任何事件都算活着", () => {
  it("思考型模型：思考总时长远超思考期预算，但一直在吐思考——不被掐，正文照常到", async () => {
    await withUpstream("openai-compatible", () => reply.thinkThenText(8, 300, "想好了。"), async (model) => {
      const kinds: string[] = [];
      const { message } = await callModelOnce({ model, fetch: globalThis.fetch, content: "缩短", signal: new AbortController().signal,
        onEvent: (event) => kinds.push(event.type) });
      expect(message.stopReason).toBe("stop");
      expect(textOf(message)).toBe("想好了。");
      expect(kinds).toContain("thinking_delta");
    });
  });

  it("Anthropic 协议的思考块同样算活着", async () => {
    await withUpstream("anthropic", () => reply.thinkThenText(8, 300, "想好了。"), async (model) => {
      const { message } = await callModelOnce({ model, fetch: globalThis.fetch, content: "缩短", signal: new AbortController().signal });
      expect(message.errorMessage).toBeUndefined();
      expect(textOf(message)).toBe("想好了。");
    });
  });

  it("静默思考（响应头之后什么都不流）在思考期预算内出字：不被掐（Responses 协议）", async () => {
    await withUpstream("openai-responses", () => reply.silentThenText(800, "想好了。"), async (model) => {
      const { message } = await callModelOnce({ model, fetch: globalThis.fetch, content: "缩短", signal: new AbortController().signal });
      expect(message.errorMessage).toBeUndefined();
      expect(textOf(message)).toBe("想好了。");
    });
  });

  it.each(["openai-compatible", "anthropic", "openai-responses"] as const)("%s：真死连接（响应头之后一个事件都没有）在思考期预算到点被掐", async (protocol) => {
    await withUpstream(protocol, () => reply.hangAfterHeaders(), async (model, server) => {
      const { message } = await callModelOnce({ model, fetch: globalThis.fetch, content: "缩短", signal: new AbortController().signal });
      expect(message.stopReason).toBe("error");
      expect(message.errorMessage).toMatch(/^Nomi model first-token timeout after 1500ms/);
      await server.whenClosedEarly();
    });
  });

  it("出字中途停住：空闲预算到点被掐", async () => {
    await withUpstream("openai-compatible", () => ({ type: "stream", steps: [{ kind: "text", text: "半" }, { kind: "hang" }] }), async (model) => {
      const { message } = await callModelOnce({ model, fetch: globalThis.fetch, content: "缩短", signal: new AbortController().signal });
      expect(message.errorMessage).toMatch(/^Nomi model idle timeout after 1000ms/);
    });
  });
});

describe("整体兜底：只给没有停止键的调用", () => {
  it("没传 signal：一直慢慢滴字（每段都在空闲预算内）也会在整体上限到点收尾", async () => {
    await withUpstream("openai-compatible", () => reply.drip(100, 200), async (model) => {
      await expect(callModelOnce({ model, fetch: globalThis.fetch, content: "长文" })).rejects.toBeInstanceOf(ModelCallCeilingError);
    });
  });

  it("传了 signal（有停止键）：同样的滴字不设整体上限，跑完拿到全文", async () => {
    await withUpstream("openai-compatible", () => reply.drip(12, 300), async (model) => {
      const { message } = await callModelOnce({ model, fetch: globalThis.fetch, content: "长文", signal: new AbortController().signal });
      expect(message.stopReason).toBe("stop");
      expect(textOf(message)).toBe(Array.from({ length: 12 }, (_, index) => `段${index}`).join(""));
    });
  });
});

describe("重试与停止", () => {
  it("429：maxRetries 2 → 一共 3 次请求；缺省 0 → 1 次", async () => {
    const limited = () => reply.http(429, { error: { message: "slow down" } }, { "retry-after-ms": "10" });
    await withUpstream("openai-compatible", limited, async (model, server) => {
      const { message } = await callModelOnce({ model, fetch: globalThis.fetch, content: "x", maxRetries: 2, signal: new AbortController().signal });
      expect(message.stopReason).toBe("error");
      expect(server.requests).toHaveLength(3);
    });
    await withUpstream("openai-compatible", limited, async (model, server) => {
      await callModelOnce({ model, fetch: globalThis.fetch, content: "x", signal: new AbortController().signal });
      expect(server.requests).toHaveLength(1);
    });
  });

  it("在 429 的退避等待里点停止：立刻收口成 AbortError，不再发第二次请求", async () => {
    await withUpstream("openai-compatible", () => reply.http(429, { error: { message: "slow down" } }, { "retry-after": "30" }), async (model, server) => {
      const controller = new AbortController();
      const running = callModelOnce({ model, fetch: globalThis.fetch, content: "x", maxRetries: 2, signal: controller.signal });
      await vi.waitUntil(() => server.requests.length === 1);
      controller.abort();
      await expect(running).rejects.toMatchObject({ name: "AbortError" });
      expect(server.requests).toHaveLength(1);
    });
  });
});

describe("请求体与地址：一处规矩", () => {
  it("只存了根地址的 Anthropic 接入：请求打到 /v1/messages（不是 404 的 /messages）", async () => {
    await withUpstream("anthropic", () => reply.text("好。"), async (model, server) => {
      const { message } = await callModelOnce({ model, fetch: globalThis.fetch, content: "x", signal: new AbortController().signal });
      expect(textOf(message)).toBe("好。");
      expect(new URL(server.requests[0]!.path, server.origin).pathname).toBe("/v1/messages");
    }, (origin) => ({ baseUrlHint: origin }));
  });

  it("模型怪癖只套一次：o1 系只收 temperature 1，调用方给的 0.7 被改成 1", async () => {
    await withUpstream("openai-compatible", () => reply.text("好。"), async (model, server) => {
      await callModelOnce({ model, fetch: globalThis.fetch, content: "x", temperature: 0.7, signal: new AbortController().signal });
      expect(server.requests[0]?.body.temperature).toBe(1);
    }, () => ({}), "o1-mini");
  });
});
