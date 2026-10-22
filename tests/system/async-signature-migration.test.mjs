import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 同步改异步的函数，所有调用方（含测试、脚本）都要跟着 await。tsc 只管 src/ 和 electron/ 的类型，
// 看不到 tests/ 里的 .mjs，漏迁移的调用会把 Promise 当结果用（V-plibrary F3：跨设备续作合同测试两条红）。
// 按名字扫「把返回值当结果用」的调用形态：`= NAME(`、`expect(NAME(`、`NAME(...).属性`。新增迁移就把名字加进 MIGRATED。
const MIGRATED = [
  "inspectWorkspaceSync",
  "readWorkspaceSyncState",
  "listWorkspaceProjects",
  "listProjects",
  "listAllProjects",
  "listLocalProjects",
  "saveWorkflowFromProject",
  "readWorkspaceManifestSnapshotAsync",
];
const ROOTS = ["tests", "electron", "src", "scripts"];
const FILE = /\.(?:mjs|cjs|ts|tsx|js)$/;
const SKIP = new Set(["node_modules", "dist", "dist-electron", "artifacts", "perf-results"]);

function files(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files(full, out);
    else if (FILE.test(entry.name)) out.push(full);
  }
  return out;
}

const names = MIGRATED.join("|");
const awaited = new RegExp(String.raw`await\s+\(*\s*(?:${names})\(`, "g");
const misuse = new RegExp(
  String.raw`(?:=\s*|expect\(\s*)(?<![\w.])(?:${names})\(` + "|" + String.raw`(?<![\w.])(?:${names})\([^()]*(?:\([^()]*\)[^()]*)*\)\.(?!then|catch|finally)`,
);

describe("同步改异步的函数：调用方都 await 了", () => {
  it("没有把 Promise 当结果用的调用", () => {
    const offenders = [];
    for (const root of ROOTS) {
      for (const file of files(path.join(process.cwd(), root))) {
        if (file.endsWith("async-signature-migration.test.mjs")) continue;
        fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line, index) => {
          if (line.includes("promise-held")) return; // 有意持有 Promise（先放着、之后再 await）
          const code = line.replace(/\/\/.*$/, "");
          if (/\bfunction\b/.test(code) || /^\s*(?:import|export)\b/.test(code)) return; // 定义 / 导入本身
          if (misuse.test(code.replace(awaited, "AWAITED("))) offenders.push(`${path.relative(process.cwd(), file)}:${index + 1}  ${line.trim()}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
