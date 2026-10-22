// 调用方矩阵测试的共享状态（无任何 import：vi.mock 的工厂从这里取，避免工厂与被测模块图互等）。
import type { EventEmitter } from "node:events";

export type Sender = EventEmitter & { id: number; isDestroyed: () => boolean };
export type Handler = (event: { sender: Sender }, payload?: unknown) => unknown;
export type StreamEvent = { type?: string; delta?: string; message?: string; result?: unknown };

export const harnessState = {
  handlers: new Map<string, Handler>(),
  selections: new Map<string, { vendor: unknown; model: unknown; apiKey: string }>(),
  events: new Map<string, StreamEvent[]>(),
  listeners: new Set<() => void>(),
};

/** 一张 1×1 PNG：拆解的 3 帧都是本机素材（nomi-local），读字节走 readNomiLocalAsset 的契约形状。 */
export const FIXTURE_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

export const electronMock = () => ({
  ipcMain: { handle: (name: string, fn: Handler) => harnessState.handlers.set(name, fn) },
  webContents: {
    fromId: () => ({ isDestroyed: () => false, send: (_channel: string, payload: { streamId: string; event: StreamEvent }) => {
      const list = harnessState.events.get(payload.streamId) ?? [];
      list.push(payload.event);
      harnessState.events.set(payload.streamId, list);
      for (const listener of [...harnessState.listeners]) listener();
    } }),
  },
});

export const localAssetMock = () => ({
  readNomiLocalAsset: (url: string) => url.startsWith("nomi-local://frame") ? { bytes: FIXTURE_PNG, contentType: "image/png" } : null,
});

export const runtimeMock = () => ({
  billingKindForTaskKind: () => "text",
  findExecutableModelForTask: (vendorKey: string) => {
    const selection = harnessState.selections.get(vendorKey);
    if (!selection) throw new Error(`fixture vendor not registered: ${vendorKey}`);
    return selection;
  },
});
