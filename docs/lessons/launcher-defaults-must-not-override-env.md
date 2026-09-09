# 启动器默认值不能覆盖调用配置

> 教训 · 2026-09-09 · 状态：现行
> 触发：打包 MCP initialize/tools/list 正常，resources/list 超时；或启动器与子进程共享目录。

先打印 GUI 实际环境和 helper 读的目录。设置过 NOMI_CAPABILITY_DIR 不等于进程收到它：共享启动器曾另建 tempRoot，并把派生 capabilityDir 放在 extraEnv 后覆盖。GUI advert/token 与 helper 分家，首个 invoke 落在发现/冷启等待，15s 超时不能据此归咎 lane。

在共享 launchNomiApp 边界统一解析：显式参数 > 调用 env > 继承 env > 隔离派生。mkdir、GUI env、返回 handle 都消费同一个值。不要要求每个调用者改传参绕过坏默认值，也不要增加 timeout。

证据：2026-09-09 同一 switch-gate 现成包，修前 GUI=`packaged-mcp-smoke-m3ODIw/capability`，helper=`nomi-packaged-mcp-smoke-vTGpCm/capability`，claude resources/list 15s 超时；修后目录一致，25 tools / 34 resources，三签名身份通过，未签名写拒绝。

防复发：`scripts/e2e-launch-capability.node-test.mjs` 直接调用真实启动器，仅 mock Electron spawn，验证实际 env、返回目录与 mkdir；由 `check:e2e-launch` 在 contracts 每次执行。env 与继承 env 两例先红，修后全绿。

相关：[隔离实例的 key / 设置组装三坑](iso-walkthrough-key-seeding-traps.md)。
