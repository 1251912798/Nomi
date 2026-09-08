# Nomi 库封面插画规则

状态：三张候选已生成，等待用户选择锚图；未批量生产。

## 目的与媒体顺序
卡片先让用户看懂会做什么。真实产物 > 统一规则插画；插画只解释用途，绝不当作模型生成效果样例。标题由 UI 叠字，图内不写字。和 v4 技能 chip hover 视频共用同一媒体。

## 从 token 派生
`src/design/tokens.ts:1` → `src/theme/nomiTheme.ts`；颜色真值在 `src/theme/nomi-tokens.css:3`：

| 色彩角色 | token | 锚图取值 |
|---|---|---|
| 纸 | --nomi-paper | oklch(1 0 0) |
| 墨 | --nomi-ink | oklch(0.22 0.01 80) |
| 唯一强调色 | --nomi-accent | oklch(0.55 0.13 250) |

脚本每次读取 token，色值不在脚本复制。每张 2–3 色，强调色只落一个视觉重心。深色 UI 翻转界面 token，媒体不套滤镜改色。

## 构图、隐喻与禁项
横向 16:9，中心概念占约一半画面；最多五个主要几何形，留纸色空间。只用平面几何、细墨线和单块强调色，避免复杂纹理。

| 用户任务 | 一个概念、一个隐喻 |
|---|---|
| 三视图/一致性 | 同一个矩形展开为三张卡 |
| 分镜 | 连续的三格画框 |
| 运镜 | 围绕一个物体的弧线 |
| 修图/扩图 | 一块画面自然接上缺口 |
| 去 AI 感 | 规则形边缘的一处细小自然变化 |
| 剧本 | 两个几何物体间的一条动作线 |

禁：人脸、文字、数字、水印、模型绘制标题、多隐喻拼贴、3D 渲染、渐变光效、装饰性闪光。不要借用品牌标志或照搬 Anthropic 某张具体插画。

## 三张候选与人工判读
[接触表](covers/contact-sheet.png)。原图：

1. [anchor-1.png](covers/anchors/anchor-1.png)：扇形纸卡，最接近“一体多视”；细节略多。
2. [anchor-2.png](covers/anchors/anchor-2.png)：物体绕中心排列；出现星形装饰，偏离禁项，不推荐作为量产锚图。
3. [anchor-3.png](covers/anchors/anchor-3.png)：矩形穿过三格画框，结构最克制，推荐；底色有轻微暖纸纹理，后续参考提示词需继续压平。

三张都亲眼检查；模型未精确满足全部规则，以上偏差明确保留供选择。未选图之前不批量。本轮 15 个收录技能已用原仓真实配图；40 个效果的插画仍待锚图批准，不能说“55条都有成品封面”。

## 脚本与官方契约
`pnpm exec tsc -p electron/tsconfig.json` 后：

```sh
node scripts/covers/generate-covers.mjs --dry-run --limit 3
pnpm exec electron scripts/covers/generate-covers.mjs --limit 3
# 用户选中后才运行；最多10张试产，同一收据继续累计预算
pnpm exec electron scripts/covers/generate-covers.mjs --anchor docs/design/covers/anchors/anchor-3.png --limit 10
```

读取共享 SKILL.md 解析器，只处理缺 preview 的条目。参考图走官方 `image_urls` 的 base64 data URL 槽，禁止只在文字里说“参考”。生产读取应用 `readCatalog → decryptApiKeyRecord`；应用名沿 package.json（`nomi`），对应现有 keychain 身份。只调用 APIMart 固定域名和模型。供应商响应不打印，密钥不落收据。

官方生成规范：https://docs.apimart.ai/en/api-reference/images/gemini-2.5-flash/generation.md ，支持 n=1、16:9、image_urls；官方市场价格：https://apimart.ai/api/marketplace/models?keyword=nano%20banana&page_size=10 ，本次每次 $0.0125。查询：https://docs.apimart.ai/en/api-reference/account/token-balance.md 。图片链接有效期24小时，下载到本地并编码为真实PNG。

## 成本收据与停止条件
[机器收据](covers/generation-receipt.json)：三张分别余额扣减 0.0125，共 **$0.0375**。按预算保守系数 8 CNY/USD 计 **¥0.30**；这是预算换算，不声称是银行卡结算汇率。共享账号其他活动可能污染余额差值，收据保留逐任务起止时间与 taskId；本次三段差值均与官方报价一致。

总预算¥6；每次提交前保留两倍报价预算，失败/不确定请求不释放额度、不自动重新提交。报价缺失/涨价、超预算、已有未决请求、已有锚图重复生成均拒绝。批量试产必须显式指定本轮已完成候选锚图；进程锁防并行重复花费。

TikHub 搜索是 M1 的独立接口，返回未提供扣费字段，实付未知，不混进 APIMart 生图实付。
