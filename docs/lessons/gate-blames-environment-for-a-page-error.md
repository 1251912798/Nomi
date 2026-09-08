# 门岗说「机器超载」，其实是页面自己崩了

> 📎 教训 · 首次记录 2026-09-08 · 状态：现行
> **触发场景**：任何「等不到 ready / 预热超时 / 服务不可达」的门岗失败，尤其是它同时给你贴了 load 数字的时候。

**结论**：**「等不到 ready」有两种成因，处置完全相反**——服务器起不来该等环境，页面自己崩了该看控制台。
现在的 `check:design-lab` 把两者报成同一句话，还附上真实的 load 让错误结论显得有据。
**遇到这类失败，第一件事是打开那个页面看控制台**，不是去看 uptime。

**为什么会踩**（2026-09-07 夜，绕了三轮）：

`check:design-lab` 恒红，报的是：

```
🚧 预览服务器不可达——这不是视觉回归，是基础设施失败（warmup-unreachable）
   整趟跑下来服务器从未可达
   本机 load 9.7 / 10.5 / 12.3（10 核）
   机器闲下来再跑一次；这一趟对设计没有任何结论
```

**每一句都错**：
- 服务器一直可达——手工 `curl http://127.0.0.1:5670/design-lab.html` **4 秒就 200**
- load 是真的，但与失败无关
- 「闲下来再跑」跑一百次也不会好

真因是页面 JS 崩了：`design-lab.tsx → laneDrivenFixtures.ts → laneProjection.mjs` 里
`import { getSupportedThinkingLevels } from '@earendil-works/pi-ai'` 是**运行时导入**，
pi-ai 内部 `import { parse } from 'partial-json'`（CJS）。`optimizeDeps.noDiscovery: true`
关掉了依赖发现，而 `design-lab.html` 不在 `entries` 里 → 这条依赖永远不进预打包 →
浏览器拿到原始 CJS → `SyntaxError: does not provide an export named 'parse'` →
`window.__designLabReady` 永远不翻 → `page.waitForFunction` 等满 180s。

门岗只观察到「180 秒没等到 ready」，就推断成「服务器没起来」，再顺手把 load 当佐证。
**它把一个只能靠控制台看见的失败，翻译成了一个只能靠等待解决的结论。**

**怎么用**：
- 看到 warmup / ready 超时，**先开页面看控制台**（`mcp__Claude_Browser__read_console_messages` 一行就够），
  再谈环境。手工 `curl` 那个 URL 能立刻分开「服务器起没起」和「页面崩没崩」。
- 别被诊断里的真实数字带走：**load 是真的，不代表它是原因**。附带的佐证数据只证明它被采集了。
- 写门岗诊断时：**能区分的成因不要合并成一句话**。至少分「服务器不可达（curl 也失败）」与
  「服务器可达但页面没就绪（curl 成功、ready 超时）」两条，后者要提示去看控制台。

**关联**：[[gates-green-does-not-mean-walkthrough-ran]]、[[harness-catch-launders-bugs-into-verdicts]]（同族：工具自己的解释盖住了真实原因）。
