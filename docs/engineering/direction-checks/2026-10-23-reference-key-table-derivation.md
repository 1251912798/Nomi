# 方向检查：主进程拒发的参考键表漏键（#1269 条件 2，I-b1a-refslots）

> 触发：`node scripts/fix-churn.mjs electron/catalog/archetypeInput.ts` 命中——文件近 14 天已有 3 个 fix（10-22 热修 #1279 那一串），
> 这一刀是第 4 个；概念「发给供应商的参考图只能是当前方式声明、界面在用的那些」近 14 天已有 4 个 fix，这一刀是第 5 个。
> 用户 2026-10-23 拍板方案 A：「#1269 条件 2 选 A：键表改推导，值判断改递归（对象形夹带也拦），碰 archetypeInput.ts，提交带方向检查标记。」
> 出处：验收报告 V-b1a-r3 第 4 节条件 2（夹带 `image_urls`、`first_frame_image` 的探针被放行）。

## 0. 一句话根因

10-22 方向检查（`docs/audit/2026-10-22-composer-reference-slots-direction.md` 第 2 节）预言过：**发送是「把数据全带上再按键过滤」的黑名单，黑名单每多一个读口就多一个漏点**。渲染层那一半已经重写成唯一推导（placeUploadedImages），但「哪些键算参考键」这张黑名单还是手写的 29 个键，请求体直接读的 30 个参考键（`image_urls`、`first_frame_image`、`image_with_roles`、`video_list`、`mask_url`……）不在表里；值判断又只认字符串，对象形的值（`[{url, role}]`、火山 content）就算键在表里也看不见。

## 1. 归类表

| 现象 | 直接原因 | 类 |
|---|---|---|
| r3 探针：`image_urls=[stray]`、`first_frame_image=d` 两道守都放行，APIMart 请求体发出 | 键不在手写表里，`...meta` → `...extras` 原样进请求体 | 黑名单漏键 |
| 本线普查：内置 246 条 mapping 的请求体读 30 个表外参考键（kie / apimart / agnes / volcengine / runninghub / fal / runway） | 同上 | 黑名单漏键 |
| 本线逐键夹带：只推导键表之后，`image_with_roles: [{url}]`、火山 content 对象仍放行（APIMart 14 格、内置 94 格） | `findReferenceResidue` 只认字符串 / 字符串数组 | 值形状盲区 |

铁律：⑩ 说的=摆的（界面标「没在用」、请求里却带着它）。

## 2. 为什么一直出现

键表是「哪些请求键算参考」的一份**手抄**，和真正的来源（档案槽的 inputKey、请求体模板、APIMart 别名）分家；新档案、新供应商只改来源，从来没人回来补表。

## 3. 不改结构会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 下一个接入的供应商请求体读一个新的参考键名，canvas 夹带照发 | 普查测试（键表完整性）会先红 |
| MCP metadata 照抄一份 archetypeInput（对象形）进 meta，主进程放行 | 逐键夹带 + 拒发逐键 × 形状两条用例 |

## 4. 靶子独立性

尺子不信键表自己：普查从请求体模板（`wireReferencedParamKeys`）出发，减去**声明过的非参考参数**（档案参数 / vendorParams / fixedParams / wire 默认 / defaultParams / paramMap / 进程 expose / 计算键）和一张带理由的标量台账（10 条），剩下的才是参考键。修前 7 条红、只做推导后 3 条红、做完 A 全绿（`docs/evidence/2026-10-23-refslots/`）。

## 5. P0

「哪些键算参考、什么值算素材」是档案 / 渠道领域语义（self-written 领域目录 `electron/shared/modelArchetypes`、`electron/catalog`），没有现成库。

## 6. 对比表

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 无 | — | — | — |
| 只补表 | 手工把 30 个键加进表 | 1 个文件 | 下一个读口照漏；对象形照漏 | ✗ |
| **换：推导 + 递归 + 门岗（A）** | 键表由四处声明合成（翻译输入键、各槽 inputKey / 合并键、APIMart 别名、档案 `headlessReferenceKeys`）；值递归收（role / type 描述字段除外）；普查测试守完整性 | 约 9 个文件 | 用户自建 mapping 读的非常规键测不到（写进根因合同 residual_risks） | ✅ 用户已选 |
| 按值兜底 | 任何键下的 URL 不在用就拒 / 清 | 渲染层、主进程各一套，碰热点 catalogTaskActions | 带 URL 的合法参数（如 MiniMax H3 的 `webhook`）误伤，写 meta 的入口没数全 | 暂不做；普查门再红一次就升级 |

## 7. 用户要权衡的核心

今天用「声明推导 + 普查门」把内置渠道这一类堵死（以后漏键测试先红），接受用户自建 mapping 的非常规键测不到。

## 特征测试清单

`src/workbench/generationCanvas/runner/referenceSentWithinInUse.property.test.ts`：键表完整性、内置全部供应商 `seeded/*` 层、逐键夹带 `*/bypass-per-key`、拒发逐键 × 形状；先于实现单独提交（3162b74f3）。
