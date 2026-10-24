# 方向检查：门岗起子进程前的信号窗口（2026-10-24）

触发：本刀修的是 `scripts/with-gates-lock.py` 的同一共享边界，采用“换”而不是在每个入口补一个特例。

## 一句话根因

`execute()` 先调用 `Popen()`、后安装 `SIGTERM` / `SIGINT` 处理函数，导致信号落在子进程已脱离而 wrapper 尚未接管的窗口里；wrapper 被杀后，子进程继续持有继承的锁描述符。

## 结构决定

把处理函数安装移到 `Popen()` 之前，并让处理函数在 child 尚未赋值时只记录待处理信号；`Popen()` 返回后立即重放该信号，复用现有 Windows `terminate` / POSIX `killpg` 分支。删除旧的 post-Popen 安装顺序，不加 sleep、重试或 fallback。

## 证据

新增测试在进程内包住真实 `Popen()`：一条断言起进程时 `SIGTERM` 已不是 `SIG_DFL`，另一条在真实子进程启动后立即给当前进程发 `SIGTERM`，断言返回 143、子进程组消失且下一次准入成功。把处理函数移回 `Popen()` 之后时，两条测试都红。
