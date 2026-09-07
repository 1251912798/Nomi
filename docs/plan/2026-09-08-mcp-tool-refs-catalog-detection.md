# 工具引用门岗按对象结构选择目录

> 状态：📎 实施与验证记录（PR 交付，不代表已合入 main）

## 目标与取舍

合法的应用内工具摘录不应被 MCP 目录误杀；MCP 调用也不能借 Agent 目录过关。

| 方案 | 作者看到的行为 | 代价 |
| --- | --- | --- |
| 按同一对象结构识别（采用） | 现有 fixture 与 manifest 摘录直接通过，未知名仍红 | 识别宿主合同字段 |
| 任一目录命中即通过 | 无需注解 | 会放过 MCP 中误用的 Agent 专属名字 |
| 围栏声明目录 | 作者手动声明 | 新增格式和维护负担 |

## 先查别人

- `scripts/check-mcp-tool-references-lib.mjs:34`：现有 240 字符窗口不识别对象边界，字段换序、长值、嵌套都会影响结果；替换而非扩大窗口。
- `tests/ux/agent-runtime-production.walk.mjs:67` 与 `tests/ux/agent-runtime-editing.walk.mjs:71`：宿主回复都以同一对象的 `type: 'tool'` 标记。
- `docs/audit/2026-09-06-agent-tool-layer-audit.md:195`：manifest 摘录有 `intent/capabilityRefs/inputSchema/outputSchema`，与 MCP payload 不同。
- TypeScript 官方 scanner 文档：<https://github.com/microsoft/TypeScript/wiki/Architectural-Overview#scanner>；Context7 已查 scanner，安装版本 `node_modules/typescript/lib/typescript.d.ts:8511` 提供 createScanner，复用现有依赖处理字符串和注释，不自造词法分析器。内部静态门岗，不改任何外部协议格式。

## 范围与边界

只改门岗 lib、CLI 说明、node-test、audit 围栏及本次根因合同。禁止修改宿主实现、目录和运行时工具契约。
在 scanSource 统一识别同一对象的直接字段，不限距离/顺序；宿主 type 或 manifest 结构选择 Agent，其余 name 与全部调用选择 MCP。嵌套和相邻对象不能继承宿主标记。

## 验收与回滚

先补测试和恢复 ts 围栏，记录旧实现红证；再替换 isHostFixture。覆盖未知名、长字段、换序、嵌套、相邻对象、MCP 调用隔离、Markdown 行号与围栏隔离。
运行 node test、check:mcp-tool-refs、check:root-cause-contracts、pnpm run gates。提交钩子 Ponytail 评审后 commit/push/PR，不合并。
回滚本次提交即可，无数据迁移、无依赖变化。

## 红绿证据

- 旧实现：新增 7 个用例中 3 个失败（manifest、长字段/换序、嵌套归属）。恢复 audit ts 围栏后 CLI exit 1，准确指向第 199 行 nomi_canvas_plan。
- 新实现：9 个 node tests 通过；check:mcp-tool-refs 扫描 115 处引用通过。
- R17 阳性：临时把 audit manifest 名字换为 nomi_unknown_catalog_probe，真实 CLI exit 1 且报告应用内 Agent 目录；随后恢复原文。
- 根因合同门岗通过；完整 gates 结果见 PR。
