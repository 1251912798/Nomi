// Agent lane · bash 的 OS 级沙箱。**照 pi 自带的 sandbox 示例接，不自研。**
//
// 用户 2026-09-07 原话：「沙箱机制它肯定有设计，权限设计里肯定有，直接把它抄过来应该就够了」。
// pi 的示例（`pi-coding-agent/examples/extensions/sandbox/index.ts`）用的是
// `@anthropic-ai/sandbox-runtime`（macOS `sandbox-exec` / Linux `bubblewrap` / Windows alpha），
// 这里接的就是同一个包、同一个 `BashOperations` 插槽——我们出的只有**策略**（allowWrite 是哪个
// 目录、denyRead 是哪些路径），执行一行都不写。
//
// ── 这里和 pi 示例的差别，以及每一处的领域理由 ──
//
//   · pi 示例把配置读自 `.pi/sandbox.json`（用户可编辑）。**我们不读任何用户可编辑的沙箱配置**：
//     Nomi 的用户是创作者，不是要调 seatbelt 策略的人；一个能被编辑的 `allowWrite` 等于把
//     「越界要问」这条闸留了一个纯文本后门。策略从项目根 derive，一处生成（`sandboxPolicyFor`）。
//   · pi 示例整个替换内建 `bash` 工具；我们只换 `operations`（`BashToolOptions.operations`，
//     `core/tools/bash.d.ts:56-68`），pi 的 schema、截断、渲染、system-prompt 贡献全部留着。
//   · pi 示例把超时按秒传给 `setTimeout`；我们把它接到 3c 契约的 `execution.timeoutMs`。
//   · 平台不支持时 pi 示例只 `notify` 一声继续跑**没有沙箱的 bash**；我们把这件事变成
//     `active:false` 交给策略层——第 ① 档（自动放行）整档消失、全部落回要人点头
//     （`codingCommandPolicy.ts` 头部：这一档的全部理由就是「在沙箱里」）。
//
// ── 为什么 Windows 上不假装有沙箱 ──
//
// 0.0.75 的 Windows 支持是 **alpha**，且要一次**提权**的 `npx @anthropic-ai/sandbox-runtime
// windows-install`（建 `srt-sandbox` 本地账户 + 装 WFP 出网过滤器）。我们不会替用户提权，
// 所以那台机器上 `active` 就是 `false`，UI 明标「此平台无系统级沙箱」。R29 文档 §5 有实核表。
import { spawn } from 'node:child_process';
import path from 'node:path';

/** pi 的 `BashOperations` 结构镜像（只镜像我们要实现的那一个方法，不 import 它的类型进 CJS 侧）。 */
export interface LaneBashOperations {
  exec(
    command: string,
    cwd: string,
    options: {
      onData: (data: Buffer) => void
      signal?: AbortSignal
      timeout?: number
      env?: NodeJS.ProcessEnv
    },
  ): Promise<{ exitCode: number | null }>
}

export interface LaneSandboxPolicy {
  /** 唯一可写的地方 = 项目目录（外加临时目录，编译器/打包器要用）。 */
  readonly allowWrite: readonly string[]
  /** 读也不给的路径。第一道在 OS 层，第二道在 `codingCommandPolicy` 的硬清单（两层失效原因不同）。 */
  readonly denyRead: readonly string[]
  /** 写不给的路径，即使它落在 allowWrite 里面。 */
  readonly denyWrite: readonly string[]
  /** 允许出网的域名。**默认空 = 全拒**；技能声明的域名进来之后仍然要过 `codingCommandPolicy` 的确认。 */
  readonly allowedDomains: readonly string[]
}

export interface LaneSandbox {
  /** 这一刻沙箱是不是真在生效。策略层拿它决定第 ① 档存不存在。 */
  readonly active: boolean
  /** 不 active 时的人话原因（进 UI 的「此平台无系统级沙箱」那句话旁边）。 */
  readonly inactiveReason?: string
  /** 交给 `createBashTool(cwd, { operations })` 的那个插槽。 */
  readonly operations: LaneBashOperations
  close(): Promise<void>
}

/**
 * 策略从项目根 derive，**一处生成**。
 *
 * `denyRead` 的三族：用户的密钥（SSH/云/GPG/npm/pypi/k8s）、Nomi 自己的设置与密钥存储、
 * 以及 pi 的会话目录（转录里有用户原稿，模型不该经由 shell 再读一遍自己的上下文）。
 */
