// 文本任务的本机假上游（零额度、不出网）：真 HTTP、真 SSE 字节，只把「远端模型」换成脚本。
//
// 为什么不桩掉 SDK：2026-10-21 写作区改写接思考型模型 30 秒被掐，单测全绿——因为旧测试把 streamText 换成假流，
// 证的是「给定这个形状我们怎么处理」，证不了「真 SDK 对 reasoning_content 发什么事件、判活看什么」。
// 这里每一种回法都是一段真实的线上字节：被测的是整条栈（我们的执行器 → 真 SDK → 真 HTTP）。
//
// 三种协议的事件形状照 tests/agent-runtime/httpFixture.mts（lane 那份夹具，已在 pi 上验过）。
import http from "node:http";
import type { AddressInfo } from "node:net";

export type UpstreamProtocol = "openai-compatible" | "openai-responses" | "anthropic";

/** 一段回法。`afterMs` = 发这一段之前先等多久（真墙钟，用来造「想得久」「出字中途停」）。 */
export type UpstreamStep =
  | { kind: "reasoning"; text: string; afterMs?: number }
  | { kind: "text"; text: string; afterMs?: number }
  | { kind: "finish"; reason?: "stop" | "length"; afterMs?: number }
  /** 只结束流（OpenAI 兼容：`[DONE]`），不发 finish_reason —— 中转半路掐断 / 不规范中转。 */
  | { kind: "end"; afterMs?: number }
  /** SSE 里包着错误（HTTP 仍是 200）。 */
  | { kind: "sse-error"; error: Record<string, unknown>; afterMs?: number }
  /** 什么都不再发，连接也不关 —— 真死连接。 */
  | { kind: "hang" }
  /** 直接掐断 TCP。 */
  | { kind: "destroy"; afterMs?: number };

export type UpstreamReply =
  | { type: "stream"; steps: UpstreamStep[] }
  | { type: "http"; status: number; json?: unknown; body?: string; headers?: Record<string, string> }
  /** 收下请求、连响应头都不回（服务商卡在排队 / 网关不放行）。 */
  | { type: "silent" }
  /** 收下请求、不回响应头就掐断 TCP（连接被重置：客户端的 fetch 直接抛错）。 */
  | { type: "reset" };

export type UpstreamRequest = { method: string; path: string; headers: http.IncomingHttpHeaders; body: Record<string, unknown> };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const reply = {
  text: (text: string): UpstreamReply => ({ type: "stream", steps: [{ kind: "text", text }, { kind: "finish" }] }),
  /** 先每隔 gapMs 吐一段思考（共 count 段），再吐正文——DeepSeek V4 / R1 一类。 */
  thinkThenText: (count: number, gapMs: number, text: string): UpstreamReply => ({ type: "stream", steps: [
    ...Array.from({ length: count }, (_, index) => ({ kind: "reasoning" as const, text: `想${index}`, afterMs: gapMs })),
    { kind: "text", text }, { kind: "finish" },
  ] }),
  /** 响应头之后一个字都不吐、也不思考，静默 silentMs 后才出正文（思考不流的模型）。 */
  silentThenText: (silentMs: number, text: string): UpstreamReply => ({ type: "stream", steps: [
    { kind: "text", text, afterMs: silentMs }, { kind: "finish" },
  ] }),
  /** 每隔 gapMs 吐一段正文，共 count 段（慢慢滴字）。 */
  drip: (count: number, gapMs: number): UpstreamReply => ({ type: "stream", steps: [
    ...Array.from({ length: count }, (_, index) => ({ kind: "text" as const, text: `段${index}`, afterMs: gapMs })),
    { kind: "finish" },
  ] }),
  silent: (): UpstreamReply => ({ type: "silent" }),
  reset: (): UpstreamReply => ({ type: "reset" }),
  hangAfterHeaders: (): UpstreamReply => ({ type: "stream", steps: [{ kind: "hang" }] }),
  cutAfterText: (text: string): UpstreamReply => ({ type: "stream", steps: [{ kind: "text", text }, { kind: "destroy", afterMs: 20 }] }),
  noFinishReason: (text: string): UpstreamReply => ({ type: "stream", steps: [{ kind: "text", text }, { kind: "end" }] }),
  empty: (): UpstreamReply => ({ type: "stream", steps: [{ kind: "finish" }] }),
  sseError: (message: string): UpstreamReply => ({ type: "stream", steps: [{ kind: "sse-error", error: { message, type: "upstream_error", code: "relay_failed" } }] }),
  http: (status: number, json: unknown, headers?: Record<string, string>): UpstreamReply => ({ type: "http", status, json, ...(headers ? { headers } : {}) }),
};

