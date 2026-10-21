// 「调一次模型」核心的预热（2026-10-21，文本任务迁 pi-ai；设计卡 ★7）。
//
// 为什么要它：核心住在 pi 的 ESM 岛上，第一次用到时才装。pi-ai 的入口一装就是约 2 秒（Windows 实测，主要是模型目录），
// 于是「应用启动后第一次用文本任务」从 ai@4 时代的约 50ms 变成约 2 秒——首个可见反馈变差，协调 10-21 批准的预算不许放宽。
// 办法：主窗口加载完、过一会儿主进程空下来时把岛装好（协调 10-21 定：窗口显示后的空闲时预热，**不进打开项目的路径**）。
// 打开项目时 Agent 面板本来就要装同一个 pi-ai（laneWorkspace，open 阶段），预热只是把这份代价挪到用户还没动手的那几秒，
// 不是新增的代价。预热失败不影响任何功能：第一次真用时照常现装。
import { app, type BrowserWindow } from "electron";
import { prewarmModelCall } from "./modelCallBridge";

/** 主窗口加载完之后再等这么久：让渲染层先把首屏画完、首批 IPC 回完，再占主进程去装岛。 */
export const MODEL_CALL_PREWARM_DELAY_MS = 4_000;

export function scheduleModelCallPrewarm(window: BrowserWindow): void {
  const timer = setTimeout(() => {
    if (window.isDestroyed()) return;
    // 再让一拍：把这一刻已排队的 IPC 先处理完。
    setImmediate(() => { void prewarmModelCall().catch(() => undefined); });
  }, MODEL_CALL_PREWARM_DELAY_MS);
  timer.unref?.();
}

let installed = false;

/**
 * 挂上预热：应用的第一扇窗口（主窗口）加载完之后排一次。由文本流 IPC 注册时调用（electron/ai/textStreamIpc.ts）——
 * 不在 main.ts 里挂：那是登记过的巨壳，只减不增。只挂一次、只认第一扇窗口；后来的窗口（浏览器子窗、菜单）不再触发。
 */
export function installModelCallPrewarm(): void {
  if (installed || typeof app?.once !== "function") return;
  installed = true;
  app.once("browser-window-created", (_event, window) => {
    window.webContents.once("did-finish-load", () => scheduleModelCallPrewarm(window));
  });
}
