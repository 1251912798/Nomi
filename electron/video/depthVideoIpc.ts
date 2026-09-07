/**
 * 深度视频节点 —— IPC 边界。
 *
 * 五个 renderer→main 的 invoke（prepare / readFrames / writeFrames / finish / cancel）
 * 加一条 main→renderer 的进度推送（prepare 期间的下载与抽帧，那两段渲染层看不见）。
 * 每个 handler 第一句都是 `assertTrustedSender`，重活模块用动态 import 留在启动路径之外
 * ——与 videoIpc.ts 同一套约定。
 */
import { ipcMain, type WebContents } from "electron";
import { assertTrustedSender } from "../ipcSenderGuard";

export const VIDEO_DEPTH_EVENT_CHANNEL = "nomi:video-depth:event";

function forward(sender: WebContents, payload: unknown): void {
  if (sender.isDestroyed()) return;
  sender.send(VIDEO_DEPTH_EVENT_CHANNEL, payload);
}

export function registerVideoDepthIpc(): void {
  ipcMain.handle("nomi:video-depth:prepare", async (event, payload) => {
    assertTrustedSender(event);
    const { prepareVideoDepthJob } = await import("./depthVideoJob");
    const sender = event.sender;
    return prepareVideoDepthJob(payload, (progress) => forward(sender, progress));
  });

  ipcMain.handle("nomi:video-depth:read-frames", async (event, payload) => {
    assertTrustedSender(event);
    const { readVideoDepthFrames } = await import("./depthVideoJob");
    return { frames: readVideoDepthFrames(payload) };
  });

  ipcMain.handle("nomi:video-depth:write-frames", async (event, payload) => {
    assertTrustedSender(event);
    const { writeVideoDepthFrames } = await import("./depthVideoJob");
    await writeVideoDepthFrames(payload);
    return { ok: true };
  });

  ipcMain.handle("nomi:video-depth:finish", async (event, payload) => {
    assertTrustedSender(event);
    const { finishVideoDepthJob } = await import("./depthVideoJob");
    return finishVideoDepthJob(payload);
  });

  ipcMain.handle("nomi:video-depth:cancel", async (event, payload) => {
    assertTrustedSender(event);
    const { cancelVideoDepthJob } = await import("./depthVideoJob");
    return cancelVideoDepthJob(payload);
  });
}