/**
 * 起一个假上游。`script(request, index)` 决定第 index 次（从 0 起）请求怎么回；
 * 请求全记在 `requests`，连接被对端关掉的次数记在 `closedEarly`（停止 / 看门狗是不是真掐了 HTTP）。
 */
export async function startTextUpstream(protocol: UpstreamProtocol, script: (request: UpstreamRequest, index: number) => UpstreamReply) {
  const requests: UpstreamRequest[] = [];
  let closedEarly = 0;
  const closeWaiters: Array<() => void> = [];
  const sockets = new Set<import("node:net").Socket>();
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: Record<string, unknown>;
      try { body = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { body = { raw }; }
      const request: UpstreamRequest = { method: req.method || "", path: req.url || "", headers: req.headers, body };
      requests.push(request);
      const planned = script(request, requests.length - 1);
      // 「提前关掉」= 我们这边还没把回包写完，对端（被测的客户端）就断了：停止 / 看门狗真的掐了 HTTP。
      res.on("close", () => {
        if (res.writableEnded) return;
        closedEarly += 1;
        for (const wake of closeWaiters.splice(0)) wake();
      });
      void serve(protocol, planned, request, res).catch(() => undefined);
    });
  });
  server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    /** OpenAI 兼容 / Responses 的 baseURL 带 /v1；Anthropic 用 origin + /v1（我们的配置约定）。 */
    baseURL: `${origin}/v1`,
    requests,
    get closedEarly() { return closedEarly; },
    /** 等到对端（我们的客户端）提前关掉一条连接——停止 / 看门狗真的掐了 HTTP。 */
    whenClosedEarly: () => closedEarly > 0 ? Promise.resolve() : new Promise<void>((resolve) => closeWaiters.push(resolve)),
    close: () => new Promise<void>((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    }),
  };
}

async function serve(protocol: UpstreamProtocol, planned: UpstreamReply, request: UpstreamRequest, res: http.ServerResponse): Promise<void> {
  if (planned.type === "silent") return;
  if (planned.type === "reset") { res.socket?.destroy(); return; }
  if (planned.type === "http") {
    res.writeHead(planned.status, { "content-type": "application/json", ...(planned.headers || {}) });
    res.end(planned.body ?? JSON.stringify(planned.json ?? {}));
    return;
  }
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  const model = String(request.body.model || "fixture-model");
  const writer = protocolWriter(protocol, model, res);
  writer.open();
  for (const step of planned.steps) {
    if (res.destroyed) return;
    if ("afterMs" in step && step.afterMs) await sleep(step.afterMs);
    if (res.destroyed) return;
    switch (step.kind) {
      case "reasoning": writer.reasoning(step.text); break;
      case "text": writer.text(step.text); break;
      case "finish": writer.finish(step.reason ?? "stop"); res.end(); return;
      case "end": writer.endWithoutFinish(); res.end(); return;
      case "sse-error": writer.sseError(step.error); res.end(); return;
      case "hang": return;
      case "destroy": res.socket?.destroy(); return;
    }
  }
}

