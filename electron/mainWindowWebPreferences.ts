/**
 * [INPUT]: 依赖 node:path
 * [OUTPUT]: 对外提供 mainWindowWebPreferences(mainDir)：主窗口 BrowserWindow 的 webPreferences（preload 入口、隔离开关）
 * [POS]: 主窗口与 preload 之间契约的唯一出处：安全开关（contextIsolation / nodeIntegration / sandbox）原样照搬 main.ts 旧值。
 *        从 main.ts 拆出来：main.ts 是 R9 白名单巨壳（只减不增）。（3D-BOX 开关证明 2026-10-16 随开关删除。）
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import path from "node:path";
import type { WebPreferences } from "electron";

export function mainWindowWebPreferences(mainDir: string): WebPreferences {
  return {
    preload: path.join(mainDir, "preload.js"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
  };
}
