// 浏览器「提取提示词」从真入口走完整条真路（特征测试）：
// 渲染层 runBrowserPromptExtractionToLibrary → 真 preload 桥 → 真主进程 IPC handler（真发送方守卫）
// → 真 runtime 准入（TOKEN_ADMISSION → consumeTaskSpend → assertAndConsumeQuotedSpend）→ 真执行器 → 真 HTTP（本机假上游，零额度、不出网）。
// 只换掉：Electron 的 IPC 传输（进程内转发，rejection 照 Electron 包一层）、目录（一条假的文本模型）、提示词库落盘。
//
// 这一份钉的是**现状**（修前）：提取在主进程付费闸被拒，供应商 0 次、不进库、不弹卡。
// 修法见 docs/plan/2026-10-27-browser-extract-grant.md：落地时这一格翻成「弹一张写清读哪张图的卡 → 确认 → 供应商恰好 1 次、
// 令牌核销一次、进库」，并补上卡上取消 / 网页伪造 / 不可信发送方 / 卡在时再点 四格（同卡 ★9 第 1–5 条）。
// 期望行为在修前跑的红灯输出存在 docs/evidence/2026-10-27-browser-extract-grant/extract-ipc-before.txt。
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (event: unknown, payload?: unknown) => unknown;
type Listener = (...args: unknown[]) => void;

const harness = vi.hoisted(() => {
  /** 最小 webContents：守卫要的 id / mainFrame / getURL，taskIpcHandlers 要的 once / removeListener。 */
  class FakeWebContents {
    readonly mainFrame = { routingId: 1 };
    private readonly listeners = new Map<string, Set<Listener>>();
    constructor(readonly id: number, public url: string) {}
    isDestroyed(): boolean { return false; }
    getURL(): string { return this.url; }
    send(): void {}
    once(name: string, listener: Listener): this { (this.listeners.get(name) ?? this.listeners.set(name, new Set()).get(name)!).add(listener); return this; }
    on(name: string, listener: Listener): this { return this.once(name, listener); }
    removeListener(name: string, listener: Listener): this { this.listeners.get(name)?.delete(listener); return this; }
  }
  class FakeBrowserWindow {
    static readonly byContents = new Map<FakeWebContents, FakeBrowserWindow>();
    readonly webContents: FakeWebContents;
    constructor(readonly id: number, url: string) {
      this.webContents = new FakeWebContents(id, url);
      FakeBrowserWindow.byContents.set(this.webContents, this);
    }
    isDestroyed(): boolean { return false; }
    once(): this { return this; }
    static fromWebContents(contents: FakeWebContents): FakeBrowserWindow | null { return FakeBrowserWindow.byContents.get(contents) ?? null; }
  }
  // 主窗口（真守卫 assertTrustedSender 只认它的主帧）。
  const mainWindow = new FakeBrowserWindow(1, "file:///app/index.html");
  const eventFrom = (sender: FakeWebContents) => ({ sender, senderFrame: { routingId: sender.mainFrame.routingId, url: sender.getURL() } });
  return {
    FakeBrowserWindow,
    mainWindow,
    eventFrom,
    handlers: new Map<string, Handler>(),
    upstreamBaseURL: "",
    rendererDecisions: [] as unknown[],
    rendererErrors: [] as unknown[],
  };
});

vi.mock("electron", () => ({
  app: { getPath: () => process.cwd(), getAppPath: () => process.cwd(), on: () => undefined },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: (value: string) => Buffer.from(value), decryptString: (value: Buffer) => value.toString() },
  BrowserWindow: harness.FakeBrowserWindow,
  webUtils: { getPathForFile: () => "" },
  ipcMain: { handle: (channel: string, fn: Handler) => harness.handlers.set(channel, fn), on: () => undefined },
  webContents: { fromId: () => undefined, getAllWebContents: () => [] },
  ipcRenderer: {
    // Electron 把主进程 handler 的 rejection 包成这一句交给渲染层；原错误挂在 cause 上，供断言看清拒在哪一层。
    invoke: async (channel: string, payload: unknown) => {
      const handler = harness.handlers.get(channel);
      if (!handler) throw new Error(`No handler registered for '${channel}'`);
      try {
        return await handler(harness.eventFrom(harness.mainWindow.webContents), payload);
      } catch (error) {
        const inner = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        throw new Error(`Error invoking remote method '${channel}': ${inner}`, { cause: error });
      }
    },
    on: () => undefined,
    removeListener: () => undefined,
    send: () => undefined,
  },
}));

// 主进程：目录只有一条启用着的文本模型，指向本机假上游；其余（准入、钱闸、执行器、错误编码）全是真的。
vi.mock("../../events/vendorCallTrace", () => ({ traceVendorCompleted: () => undefined, traceVendorRequested: () => undefined }));
vi.mock("../../catalog/validateCandidateCredential", () => ({ revalidatePendingCredential: async () => undefined }));
vi.mock("../../catalog/executableModel", () => {
  const selection = () => ({
    vendor: { key: "fixture-text", name: "fixture", enabled: true, baseUrlHint: harness.upstreamBaseURL, providerKind: "openai-compatible", authType: "bearer" },
    model: { modelKey: "fixture-model", vendorKey: "fixture-text", kind: "text", enabled: true },
    apiKey: "sk-fixture-key",
    customConfig: {},
  });
  return { findExecutableModel: selection, findExecutableModelForTask: selection };
});
vi.mock("../../catalog/catalogStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../catalog/catalogStore")>()),
  readCatalog: () => ({ vendors: [], models: [], mappings: [], apiKeysByVendor: {} }),
}));
// 问人的那一步（主进程 → 渲染层的付费确认卡）：记下每一次弹卡请求，缺省回「没确认」。
vi.mock("../../capabilityCore/rendererBridge", () => ({
  requestRendererDecision: async (kind: string, payload: unknown) => {
    harness.rendererDecisions.push({ kind, payload });
    return { confirmed: false };
  },
}));

