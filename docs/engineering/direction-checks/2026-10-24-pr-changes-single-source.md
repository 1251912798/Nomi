# 方向检查：PR 改动取数单一来源

### 0. 一句话根因

推送前判据和合并前扫描各自拼了一套 git diff，导致同一台机器的 git 配置可以让两边看到不同的改动。

### 1. 命中什么

命中自写登记 `gate-family`，近 30 天第 86 个 fix。文件本身没有命中，触发来自登记口径。

### 2. 为什么这一刀是换不是补

推送前和合并前两个消费方都要同一份 PR diff；把推送前三处各自取数删掉，改成调用 `scripts/lib/prChanges.mjs` 的同一个函数，单一边界同时钉住格式参数和结果形状。

### 3. 为什么现在换不成现成方案

四类判据是 Nomi 的领域规则，不能交给通用 diff 或 PR 展示接口；取数本身已经直接用 git，现成方案没有更可靠的本地提交口径。`prChanges` 把 `--no-color`、前缀、改名、排序、算法等格式参数钉死，本机配置不能改判据输入。

### 4. 方向决定

协调 2026-10-24 按 P1 例外代批，事后报用户。该改动是「换」而不是新增分支或特例；同一提交继续删除不可达的 `previousPath` / `renamed` 处理及其专属测试。

### 特征测试清单

- `scripts/pr-judgement-lib.node-test.mjs`：临时仓库设置 `color.ui=always`、`diff.noprefix=true`、`diff.mnemonicPrefix=true`，推送前判据仍命中非测试文件新增的 `new AbortController()`。
- 变异：恢复旧的三次 `git diff` 取数后，上述用例 `25 pass / 1 fail`，原样恢复。