export function sandboxPolicyFor(input: {
  projectDir: string
  settingsRoot: string
  allowedDomains?: readonly string[]
}): LaneSandboxPolicy {
  const projectDir = path.resolve(input.projectDir);
  return {
    allowWrite: [projectDir, '/tmp'],
    denyRead: [
      '~/.ssh', '~/.aws', '~/.gnupg', '~/.netrc', '~/.npmrc', '~/.pypirc',
      '~/.config/gcloud', '~/.kube', '~/.docker/config.json',
      path.resolve(input.settingsRoot),
    ],
    // `.env` 与私钥即使在项目里也不许写——覆盖它们是「悄悄换掉一个凭据」，
    // 而那件事没有任何创作理由（形状照 pi 示例的 `denyWrite`，清单是我们的）。
    denyWrite: ['.env', '.env.*', '*.pem', '*.key', '.git/config', '.git/hooks'],
    allowedDomains: input.allowedDomains ?? [],
  };
}

/** `SandboxManager` 的最小结构面。写成接口是为了让单测能喂一个假的，而不必真起 seatbelt。 */
export interface SandboxManagerLike {
  isSupportedPlatform(): boolean
  initialize(config: unknown): Promise<void>
  wrapWithSandbox(command: string): Promise<string>
  reset(): Promise<void>
}

/**
 * 起一个沙箱。**失败不抛**——它返回一个 `active:false` 的沙箱。
 *
 * 为什么不抛：抛出去的后果是整条 lane 开不起来，于是「这台机器没有沙箱」这件事的症状是
 * 「Agent 坏了」。而正确的产品行为是「Agent 能用，只是每条命令都要你点一下，并且明着告诉你为什么」
 * （D4：缺口明着标，不藏不糊弄）。fail-closed 落在**策略层**，不落在装配层。
 */
export async function openLaneSandbox(
  policy: LaneSandboxPolicy,
  deps: { manager: SandboxManagerLike; localOperations: LaneBashOperations },
): Promise<LaneSandbox> {
  if (!deps.manager.isSupportedPlatform()) {
    return inactive(deps.localOperations, `No OS-level sandbox on ${process.platform}.`);
  }
  try {
    await deps.manager.initialize({
      network: { allowedDomains: [...policy.allowedDomains], deniedDomains: [] },
      filesystem: {
        denyRead: [...policy.denyRead],
        allowWrite: [...policy.allowWrite],
        denyWrite: [...policy.denyWrite],
      },
    });
  } catch (cause) {
    return inactive(deps.localOperations, `Sandbox initialization failed: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  return {
    active: true,
    operations: sandboxedOperations(deps.manager),
    close: async () => { await deps.manager.reset().catch(() => undefined); },
  };
}

function inactive(localOperations: LaneBashOperations, reason: string): LaneSandbox {
  return {
    active: false,
    inactiveReason: reason,
    // 仍然给 operations：`active:false` 不等于「不能跑命令」，等于「每条都要人点头」。
    // 没有沙箱又不许跑，这台机器上的技能脚本就一条都用不了——那是把缺口变成了功能缺失。
    operations: localOperations,
    close: async () => undefined,
  };
}

/**
 * pi 示例那段 `createSandboxedBashOps` 的等价物。
 *
 * 逐行对照过示例（`examples/extensions/sandbox/index.ts` 的同名函数），只改了三处：
 *   · 超时按**毫秒**收（我们的契约是 `execution.timeoutMs`），进 `setTimeout` 前不再乘 1000；
 *   · `env` 由调用方给（`spawnHook` 已经把 key 类变量摘干净了），不再原样继承 `process.env`；
 *   · 超时/中止的 `reject` 正文改成模型能自纠的一句话，不是 `timeout:30`。
 */
function sandboxedOperations(manager: SandboxManagerLike): LaneBashOperations {
  return {
    async exec(command, cwd, { onData, signal, timeout, env }) {
      const wrapped = await manager.wrapWithSandbox(command);
      return await new Promise((resolve, reject) => {
        const child = spawn('bash', ['-c', wrapped], {
          cwd,
          // `detached` 是为了拿到进程**组**——超时要杀的是整棵树，不是那一个 bash。
          // 少了它，`node build.js` 会在 bash 被杀之后继续跑（pi 示例同样这么做）。
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          ...(env ? { env } : {}),
        });
        let timedOut = false;
        const killTree = () => {
          if (!child.pid) return;
          try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
        };
        const timer = timeout && timeout > 0
          ? setTimeout(() => { timedOut = true; killTree(); }, timeout)
          : undefined;
        child.stdout?.on('data', onData);
        child.stderr?.on('data', onData);
        child.on('error', (error) => { if (timer) clearTimeout(timer); reject(error); });
        signal?.addEventListener('abort', killTree, { once: true });
        child.on('close', (code) => {
          if (timer) clearTimeout(timer);
          signal?.removeEventListener('abort', killTree);
          if (signal?.aborted) { reject(new Error('The command was cancelled.')); return; }
          if (timedOut) {
            reject(new Error(
              `The command was killed after ${timeout} ms. Split it into smaller steps, or run the long part `
              + 'in the background and check its output file with a second command.'));
            return;
          }
          resolve({ exitCode: code });
        });
      });
    },
  };
}
