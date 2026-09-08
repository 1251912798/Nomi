# 「参考图连了没用上」多半断在档案键 ↔ 渠道 body 字段名的 join 上

> 📎 教训 · 首次记录 2026-09-08 · 状态：✅ 已固化（由 `check:reference-contract` 接管）
> **触发场景**：用户说「连了参考图没传入 / 生成结果和参考图没关系 / 这个模型参考图老是失败」；或你要判断某个模型的参考槽在某家渠道上到底发不发得出去。

**结论**：先跑 `pnpm run check:reference-contract`，别读代码猜。参考图链路最容易断、最难看见的是
**模型档案声明的槽键 ↔ 各家 create body 自己的字段名**这一段：两侧各自自洽、各自的测试全绿，
只有把两侧对起来才看得见线断了。

**为什么会踩**：档案是供应商无关的（`src/config/modelArchetypes/*` 声明「这个模式有个输入图槽，
键叫 X」），body 是各家自己的叫法（`electron/catalog/*` 的 seed 模板）。2026-09-08 实测：
`fal/openai/gpt-image-2[i2i]` 档案声明 `input_urls`（KIE/APIMart 的契约名，`gptImage2.ts`），
fal 的 body 却读 `{{request.params.image_urls}}`（`falOfficial.ts`）→ 用户连上的参考图**一张也
进不了报文**，第三闸（`taskParams.ts` `unreachableReferenceLabels`）只好拒发。
用户体感 = 群里那句「GPT Image 2 参考图失败」。全目录扫 45 条 model×mode / 64 个槽，断这一条。

**怎么用**：
- 判某个槽发不发得出：`pnpm run check:reference-contract`（种一张合成 URL → 渲染真实 body →
  看它在不在；判据全部复用生产函数，不另写尺子）。
- 修法：body 的 **wire 字段名保持这家自己的叫法**，把值的 token 换成档案声明的键
  （`image_urls: "{{request.params.input_urls}}"`）。别去改档案的契约键——那是模型的名字，不是 fal 的。

**三个反复踩的坑**：
- **`reach === 'none'` 不等于 bug**。它可能是**真实能力上限**（runway veo3.1 就是发不出尾帧、
  grok 一次只吃一张），UI 已经如实收窄了。把这些也判成违约 = 门岗要求删掉真能用的功能。
  合同只管「UI 承诺发得出（reach 是 `single`/`full`）的槽」。
- **一次只能种一个槽**。单图聚合位（`image_url`/`imageUrl`/`image`）只有**一个名额**，同时种首帧
  和参考图会让首帧抢走名额。初版判据就这么假红了两条（grok / hailuo3），差点去「修」两个没坏的地方。
- **`check:orphan-cables` 拦不住这一类**。它查 modeId 拼写 / 路由错桶 = **线缆选不选得中**；
  本类是选中之后**槽里的东西上不上得了车**。前者全绿，后者照样断。

**同族的另外两条**（同一次挖出来，机制一样：一个事实两条路径、只守住一条）：
- **模型身份丢一半**：`smartDefaultImageEditProtocol` 按 `[modelKey, modelAlias]` **两个**身份选改图
  协议，自建中转的内置说明卡却只传了 `modelKey`。中转把模型登记成不透明 id（`custom-1`）、真名在
  alias 上的用户，改图被判成 chat 协议 → 400「not supported on the Chat Completions endpoint」。
  下结论前先问：这个判断需要几个身份？我传全了吗。
- **档案解析分家**：`archetypeForNode`（自动纠正模式的守卫）走 `getArchetypeById` 捷径，
  **跳过了 `legacyIds` 迁移**；发送路径 `resolveArchetypeForModel` 会迁移。档案一分为二时
  （Agnes Image 2.0/2.1），存量节点在两条路径上认到**两个不同档案**。
  修法不是补迁移，是**把捷径删掉、并到唯一解析器**（P1）。

**还没有防线的地方**（别以为都修完了）：
- **自定义调用（custom call）整条路绕过第三闸**：`runtime.ts` 对 custom call 传
  `createBody: undefined`，可达性判据拿不到 body 就整个跳过。脚本读不读注入的 `references` 没人管
  ——不读就是静默丢图 + 照常扣费。
- **custom call 的「试跑」不带参考素材**（走 `cannedTestInput`），所以一个改图脚本可以试跑通过，
  而它的参考图分支一次都没被执行过（`buildCustomCallTestFixture` 造好了却没有 UI 调用它）。
- **没有肯定回执**：今天只有否定信号（拒发文案、「一次只带得了 1 张」徽标），没有从出站报文事实
  派生的「本次带了 N 张 / 忽略 M 张」。