function protocolWriter(protocol: UpstreamProtocol, model: string, res: http.ServerResponse) {
  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (protocol === "anthropic") {
    let index = -1;
    let open: "thinking" | "text" | null = null;
    const event = (type: string, value: Record<string, unknown>) => { res.write(`event: ${type}\n`); send({ type, ...value }); };
    const block = (kind: "thinking" | "text") => {
      if (open === kind) return;
      if (open) event("content_block_stop", { index });
      index += 1; open = kind;
      event("content_block_start", { index, content_block: kind === "text" ? { type: "text", text: "" } : { type: "thinking", thinking: "", signature: "" } });
    };
    return {
      open: () => event("message_start", { message: { id: "msg-fixture", type: "message", role: "assistant", model, content: [],
        stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }),
      reasoning: (text: string) => { block("thinking"); event("content_block_delta", { index, delta: { type: "thinking_delta", thinking: text } }); },
      text: (text: string) => { block("text"); event("content_block_delta", { index, delta: { type: "text_delta", text } }); },
      finish: (reason: "stop" | "length") => {
        if (open) event("content_block_stop", { index });
        event("message_delta", { delta: { stop_reason: reason === "length" ? "max_tokens" : "end_turn", stop_sequence: null }, usage: { output_tokens: 4 } });
        event("message_stop", {});
      },
      endWithoutFinish: () => { if (open) event("content_block_stop", { index }); },
      sseError: (error: Record<string, unknown>) => event("error", { error: { type: "api_error", ...error } }),
    };
  }
  if (protocol === "openai-responses") {
    let sequence = 0;
    let text = "";
    const event = (type: string, value: Record<string, unknown>) => send({ type, sequence_number: sequence++, ...value });
    const item = (status: string) => ({ id: "msg-fixture", type: "message", role: "assistant", status,
      content: status === "in_progress" ? [] : [{ type: "output_text", text, annotations: [] }] });
    let added = false;
    const ensure = () => { if (!added) { added = true; event("response.output_item.added", { output_index: 0, item: item("in_progress") }); } };
    return {
      open: () => event("response.created", { response: { id: "resp-fixture", status: "in_progress", output: [] } }),
      // Responses 的推理摘要形状这里不造：只有 OpenAI 兼容那条路认 reasoning_content；这条协议用「静默想」覆盖思考期。
      reasoning: () => { throw new Error("fixture: reasoning steps are only wired for openai-compatible and anthropic"); },
      text: (delta: string) => { ensure(); text += delta; event("response.output_text.delta", { output_index: 0, content_index: 0, item_id: "msg-fixture", delta }); },
      finish: (reason: "stop" | "length") => {
        ensure();
        event("response.output_item.done", { output_index: 0, item: item("completed") });
        event(reason === "length" ? "response.incomplete" : "response.completed", { response: { id: "resp-fixture",
          status: reason === "length" ? "incomplete" : "completed", output: [item("completed")],
          ...(reason === "length" ? { incomplete_details: { reason: "max_output_tokens" } } : {}),
          usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 } } });
      },
      endWithoutFinish: () => undefined,
      sseError: (error: Record<string, unknown>) => event("error", { ...error }),
    };
  }
  const chunk = (delta: Record<string, unknown>, finish: string | null = null) => send({ id: "chatcmpl-fixture",
    object: "chat.completion.chunk", created: 1, model, choices: [{ index: 0, delta, finish_reason: finish }] });
  return {
    open: () => chunk({ role: "assistant", content: "" }),
    reasoning: (text: string) => chunk({ reasoning_content: text }),
    text: (text: string) => chunk({ content: text }),
    finish: (reason: "stop" | "length") => {
      chunk({}, reason);
      send({ id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model, choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } });
      res.write("data: [DONE]\n\n");
    },
    endWithoutFinish: () => res.write("data: [DONE]\n\n"),
    sseError: (error: Record<string, unknown>) => send({ error }),
  };
}
