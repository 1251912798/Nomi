# B4 Electron 验收记录

状态：🚧 进行中（完整 gates 与 PR 待收据）

隔离运行通过 tests/ux/_launchApp.mjs；真实凭据仅从用户目录复制密文进入隔离 profile，未打印、未覆盖原目录。

|真实用户任务|结果|证据|
|---|---|---|
|点图片节点生成，先取消|显示预计金额；目录没有价格时明确写目录未标价；取消未提交|human-03-quote-unpriced.png、human-04-cancel-no-submit.png|
|用坏 Key 更换现有 APIMart Key|真实探针拒绝；旧密文摘要一致，连接仍显示已连通|human-12-invalid-key-final.png、human-key-preserved.log|
|查看自动化设置|没有制作硬预算设置|human-06-settings-no-hard-budget.png|
|确认并真实生成一张橙子图|APIMart / GPT Image 2 / 1K / 1 张成功|human-07-real-generated-image.png|
|失效节点恢复（预置 401 项目夹具）|原 APIMart 节点保留；提示原错误与修复方式；切换是可点按钮|provider-401-red.log → provider-401-green.log、human-10-provider-suggestion-final.png|
|草稿分镜行生成（持久化草稿夹具）|点击后出现共享确认卡；取消不开始生成|human-09-storyboard-generate-feedback.png|

价格来源：https://apimart.ai/model/gpt-image-2，页面价格表保存在 apimart-official-price.json。
1K 报价 $0.0085/张，按 ¥8/$ 保守估算 ¥0.068。没有账户最终结算回执；这是报价估算，不能当作实扣金额。
真实目录未标价，有价显示分支由 spendQuoteCard.test.ts 的目录报价夹具覆盖；没有篡改模型档案来制造人民币金额。
红→绿日志使用同一变更测试；amount/preference 红灯临时回放 HEAD 实现，完成后已恢复工作树。

R30 真实 Agent：DeepSeek V4 Flash 首轮 TLS 连接重置（未执行工具）；GPT-5.5 第二轮成功，canvas.read 与 canvas.write 均 done，新增标题“B4 工具验收”的 GPT Image 2 节点且无生成结果。工具写对 1/1；全部工具调用成功 2/2；用户任务回合成功 1/2。提示词 41,114 token、输出 465 token（含推理 175）；无账户结算回执，未假造扣费数字。证据 real-agent-metrics.json / human-11-real-agent-created-node.png。样本小，仅证明本次任务链路，不外推模型总体准确率。

最终构建复验：坏 Key 提示为本地化错误，无 Electron IPC 包装文本；与首次保存的 APIMart 旧凭据密文 SHA-256 对比一致。隔离应用已关闭。