// 渲染层：桥就是真 preload 的 tasks / browser 面（频道名一字不差）；提示词库落盘换成记录。
const library = vi.hoisted(() => ({ saved: [] as unknown[] }));
vi.mock("../../../src/desktop/bridge", async () => {
  const [{ runtimeBridge }, { mediaBridge }] = await Promise.all([import("../../preload/runtimeBridge"), import("../../preload/mediaBridge")]);
  return { getDesktopBridge: () => ({ tasks: runtimeBridge.tasks, browser: mediaBridge.browser }) };
});
vi.mock("../../../src/workbench/api/promptLibraryApi", () => ({
  getTextBrain: async () => ({ vendor: "fixture-text", modelKey: "fixture-model" }),
  addUserPrompt: async (entry: unknown) => { library.saved.push(entry); },
}));
vi.mock("../../../src/desktop/rendererLog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/desktop/rendererLog")>()),
  logRendererError: (_event: string, error: unknown) => { harness.rendererErrors.push(error); },
}));

import { startTextUpstream, reply } from "../../../tests/fixtures/textTasks/textUpstream";
import * as runtime from "../../runtime";
import { setMainWindow } from "../../appWindowRegistry";
import { registerTaskIpcHandlers } from "../../tasks/taskIpcHandlers";
import { runBrowserPromptExtractionToLibrary } from "../../../src/ui/browser/prompt/browserPromptExtractionRunner";

let upstream: Awaited<ReturnType<typeof startTextUpstream>>;

/** 拒在哪一层：渲染层收到的那句 + 主进程原错误的名字与最靠前的仓库内栈帧（只留文件，不留行号，免得无关改动把它挪红）。 */
function describeFailure(error: unknown): { message: string; cause?: string; files?: string[] } | undefined {
  if (!(error instanceof Error)) return error === undefined ? undefined : { message: String(error) };
  const cause = error.cause instanceof Error ? error.cause : undefined;
  const files = cause?.stack?.split("\n")
    .map((line) => line.match(/((?:electron|src)\/[^):]+?\.ts):\d+/)?.[1])
    .filter((file): file is string => Boolean(file))
    .filter((file, index, all) => all.indexOf(file) === index)
    .slice(0, 3);
  return { message: error.message, ...(cause ? { cause: `${cause.name}: ${cause.message}`, files } : {}) };
}

const request = { requestId: "capture-1", sourceType: "image" as const, modelImageUrl: "data:image/png;base64,iVBORw0KGgo=", title: "Test reference" };

beforeAll(async () => {
  upstream = await startTextUpstream("openai-compatible", () => reply.text(JSON.stringify({ title: "Saved reference", prompt: "A quiet harbor at dawn, soft fog" })));
  harness.upstreamBaseURL = upstream.baseURL;
  // 生产装配：任务 IPC（nomi:tasks:run 一次性门）照 main.ts 注册。
  registerTaskIpcHandlers(async () => runtime, async () => { throw new Error("canvas core is not part of this test"); });
});
afterAll(async () => { await upstream.close(); });
beforeEach(() => {
  setMainWindow(harness.mainWindow as never);
  upstream.requests.length = 0;
  library.saved.length = 0;
  harness.rendererDecisions.length = 0;
  harness.rendererErrors.length = 0;
});
afterEach(() => setMainWindow(null));

describe("浏览器提取提示词：从真入口到本机假上游（现状，修前）", () => {
  it("点「提取」：走 nomi:tasks:run 一次性门，在主进程付费闸被拒（没人铸令牌）；供应商 0 次、不进库、不弹卡", async () => {
    const present = vi.fn();
    await runBrowserPromptExtractionToLibrary(request, present, null);
    expect({ upstreamRequests: upstream.requests.length, failure: describeFailure(harness.rendererErrors.at(-1)) }).toEqual({
      upstreamRequests: 0,
      failure: {
        message: "Error invoking remote method 'nomi:tasks:run': SpendNotAuthorizedError: Authorization expired or does not cover this target; confirm again",
        cause: "SpendNotAuthorizedError: Authorization expired or does not cover this target; confirm again",
        // 拒在哪：spendGrant.assertAndConsumeQuotedSpend ← tasks/taskSpend.consumeTaskSpend ← runtime.runTask 的文本分支。
        files: ["electron/spendGrant.ts", "electron/tasks/taskSpend.ts", "electron/runtime.ts"],
      },
    });
    expect(library.saved).toEqual([]);
    expect(harness.rendererDecisions).toEqual([]);
    // 渲染层把失败原样报回发起提取的那个标签页（最后一句 = 失败提示），不弹全局通知。
    expect(present).toHaveBeenCalledTimes(2);
  });
});
