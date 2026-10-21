// 思考型模型（DeepSeek V4、R1……）先吐一长串 reasoning、正文很久以后才来：这是「在动」，不是「死连接」。
//
// 真往返（零额度，本机 HTTP，不连外网）：真 ai SDK + 真 openai-compatible 适配 + 真 streamTextTask，只把最外层的上游换成本机假服务。
// 为什么不 mock `ai`：旧测试把 streamText 换成假流，只能证「给定这个形状我们怎么处理」，证不了「真 SDK 对 reasoning_content 到底发什么 chunk」。
// 2026-10-21 真模型走查：写作区 AI 编辑接 DeepSeek V4，30 秒后「首字未响应」——首字闸只数正文，思考中的好模型被当死连接掐掉；
// 假桥演练里夹具回得立刻，这一类就从演练旁边溜过去了（所以演练另有一格「慢思考」，见 creation-ai-rewrite-real.rehearsal.walk.mjs）。
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { buildAiSdkModel } from "./buildAiSdkModel";

let baseURL = "";
let server: http.Server;
let script: (res: http.ServerResponse) => void = (res) => res.end();

vi.mock("./vendorLanguageModel", () => ({
  buildLanguageModelForVendor: () => buildAiSdkModel({ kind: "openai-compatible", baseURL, apiKey: "sk-test", modelId: "think-model" }),
}));
vi.mock("../assets/localAssetFile", () => ({ readNomiLocalAsset: () => null }));
vi.mock("./antigravityTask", () => ({ runAntigravityTask: vi.fn() }));

import { streamTextTask } from "./streamTextTask";
import type { Model, Vendor } from "../catalog/types";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => script(res));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const frame = (delta: Record<string, string>) => `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", choices: [{ index: 0, delta }] })}\n\n`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 先每隔 gapMs 吐一条 reasoning（共 count 条），再吐正文，最后 [DONE]。 */
function thinkingThenAnswer(count: number, gapMs: number, answer: string): (res: http.ServerResponse) => void {
  return (res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    void (async () => {
      res.write(frame({ role: "assistant" }));
      for (let index = 0; index < count; index += 1) {
        await sleep(gapMs);
        res.write(frame({ reasoning_content: `想${index}` }));
      }
      res.write(frame({ content: answer }));
      res.write("data: [DONE]\n\n");
      res.end();
    })();
  };
}

const input = { vendor: {} as Vendor, model: {} as Model, apiKey: "k", prompt: "缩短这句话", maxRetries: 0 };

describe("首字闸：思考中的模型是活的", () => {
  it("先想很久（总时长远超首字闸）、再给正文：不被当死连接掐掉，正文照常拿到", async () => {
    script = thinkingThenAnswer(8, 60, "慢慢展开纸条。"); // 想 ~480ms，首字闸 200ms
    const deltas: string[] = [];
    const result = await streamTextTask(input, { firstTokenTimeoutMs: 200, onDelta: (delta) => deltas.push(delta) });
    expect(result.text).toBe("慢慢展开纸条。");
    expect(deltas.join("")).toBe("慢慢展开纸条。");
  });

  it("真死连接（连思考都没有）仍然在首字闸到点时被掐断，并给出「首字未响应」", async () => {
    script = (res) => { res.writeHead(200, { "content-type": "text/event-stream" }); res.write(frame({ role: "assistant" })); /* 然后什么都不吐 */ };
    await expect(streamTextTask(input, { firstTokenTimeoutMs: 200 })).rejects.toThrow(/首字 0\.2s 未响应/);
  });
});
