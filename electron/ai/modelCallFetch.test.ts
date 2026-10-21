// 失败留证不漏密钥（协调 10-21 硬要求）：key 放在查询串、放在请求头、被服务商原样回显进响应体——
// 三种情况下 logVendorCall、开发终端日志、交给错误分类的那份事实里都不许出现它。
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

const logged = vi.hoisted(() => ({ calls: [] as unknown[], dev: [] as string[] }));
vi.mock("../logging/logger", () => ({
  logVendorCall: (summary: unknown) => logged.calls.push(summary),
  logDevDetail: (_scope: string, detail: string) => logged.dev.push(detail),
}));

import { observeModelFetch, urlWithoutQuery } from "./modelCallFetch";

const KEY = "sk-live-0123456789abcdefSECRET";
let server: http.Server | undefined;
afterEach(async () => {
  logged.calls.length = 0;
  logged.dev.length = 0;
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function echoingUpstream(status: number): Promise<string> {
  server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      // 最坏的服务商：把收到的鉴权头和地址原样写进错误体。
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `bad key ${req.headers.authorization ?? ""} at ${req.url}` } }));
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function everythingRecorded(failure: unknown): string {
  return JSON.stringify({ calls: logged.calls, dev: logged.dev, failure });
}

describe("模型调用的失败留证", () => {
  it("key 在查询串里：事实里的地址去掉了查询串，日志与原话里都没有 key", async () => {
    const origin = await echoingUpstream(401);
    const observed = observeModelFetch(globalThis.fetch, { modelId: "m" });
    const response = await observed.fetch(`${origin}/v1/chat/completions?key=${KEY}`, { method: "POST", body: "{}" });
    expect(response.status).toBe(401);
    const failure = observed.failure();
    expect(failure).toMatchObject({ status: 401, url: `${origin}/v1/chat/completions` });
    expect(everythingRecorded(failure)).not.toContain(KEY);
    expect(logged.calls).toEqual([expect.objectContaining({ status: 401, model: "m" })]);
  });

  it("key 在请求头里（Bearer）：服务商把它回显进错误体，也被抹掉", async () => {
    const origin = await echoingUpstream(403);
    const observed = observeModelFetch(globalThis.fetch, { modelId: "m" });
    await observed.fetch(`${origin}/v1/chat/completions`, { method: "POST", body: "{}", headers: { Authorization: `Bearer ${KEY}` } });
    const failure = observed.failure();
    expect(failure?.body).toContain("bad key");
    expect(everythingRecorded(failure)).not.toContain(KEY);
  });

  it("调用方手里那把 key（knownSecrets）出现在任何位置都抹掉", async () => {
    const origin = await echoingUpstream(500);
    const observed = observeModelFetch(globalThis.fetch, { modelId: "m", knownSecrets: [KEY] });
    await observed.fetch(`${origin}/v1/x/${KEY}`, { method: "POST", body: "{}" });
    expect(everythingRecorded(observed.failure())).not.toContain(KEY);
  });

  it("成功的调用不留证、不记失败", async () => {
    server = http.createServer((_req, res) => res.end("{}"));
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const observed = observeModelFetch(globalThis.fetch, { modelId: "m" });
    await observed.fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/ok`);
    expect(observed.failure()).toBeNull();
    expect(logged.calls).toEqual([]);
  });

  it("地址去查询串、去账号密码段", () => {
    expect(urlWithoutQuery("https://u:p@host.example/v1/x?key=1#h")).toBe("https://host.example/v1/x");
  });
});
