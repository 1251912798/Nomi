import { makeTempDir } from './_test-temp.mjs'
// check-push-bypass.node-test.mjs
// 回归测试：验证 check:push-bypass 门岗的核心判定逻辑。
//
// 测试的不变量：
//   1. 日志不存在 → 直接通过（exit 0）
//   2. 所有行 confirmed=yes → 通过
//   3. 有 confirmed=no → 报红（exit 1）
//   4. --accept <sha> 把 confirmed=no 改为 confirmed=yes
//   5. --clear-confirmed 删除已确认的行
//   6. 判决不读任何本机凭据（2026-10-24 本机门岗戳删除后）：那棵树里有同一 SHA 的旧戳也不自动确认
//      （有戳不算数），已确认的记录在没有任何戳时照样通过（没戳也不因此判红）——戳在不在，判决逐条相同
//
// 隔离方式：通过 NOMI_BYPASS_LOG_OVERRIDE 指向临时目录，不污染真实仓库的 .claude/push-bypass.log

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "check-push-bypass.mjs"
);

function runGate(args, bypassLogPath) {
  const env = { ...process.env }
  if (bypassLogPath != null) {
    env.NOMI_BYPASS_LOG_OVERRIDE = bypassLogPath
  }
  const result = spawnSync("node", [scriptPath, ...args], {
    env,
    encoding: "utf8",
  });
  return { exit: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

function makeLogDir() {
  const dir = makeTempDir("bypass-test-")
  const logPath = path.join(dir, "push-bypass.log")
  return { dir, logPath, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

test("no bypass log → pass (exit 0)", () => {
  const { dir, logPath, cleanup } = makeLogDir()
  try {
    // 日志文件不存在
    const { exit } = runGate([], logPath);
    assert.equal(exit, 0);
  } finally {
    cleanup()
  }
});

test("all confirmed=yes → pass (exit 0)", () => {
  const { dir, logPath, cleanup } = makeLogDir()
  try {
    fs.writeFileSync(
      logPath,
      "2026-09-03T00:00:00Z|bypass|branch=main|sha=abc123|worktree=/tmp/x|cmd=git push|confirmed=yes\n"
    );
    const { exit } = runGate([], logPath);
    assert.equal(exit, 0);
  } finally {
    cleanup()
  }
});

test("confirmed=no → fail (exit 1)", () => {
  const { dir, logPath, cleanup } = makeLogDir()
  try {
    fs.writeFileSync(
      logPath,
      "2026-09-03T00:00:00Z|bypass|branch=feat/x|sha=deadbeef1234|worktree=/tmp/nonexistent-wt-12345|cmd=git -c core.hooksPath=/dev/null push|confirmed=no\n"
    );
    const { exit, stderr } = runGate([], logPath);
    assert.equal(exit, 1, `expected exit 1, got ${exit}\nstderr: ${stderr}`);
    assert.ok(
      stderr.includes("deadbeef1234") || stderr.includes("push 绕口"),
      `stderr should mention sha or bypass: ${stderr}`
    );
  } finally {
    cleanup()
  }
});

test("--accept <sha> marks confirmed=no as confirmed=yes → then passes", () => {
  const { dir, logPath, cleanup } = makeLogDir()
  try {
    const sha = "aabbcc112233";
    fs.writeFileSync(
      logPath,
      `2026-09-03T00:00:00Z|bypass|branch=feat/y|sha=${sha}|worktree=/tmp/nonexistent-wt-12345|cmd=git --no-verify push|confirmed=no\n`
    );

    // 先报红
    const before = runGate([], logPath);
    assert.equal(before.exit, 1, `before --accept should fail: ${before.stderr}`);

    // --accept 标记
    const accept = runGate(["--accept", sha], logPath);
    assert.equal(accept.exit, 0, `--accept should exit 0: ${accept.stderr}`);

    // 再次运行应当通过
    const after = runGate([], logPath);
    assert.equal(after.exit, 0, `after --accept should pass: ${after.stderr}`);

    // 验证日志文件内容已改为 confirmed=yes
    const content = fs.readFileSync(logPath, "utf8");
    assert.ok(content.includes("confirmed=yes"), `log should contain confirmed=yes: ${content}`);
  } finally {
    cleanup()
  }
});

test("--clear-confirmed removes confirmed=yes lines → passes (empty log)", () => {
  const { dir, logPath, cleanup } = makeLogDir()
  try {
    fs.writeFileSync(
      logPath,
      [
        "2026-09-03T00:00:00Z|bypass|branch=feat/a|sha=sha1a|worktree=/tmp/x|cmd=...|confirmed=yes",
        "2026-09-03T00:00:01Z|bypass|branch=feat/b|sha=sha2b|worktree=/tmp/x|cmd=...|confirmed=yes",
      ].join("\n") + "\n"
    );

    const { exit } = runGate(["--clear-confirmed"], logPath);
    assert.equal(exit, 0, `--clear-confirmed should pass: ${exit}`);

    // 日志应为空（全部是 confirmed=yes，清完后没有行了）
    const content = fs.readFileSync(logPath, "utf8");
    assert.equal(content.trim(), "", `log should be empty after clear: '${content}'`);
  } finally {
    cleanup()
  }
});

/** 一棵真实的临时 git 仓库：路径、HEAD 与 gitdir（旧的本机门岗戳就落在 gitdir 里）。 */
function makeRepo() {
  const worktreeDir = makeTempDir("bypass-wt-");
  execFileSync("git", ["init", "--quiet"], { cwd: worktreeDir });
  execFileSync(
    "git",
    ["-c", "user.email=probe@example.com", "-c", "user.name=probe", "commit", "--allow-empty", "-m", "init", "--no-gpg-sign", "--no-verify"],
    { cwd: worktreeDir }
  );
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: worktreeDir, encoding: "utf8" }).trim();
  const gitDir = execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: worktreeDir, encoding: "utf8" }).trim();
  return { worktreeDir, sha, gitDir, cleanup: () => fs.rmSync(worktreeDir, { recursive: true, force: true }) };
}

