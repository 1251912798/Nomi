# 登记类核对必须由「新增被登记对象」触发，不能只由核对自己的输入触发

> 📎 教训 · 首次记录 2026-10-16 · 状态：✅ 已固化（门岗 `check:scan-guard-census`，GATE_INPUTS 的 `match`）
> **触发场景**：本机推送前钩子全绿、CI 才红，红的是「某某要登记 / 要去处 / 要在表里声明」一类的全集核对；或你要给钩子加一道「全仓登记核对」的门。

**结论**：凡是「仓库里每个 X 都必须在表里有去处」的核对，触发条件必须包含「新增 / 改名 / 删除一个 X」。只让它在改到核对自己的文件（表、脚本、package.json）时才跑，等于专挑最不会出事的时候检查。

**为什么会踩**：「扫描型守卫登记」核对（`scripts/pre-push-scan-guards.mjs` 的 `scanGuardProblems`）原先只活在 `scripts/pre-push-structure.node-test.mjs` 里，这份测试整份约 33 秒，推送前只在 `touchesGateInputs('test:pre-push-structure', files)` 为真时才跑——也就是改到 package.json / git-hooks / 钩子入口的 import 闭包时。被登记的对象（会遍历源码的测试文件）是新增的，不在这个输入范围里，于是「只新增一个扫源码的测试」本机全绿，约 40 分钟后 CI 才红。2026-10-16 一天撞了 6 次：#1202、#1203、#1207、#1209、#1210、#1211。

**怎么用**：
- 给钩子加登记类核对时，输入范围里写「被登记对象」本身：`GATE_INPUTS` 的 `match` 字段（全仓任意位置命中该正则的路径都算输入），而不是只写核对的实现与基线。
- 核对太慢就拆成只跑登记核对的轻门（这次：`check:scan-guard-census` = `scripts/check-scan-guard-census.mjs`），整份结构测试仍在 CI 里跑同一个函数，本机与 CI 同一份判据。
- 必红证据写在 `scripts/pre-push-contracts.node-test.mjs`：夹具仓库里只新增一个扫 electron 的测试、不登记 → 推送前红并点名文件与该进的表；登记后绿。
- 新增类似门之前，对照 `scripts/pre-push-structure.node-test.mjs` 里的 `SCANNER_READS` 写上「新增一个被登记对象」的样例路径。

**出处**：分支 `fix/prepush-scan-census-on-new-tests`；`scripts/pre-push-gate-inputs.mjs`、`scripts/pre-push-contracts.mjs` 的 SCAN_TESTS。
