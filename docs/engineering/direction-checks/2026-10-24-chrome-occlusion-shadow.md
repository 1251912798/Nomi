# 方向检查：生成框压住外框控件时的投影残留

### 0. 一句话根因

`canvas-chrome-occlusion` 只把外框控件盒子与生成框的交集挖掉，没有把为保住投影而扩大的 clip-path 外框纳入求交，所以盒子外的投影仍压在生成框上。

### 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| 2026-10-24 生成框压住加节点条时出现约 256×40 空白白框带投影 | `occludedHoles` 只与 dock 盒子求交，`clipPathForHoles` 却把 dock 外框扩了 `SHADOW_MARGIN` | 外框控件裁洞边界与实际绘制外框不一致 |
| 同一 hook 的左下缩放簇也会出现同样残影 | `CanvasNavigationStack` 与 `CanvasToolbar` 共用同一个几何边界错误 | 共享裁洞边界未表达投影覆盖范围 |

### 2. 为什么这一类会一直出现

裁剪外框和求洞几何分属两段函数，只有后者使用 dock 盒子；新增或调整投影边距时没有一个共享不变量要求两者使用同一外框。类根因落在铁律 ⑫「点了=以为的」：用户看到的是生成框在上、外框控件被完整让位，代码却只把盒子区域当作可见控件，导致视觉与命中结果不一致。最小证据是 `useCanvasChromeOcclusion.ts` 的 `occludedHoles` 与 `clipPathForHoles` 现状，以及两个调用方共用该 hook。

### 3. 不改结构的话，接下来会冒出什么（2–3 个可验证预测）

| 预测 | 怎么验证（命令或步骤） |
|---|---|
| 生成框只压住 dock 投影、不碰盒子时仍会出现一圈白框带影子 | `pnpm exec vitest run src/workbench/generationCanvas/components/canvasChromeOcclusion.test.ts`，新增投影圈反例应在旧实现下失败 |
| 另一个使用该 hook 的缩放簇会复现同样残影 | 在真实 Electron 中移动节点覆盖左下 `CanvasNavigationStack`，检查外框外扩 24px 的像素亮度 |
| 盒子被完全覆盖时，洞仍只到盒子边缘而投影圈残留 | 单测用完全覆盖的 composer，断言洞坐标超出 dock 盒子且被限制在外框范围 |

### 4. 靶子独立性检查

- 单测与真实走查分属不同证据：单测验证几何合同，Electron 走查验证实际层叠、像素和命中。
- 现有单测只验证盒子交集与合法路径，没有覆盖投影圈，因此不是足够靶子；本次补齐边界用例。
- 真实截图由协调会逐张复核，像素量测脚本与实现线分离；若靶子与截图冲突，以协调复核为准并记录残余风险。

### 5. P0：这些是我们独有的吗？现成方案有哪些

`canvas-chrome-occlusion` 登记条目 id：`canvas-chrome-occlusion`。没有现成方案能直接替代：CSS 没法把后代元素提出 React Flow 渲染层的层叠上下文，`z-index` 无法让节点内生成框跨越舞台级外框控件；因此登记里 status=`justified` 的理由仍成立。CSS `clip-path`、MutationObserver、ResizeObserver 都已接入，当前只换领域几何边界。

### 6. 接入 / 补 / 重写 / 删 对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 继续使用 CSS `clip-path` 与浏览器观察器 | 无法表达跨层叠上下文的画布几何 | 仍需维护领域求交 | |
| 补 | 让 `occludedHoles` 与扩大的 dock 外框求交 | 改动一处共享纯函数 | 低；测试覆盖盒内、投影圈、无交集 | ✅ |
| 重写（限一个模块） | 把生成框 portal 到舞台级图层 | 坐标、TipTap 挂载、59 个定位入口都要迁移 | blast radius 大，可能丢输入和命中语义 | |
| 删 | 删除裁洞，让外框控件覆盖生成框 | 破坏用户已验收的生成框优先级 | 视觉与命中回归 | |

### 7. 用户要权衡的核心

这一刀换的是裁洞的几何边界，保留现有层级和交互；权衡是继续承担这段领域几何，换取不迁移生成框 DOM。

## 特征测试清单（动结构前先锁住）

- `src/workbench/generationCanvas/components/canvasChromeOcclusion.test.ts`：旧实现已钉住盒子交集、无交集、clip-path 外框和调度器；本次先补投影圈与超出盒子坐标的边界测试，确认旧实现变红后再改生产代码。
- 两个生产入口已由 `node scripts/door-map.mjs src/workbench/generationCanvas/components/useCanvasChromeOcclusion.ts` 枚举：`CanvasToolbar` 与 `CanvasNavigationStack`，均继续复用同一共享边界。

本次是「换」而不是补第三个特例；协调会已代批（2026-10-24）。
