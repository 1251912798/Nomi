// 落地报文里「这一镜的候选」——主进程写（electron/productionRun/multiShotCanvasLanding.ts 的 candidateWire）、
// 渲染层读（src/workbench/capability/multiShotCanvasLanding.ts），**一份类型**。
//
// 以前两边各写一份同形类型，候选每多一个用户可选的维度（参数 → 模型身份 → 变体），就要有人记得在
// 主进程投影、渲染层「新建」、渲染层「重绑定」三处各加一次；漏一处就是「卡上一个、节点一个」
// （2026-10-22 R-d2-defaults #2：变体没过线，Agent 选的标准 / Mini 落到节点变回 Fast）。
// 现在线类型只在这里，主进程按 `PlanCandidate` 的每个键归类、渲染层按每个线字段归类（两张穷举表），
// 新加的键不归类就过不了 typecheck。

/**
 * 一镜候选的**模型身份与选择**，随落地报文过 RPC。它是画布节点模型的唯一来源：带上它，渲染层就不再
 * 自己另挑一个默认模型（那正是「agent 说的模型」与「节点上的模型」对不上的直接原因）。
 *
 * 只带身份与用户可选的维度，**绝不带密钥或任何供应商凭据**：发出型号在主进程发送时由线上模型名的唯一 owner
 * （`wireModelIdentity.resolveWireModel`）按节点上的模式 / 变体与这条连接的契约解出，渲染层不需要也不许知道。节点 `meta.modelKey`
 * 与候选 `modelId` 本来就是同一个串（generationDefaultModelResolver 的 `modelId: model.modelKey`），故不造转换层。
 *
 * `revision` = PlanCandidate.revision。渲染层据它判断「这镜的意图变了没有」：变了才重绑定，没变一个字不动——
 * 这样 `generation.patch` 能同步下去，而「打开项目补齐」这条幂等重放不会覆盖用户之后在画布上的手改。
 */
export type MaterializeShotCandidateWire = {
  candidateId: string;
  revision: number;
  vendor: string;
  modelKey: string;
  /** 档案方式（`t2v` / `firstlast` / `omni`……）。同一任务种类下有几个方式时，靠它分清。 */
  modeId?: string;
  /**
   * 档案变体（Seedance 2.0 的 standard / fast / mini、Veo 3.1 的 quality / fast / lite……）。
   * 宿主归一后候选上一定有（`normalizeVideoCandidate`）；它决定发出型号和扣费档，节点必须原样拿到。
   */
  variantId?: string;
  /** 目录任务种类（`text_to_video` / `image_edit`……）。 */
  mode: string;
  /**
   * 候选**选中的那些参数**（画质 / 时长 / 尺寸 / 声效……）。
   *
   * 为什么必须过这条线：渲染层落节点走 `buildPlannedNodeMeta`，它按模型档案铺的是**默认值**；
   * 不把候选真正选的参数带过来，每一次落地 / 重绑定都会把用户（或 agent）挑过的值悄悄改回档案默认
   * （2026-09-11 实测：付费卡上把尺寸从 1024x1024 改成 1536x1024，落地链下一拍就把它按回去）。
   *
   * 只带标量（字符串 / 数字 / 布尔）：参数面上真正能选的就是这些，这条线不该变成任意 JSON 通道。
   */
  parameters?: Record<string, string | number | boolean>;
};
