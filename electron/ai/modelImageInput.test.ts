// 交给模型看的图：迁到 pi-ai 后远程图由**本机**取回再内联（协调 10-21 定，D4）——「谁去取图」变了，
// 所以取图必须守住出站边界：内网 / 回环地址被拒，公网地址跳到内网也被拒（每一跳重新过外发授权）；
// CDN 跳转（公网 → 公网）照常跟；类型只收 png / jpeg / webp / gif，上限 20MB。
import { describe, expect, it, vi } from "vitest";
import type { ResolvedHostAddress } from "../hardenedFetch";
import { OutboundDestinationRefusedError } from "../networkOutboundPolicy";
import { readModelImage } from "./modelImageInput";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const pinned = () => ({ close: vi.fn(async () => {}), destroy: vi.fn(async () => {}) }) as never;
const publicHost = (hostname: string): ResolvedHostAddress[] => hostname.endsWith(".example.test")
  ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "10.0.0.8", family: 4 }];

describe("远程图本机取回：出站边界", () => {
  it("URL 直接指向内网 / 回环：被拒，一个请求都不发", async () => {
    const fetchImpl = vi.fn();
    for (const url of ["http://127.0.0.1:9/frame.png", "http://10.0.0.8/frame.png", "http://169.254.169.254/latest"]) {
      await expect(readModelImage(url, {}, { fetch: fetchImpl, resolveHost: async (host) => [{ address: host, family: 4 }],
        createPinnedDispatcher: pinned })).rejects.toBeInstanceOf(OutboundDestinationRefusedError);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("公网地址跳转到内网：第二跳被拒（每一跳重新过外发授权）", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { Location: "http://intranet.local/secret.png" } }));
    await expect(readModelImage("https://cdn.example.test/a.png", {}, { fetch: fetchImpl, resolveHost: async (host) => publicHost(host),
      createPinnedDispatcher: pinned })).rejects.toBeInstanceOf(OutboundDestinationRefusedError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("公网之间的 CDN 跳转照常跟，拿到图片字节与类型", async () => {
    const fetchImpl = vi.fn(async (url: URL) => url.hostname === "cdn.example.test"
      ? new Response(null, { status: 302, headers: { Location: "https://img.example.test/real.png" } })
      : new Response(PNG, { status: 200, headers: { "Content-Type": "image/png" } }));
    await expect(readModelImage("https://cdn.example.test/a.png", {}, { fetch: fetchImpl, resolveHost: async (host) => publicHost(host),
      createPinnedDispatcher: pinned })).resolves.toMatchObject({ mimeType: "image/png" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gif 收，svg 不收（类型白名单：png / jpeg / webp / gif）", async () => {
    const respond = (type: string) => vi.fn(async () => new Response(PNG, { status: 200, headers: { "Content-Type": type } }));
    const deps = (fetchImpl: ReturnType<typeof respond>) => ({ fetch: fetchImpl, resolveHost: async (host: string) => publicHost(host), createPinnedDispatcher: pinned });
    await expect(readModelImage("https://img.example.test/a.gif", {}, deps(respond("image/gif")))).resolves.toMatchObject({ mimeType: "image/gif" });
    await expect(readModelImage("https://img.example.test/a.svg", {}, deps(respond("image/svg+xml")))).rejects.toThrow();
  });
});

describe("本机素材与内联图", () => {
  it("data: URI 原样解码；不是图的 data: 拒收", async () => {
    await expect(readModelImage(`data:image/png;base64,${PNG.toString("base64")}`)).resolves.toMatchObject({ mimeType: "image/png" });
    await expect(readModelImage("data:text/html;base64,PGgxPg==")).rejects.toThrow();
  });

  it("不认识的地址形状拒收", async () => {
    await expect(readModelImage("file:///C:/Windows/win.ini")).rejects.toThrow(/Unsupported image address/);
  });
});