/** 2026-10-24 之前 `pnpm run gates` 全过才盖、本门岗据此自动确认的那枚戳。这里故意种下它，证明它不再算数。 */
function plantOldStamp({ gitDir, sha, worktreeDir }) {
  fs.writeFileSync(
    path.join(gitDir, "nomi-gates-ok"),
    `sha=${sha}\nworktree=${worktreeDir}\ntier=focused\nstamped_at=2026-10-23T00:00:00Z\n`
  );
}

function bypassLine(repo, confirmed) {
  return `2026-10-24T00:00:00Z|bypass|branch=feat/z|sha=${repo.sha}|worktree=${repo.worktreeDir}|cmd=git push --no-verify|confirmed=${confirmed}\n`;
}

test("有戳也不算数：那棵树里有同一 SHA 的旧门岗戳，未确认的绕口照样报红、不自动确认", () => {
  const repo = makeRepo();
  const { logPath, cleanup } = makeLogDir()
  try {
    plantOldStamp(repo);
    const line = bypassLine(repo, "no");
    fs.writeFileSync(logPath, line);
    const { exit, stderr } = runGate([], logPath);
    assert.equal(exit, 1, `旧戳不许再自动确认：exit=${exit}\nstderr: ${stderr}`);
    assert.ok(stderr.includes(repo.sha.slice(0, 12)), `报红要点名那次绕口：${stderr}`);
    assert.equal(fs.readFileSync(logPath, "utf8"), line, "日志不许被改成 confirmed=yes");
  } finally {
    cleanup()
    repo.cleanup();
  }
});

test("没戳也不因此判红：已确认的绕口指向一棵没有任何戳的树 → 通过", () => {
  const repo = makeRepo();
  const { logPath, cleanup } = makeLogDir()
  try {
    fs.writeFileSync(logPath, bypassLine(repo, "yes"));
    const { exit, stderr } = runGate([], logPath);
    assert.equal(exit, 0, `已确认的记录不该因为没有戳而红：${stderr}`);
  } finally {
    cleanup()
    repo.cleanup();
  }
});

test("判决与戳无关：同一份日志，戳在与不在，退出码逐条相同", () => {
  const repo = makeRepo();
  const { logPath, cleanup } = makeLogDir()
  try {
    const verdict = (confirmed) => {
      fs.writeFileSync(logPath, bypassLine(repo, confirmed));
      return runGate([], logPath).exit;
    };
    const withoutStamp = ["no", "yes"].map(verdict);
    plantOldStamp(repo);
    const withStamp = ["no", "yes"].map(verdict);
    assert.deepEqual(withStamp, withoutStamp);
    assert.deepEqual(withoutStamp, [1, 0]);
  } finally {
    cleanup()
    repo.cleanup();
  }
});
