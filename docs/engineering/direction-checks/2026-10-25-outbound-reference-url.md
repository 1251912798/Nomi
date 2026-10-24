# 方向检查：出站参考媒体 URL 序列化边界（2026-10-25）

触发：`electron/catalog/assetLocalization.ts` 近 14 天已有 3 个 fix，本次是第 4 个；`electron/catalog/profileHttpRequest.ts` 近 14 天已有 2 个 fix，本次是第 3 个。两处命中的是文件级 fix-churn。本次改法是**换**：把远端参考 URL 的隐式直通换成统一的 WHATWG URL 序列化边界，不增加供应商 / 模型 / 平台分支，不保留旧直通后备；结构性结论交协调会话代批，事后报用户。

## 0. 一句话根因

参考媒体 URL 的本地上传、profile 渲染、fallback / custom-call JSON 和 multipart 取字节各有出站门，缺少一个按字段形状共享的 URL 序列化不变量，所以新增入口或旧远端值都能绕过空白 / 控制字符校验。

## 1. 归类表：bug → 直接原因 → 类

| 提交 / bug | 直接原因 | 类 |
|---|---|---|
| 本单：参考图文件名含空格时服务商拒绝 | `image_urls` 等远端值在无本地上传时原样进入请求体 | 出站参考媒体 URL 多门直通 |
| 同类潜伏：`first_frame_image`、`image_with_roles[].url`、`video_urls`、`audio_urls`、multipart 文本字段 | 字段形状不同，调用方没有共享序列化合同 | 同上 |

## 2. 为什么这一类会一直出现

`localizeAssetsForVendor` 只负责 `nomi-local://` / `data:` 的物化；已有公网 URL 在 profile 构造和自定义脚本里被当作可信字符串。字段本身分散在数组、字符串、对象 `url`、query 和 multipart 文本字段，局部测试只钉某一家映射，新增门不会自动继承 URL 标准。类级修复把不变量放在 `outboundReferenceUrl.ts`，JSON 写出、profile 构造、multipart source / form-data 都复用它。

| 铁律 | 结论 | 最小证据 |
|---|---|---|
| ⑩ 说的=摆的 | 适用：参考 URL 是生成意图的一部分，出站值必须与用户带入的媒体一一对应；序列化只改变 URL 表示，不改变引用对象 | `electron/catalog/outboundReferenceUrl.test.ts` 表驱动形状测试 |
| ⑪ 能选到 | 不适用：不增加模型参数或入口 | — |
| ⑫ 点了=以为的 | 适用：用户点生成时，请求要么携带可解析参考，要么提交前明确失败；不允许服务商收到半解析值 | `electron/vendor/vendorHttp.test.ts` invalid URL fetch=0 |

## 3. 不改结构的话，接下来会冒出什么

| 预测 | 怎么验证 |
|---|---|
| 新 mapping 使用另一种参考字段后再次把空格透传 | `electron/catalog/outboundReferenceUrl.test.ts` 播种 mapping body 的结构普查 |
| Agent / 自定义脚本绕过 profile 直接发 JSON，复现同样拒绝 | `electron/vendor/vendorHttp.test.ts` requestJson 写出断言 |
| multipart 文本字段仍带未序列化 URL | `electron/vendor/vendorHttp.test.ts` requestMultipart 表单字段断言 |

## 4. 靶子独立性检查

WHATWG URL Standard 是外部尺子；类级测试只断言解析/序列化不变量，结构普查不依赖某一个供应商的成功响应。`check:root-cause-contracts` 和 `check:escape-ledger` 是独立门岗；变异在隔离副本删除 vendor JSON 边界后 2 格红、删除 profile 边界后 1 格红。

## 5. P0：这些是我们独有的吗

URL 解析与序列化不是 Nomi 独有能力，直接使用 Node 内置 WHATWG `URL`，不新增依赖。参考媒体字段如何从 Nomi 的映射 / Agent / multipart 形状汇合，是 Nomi 的领域边界；因此只自写字段识别与失败归属，不自写编码器。

## 6. 接入 / 补 / 重写 / 删对比表 + 推荐

| 选项 | 做什么 | 代价 | 风险 | 推荐 |
|---|---|---|---|---|
| 接入现成方案 | 直接用 WHATWG `URL` 的 parse → serialize（`https://url.spec.whatwg.org/`） | 无依赖；一次标准化 | 生产者若早已把 `#` / `?` 拼进文件名，边界无法恢复原意 | **是** |
| 补 | 在 APIMart / MiniMax-H3 或 Windows 分支里替换空格 | 小 | 其它 vendor、字段、Agent、旧远端值仍可绕过 | 否 |
| 重写（限一个模块） | 用 `outboundReferenceUrl.ts` 取代各门直通，保留既有本地 / data / ComfyUI 规则 | 新增一个共享模块与调用点 | 需要维护字段形状集合；类级结构测试守着 | 与接入同时执行 |
| 删 | 删除远端参考能力 | 小 | 丢失已有用户工作流 | 不可选 |

## 7. 用户要权衡的核心

是继续让每个出站门自己相信 URL，还是让所有参考媒体都接受同一条标准化和失败前置规则；本次选择统一边界。

## 特征测试清单

- `electron/catalog/outboundReferenceUrl.test.ts`：改前 MiniMax-H3 `image_urls[0]` 空格红；改后数组 / 字符串 / 对象 `url` × 空格、中文、`#`、`%20`、签名 query、`data:` 绿；播种 mapping body 结构普查绿。
- `electron/catalog/profileHttpRequest.test.ts`：profile 构造后的请求体已序列化。
- `electron/vendor/vendorHttp.test.ts`：JSON / multipart 写出前序列化；非法 URL 时 fetch=0。
- `electron/catalog/multipartOperation.test.ts`：multipart source 取字节前序列化。
- `electron/catalog/assetLocalization.test.ts`：本地上传返回的 provider URL 也经过同一 helper，既有上传 / ComfyUI / data 测试保持绿。
- 变异：隔离副本 vendor 边界 2 格红，profile 边界 1 格红。
