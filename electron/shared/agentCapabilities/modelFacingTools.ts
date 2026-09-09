// 一个能力 = 一份模型可见描述符；两个 profile 从它派生（方案 §3.1，阶段 5a）。
//
// ── 它在解决哪个真实摩擦 ──
//
// 用户 2026-09-07 的原话是「足够开放——能被各 Agent 调用」。今天做不到的原因不是缺功能，
// 是**同一件事被描述了两遍**：Nomi 自己的 Agent 读 `electron/agentLane/lane*Tools.ts` 里的
// 一份说明书，外部宿主（Claude Code 之类）经 MCP 读 `mcpCapabilityProjection.ts` 里**另一份**
// 手抄的 JSON Schema。两份的字段表、描述、甚至**动作词表**都各写各的：内部管「读时间轴」叫
// `read_timeline`，MCP 管同一件事叫 `operation:"read"`，中间靠一张手写映射表接上
// （`"read"` → `read_timeline`）。那张表就是漂移本身——它存在的唯一理由是两边不同源。
//
// 于是外部宿主拿到的说明书永远比内部的旧一点、松一点，而**没有任何东西会因此报错**。
//
// ── 这一层的形状 ──
//
// `ModelFacingToolSpec` = 一个别名一个工具的说明书（名字、三条描述通道、schema、示例、容忍钩子、
// 副作用声明），住在能力契约旁边而不是某一个 profile 里。两个 profile 的差异**只允许来自声明**：
//
//   · `internal`（Agent lane）—— 一别名一工具，无租约字段；`effect:"paid"` 的能力**不投影**。
//   · `mcp`（对外 stdio）    —— 一契约一工具，别名折成 `aliasBoundInput` 那几个判别字段；
//                              每个工具首字段是 `leaseHandle`（`dispatcher.ts` 执行前验）。
//
// 「别名折成判别字段」这一步是本文件的关键：`read_full_text` 的 `scope:"full"` 不是 MCP 侧
// 编出来的第二套词表，而是**别名本来就定死的那个语义输入**（`aliasBoundInput`）。两个 profile
// 因此共用同一套动作词表，手写映射表无处可写——这就是三处 `parseCall` 映射被删掉的机制。
//
// ── 为什么判据是「指纹」而不是「看起来一样」 ──
//
// 同源之后两边**结构上**不可能不同，但结构性质要有人证明它还成立：`scripts/check-model-schema.ts`
// 的 `profile-schema-drift` 规则按能力逐个比对两个 profile 的 `alias → 模型可见 JSON Schema` 指纹，
// 手改任何一边当场红（R17 的阳性对照在 `check-model-schema.node-test.mjs`）。
import { z, type ZodTypeAny } from "zod";

import type { CapabilityContract } from "./capabilityContract";
import { unwrapWholeArguments } from "./modelArgumentTolerance";
import { toPublishedJsonSchema, type JsonSchemaObject } from "./modelVisibleJsonSchema";

type AnyCapabilityContract = CapabilityContract<unknown, unknown>;

/** 两个 profile。名字与 `check:model-schema` 的 profile 列、方案 §3.1 的表头逐字一致。 */
export type ToolProfile = "internal" | "mcp";
export type LaneDomainToolGroup = "timeline" | "production" | "generation" | "media" | "maintenance";

/**
 * 一个工具**自己声明**它会造成什么后果（阶段 2 第 ⑨ 维）。
 *
 * 每个字段都有真正的消费者，不是装饰：
 * - `mutates` → pi 的 `replay` 恢复策略（`laneTools.mts` 的唯一派生点）；
 * - `billable` → 装配期不变量（花钱必然改状态），面板花费收据按它分档；
 * - `reversal` → 装配期不变量（只读必然 `none`），审批闸按它决定要不要停下来问用户。
 */
export interface ModelFacingToolEffects {
  /** 会不会改领域状态。只读工具重放一次是安全的，写入工具不是。 */
  readonly mutates: boolean;
  /** 会不会花用户在供应商那里的钱。 */
  readonly billable: boolean;
  /**
   * 改动怎么收回：
   * - `none` —— 不保证能撤回；只读没有改动，不可逆写入也不能承诺撤销；
   * - `proposal` —— 只是一份提案，用户还要点接受（画布这一族全是）；
   * - `undoable` —— 已经落进领域状态，但进了撤销栈（文稿写入这一族）。
   */
  readonly reversal: "none" | "proposal" | "undoable";
}

/** Deferred descriptors inherit risk from the capability owner, never from a mutates shortcut. */
export function modelEffectsForCapability(
  contract: Pick<AnyCapabilityContract, "effect" | "effectClass">,
): ModelFacingToolEffects {
  const mutates = contract.effect !== "read";
  return {
    mutates,
    billable: contract.effect === "paid" || contract.effectClass === "spend",
    reversal: mutates && contract.effectClass === "reversible_local" ? "undoable" : "none",
  };
}

/**
 * 一个工具**最多允许跑多久**（方案 §1.6 第五行；阶段 3c）。
 *
 * 上游一点都不给（[pi #8857](https://github.com/earendil-works/pi/issues/8857)：工具级超时
 * 明说不做），所以没有这条的后果是：领域端口挂住 = 整条 lane 挂住，而症状是「它不动了」——
 * 既没有报错也没有收据，和模型在想事情长得一模一样。
 *
 * **为什么是契约上的必填字段而不是一个默认值**：默认值会让「这个工具到底该跑多久」变成
 * 一件没人想过的事，而第一个真的会跑很久的工具（生成类）会以和 `read_timeline` 完全相同的
 * 形状进来。写成必填，编译器就是最早那道防线（R28）。
 *
 * **它住在共用描述符里而不是某一个 profile 里**（阶段 5a）：预算是「这个领域动作最慢多久」，
 * 与谁在调它无关。两个 profile 各写各的预算就是第二个真相源。
 *
 * **审批等待不计时**：计时器在 `laneTools.mts` 的 `execute` 里才 arm，而闸跑在
 * `before_tool`——也就是**进 execute 之前**。用户想看五分钟再点「允许」，这条预算一秒不走。
 */
export interface ModelFacingToolExecution {
  /**
   * 预算毫秒。读类 30s；写类按领域最慢的那条路给。
   * 花钱的工具必须**提交即返回**（拿到 id 就回，别等结果），所以它的预算也在读类量级——
   * 见 `laneTools.mts` 的装配期不变量。
   */
  readonly timeoutMs: number;
}

/** 读类工具的预算。一次领域读跑到 30 秒就是领域坏了，不是慢。 */
export const MODEL_TOOL_READ_TIMEOUT_MS = 30_000;

/** 写类工具的预算。画布/文稿一次写入含持久化，给到一分钟。 */
export const MODEL_TOOL_WRITE_TIMEOUT_MS = 60_000;

/**
 * 一个 schema-valid 的调用示例（#547：35/35 工具零示例）。
 *
 * **写进 description，不用 Anthropic 专有的 `input_examples`**——我们要跨供应商，
 * 而那个字段只有一家认。示例的 `arguments` 会被测试拿去真的过一遍 schema：
 * 一个过不了自己 schema 的示例比没有示例更糟，它教模型写错。
 */
export interface ModelFacingToolExample {
  /** 一句话说清这个示例在做什么，进 description 的示例块。 */
  readonly when: string;
  /** 真正的参数对象。必须能通过本工具的 schema。 */
  readonly arguments: Readonly<Record<string, unknown>>;
}

/**
 * 一个「模型可见工具」= 一个契约的一个别名的说明书那一半（无需任何领域 port）。
 *
 * **两个 profile 读的是同一个对象**，所以这里的每个字段都必须是「与传输无关」的：
 * 租约、方法路由键、结果投影都不在这里，它们住各自 profile 的适配器里。
 */
export interface ModelFacingToolSpec {
  /** 归属契约。MCP profile 按它归并成一个对外工具。 */
  readonly contractId: string;
  /** Deferred internal menu group. Undefined means initially visible. */
  readonly internalGroup?: LaneDomainToolGroup;
  /** Mixed read/write tools resolve approval against the actual domain operation. */
  readonly operationCapabilityIds?: Readonly<Record<string, string>>;
  /** 别名 = internal profile 的工具名。一别名一工具。 */
  readonly name: string;
  /**
   * 通道①。**只说这个工具自己的事**：干什么、有什么限制、输出会不会被截断。
   * 「该用它还是用隔壁那个」不写在这里——那是通道③ 的活，写在这里就是买 N 遍。
   */
  readonly description: string;
  /** 通道②。一行，进系统提示词的 `Available tools` 菜单。全表只出现一次。 */
  readonly promptSnippet: string;
  /** 通道③。进系统提示词的 `Guidelines`，**跨工具去重**。 */
  readonly promptGuidelines?: readonly string[];
  /** 这个工具会造成什么后果。**必填**。 */
  readonly effects: ModelFacingToolEffects;
  /** 这个工具最多跑多久。**必填**——见 `ModelFacingToolExecution` 头部。 */
  readonly execution: ModelFacingToolExecution;
  /**
   * 模型真正要填的那一部分语义输入。**由别名决定的字段已经剥掉**——
   * `read_full_text` 的 `scope` 不在这里，因为名字已经把它定死了（见 `aliasBoundInput`）。
   */
  readonly schema: ZodTypeAny;
  /** 至少一个，当工具字段数 ≥10 或语义上有分支时（门岗 `missing-example`）。 */
  readonly examples: readonly ModelFacingToolExample[];
  /**
   * 别名已经替模型填掉的那几个语义字段。**两个 profile 都从这里恢复它们**：
   * internal 在执行前补回去，mcp 把它们发布成工具的判别字段。
   *
   * 空对象 = 这个别名不定死任何字段（画布写那一族：`operation` 本来就在参数里）。
   */
  readonly aliasBoundInput?: Readonly<Record<string, string>>;
  /**
   * 哪些 profile 投影它。缺省两个都投。
   *
   * 「外部才有 / 内部才有」的工具走这里显式声明，**不是**靠某个 profile 自己判断——
   * 判断散出去就是第二个真相源。
   */
  readonly profiles?: readonly ToolProfile[];
  /**
   * 「外部才有」的**传输**字段，显式白名单（方案 §3.1：差异只允许 profile 声明的字段）。
   *
   * 只有一族字段有资格进这里：**内部 lane 结构上不可能需要**的寻址参数。`documentId` 是
   * 唯一的实例——Agent lane 永远写用户此刻正看着的那份文稿（`activeDocumentId`），而外部
   * 宿主是无头的，它必须能说出「哪一份」。
   *
   * 它**不进语义输入**：`document.read` 的契约只认 `scope`，文档寻址由 `dispatcher.ts`
   * 在租约里解析。所以它也不进指纹——和租约字段一样，是声明出来的差异，不是漂移。
   */
  readonly mcpTransportFields?: Readonly<Record<string, JsonSchemaObject>>;
  /**
   * pi 官方的容忍钩子（`pi-agent-core/dist/types.d.ts:347`），在 ajv 校验**之前**跑。
   *
   * 为什么容忍只能落在这里：schema 不合法的参数根本走不到执行边界，pi 的校验器先把它
   * 拦下并自己生成了错误回给模型。放松 schema 则是对**所有**调用放松，那是 0/18 的来历。
   */
  prepareArguments?(args: unknown): unknown;
}

/** 别名把哪几个语义字段定死了。空对象 = 一个都没有。 */
export function aliasBoundInputOf(spec: ModelFacingToolSpec): Readonly<Record<string, string>> {
  return spec.aliasBoundInput ?? {};
}

/** 模型填的那部分 + 别名定死的那部分 = 契约的语义输入。**唯一恢复点**，两个 profile 共用。 */
export function toSemanticInput(
  spec: ModelFacingToolSpec,
  args: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return { ...aliasBoundInputOf(spec), ...args };
}

/** 这份说明书声明的「外部才有」传输字段。 */
export function mcpTransportFieldsOf(spec: ModelFacingToolSpec): Readonly<Record<string, JsonSchemaObject>> {
  return spec.mcpTransportFields ?? {};
}

export function projectsToProfile(spec: ModelFacingToolSpec, profile: ToolProfile): boolean {
  return (spec.profiles ?? PROFILES).includes(profile);
}

const PROFILES: readonly ToolProfile[] = Object.freeze(["internal", "mcp"]);

// ── MCP profile：一契约一工具 ────────────────────────────────────────────────

/** MCP 每个工具的首字段。执行前由 `dispatcher.ts` 验；模型面不出现在 internal profile。 */
export const MCP_LEASE_PROPERTIES: Readonly<Record<string, JsonSchemaObject>> = Object.freeze({
  leaseHandle: Object.freeze({
    type: "string",
    minLength: 1,
    description: "nomi_session_open 返回的项目租约句柄。",
  }),
  projectId: Object.freeze({ type: "string", minLength: 1 }),
});

export const MCP_LEASE_FIELD_NAMES: readonly string[] = Object.freeze(Object.keys(MCP_LEASE_PROPERTIES));

/** 一次装配期冲突。带上「哪两个别名在同一个字段上说了不同的话」，因为「schema 冲突」救不了任何人。 */
export class ConflictingProfileField extends Error {
  constructor(readonly contractId: string, readonly field: string, readonly aliases: readonly string[]) {
    super(
      `MCP profile for "${contractId}" cannot publish field "${field}": ${aliases.join(", ")} declare `
      + "different shapes for it. Give the field one shape in the shared descriptor, or split the capability.",
    );
    this.name = "ConflictingProfileField";
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function propertiesOf(schema: JsonSchemaObject): Record<string, JsonSchemaObject> {
  const properties = schema.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return {};
  return properties as Record<string, JsonSchemaObject>;
}

function requiredOf(schema: JsonSchemaObject): readonly string[] {
  return Array.isArray(schema.required) ? schema.required.filter((v): v is string => typeof v === "string") : [];
}

/**
 * 合并两份同名字段的发布形状。
 *
 * 只有一种合并是安全的：**枚举取并集**（同一个判别字段在不同别名下各带一半合法值，
 * 画布写那三个工具就是这样）。其余任何不同都是「同一个概念被声明成了两种东西」——
 * 那是设计上的问题，当场抛，不许在传输层悄悄挑一个。
 */
function mergeFieldSchema(
  contractId: string,
  field: string,
  left: { schema: JsonSchemaObject; aliases: string[] },
  right: JsonSchemaObject,
  alias: string,
): void {
  if (stableStringify(left.schema) === stableStringify(right)) {
    left.aliases.push(alias);
    return;
  }
  const leftEnum = left.schema.enum;
  const rightEnum = right.enum;
  if (Array.isArray(leftEnum) && Array.isArray(rightEnum)) {
    const merged = { ...left.schema, enum: [...new Set([...leftEnum, ...rightEnum])] };
    const rest = (source: JsonSchemaObject) => stableStringify({ ...source, enum: null });
    if (rest(left.schema) === rest(right)) {
      left.schema = merged;
      left.aliases.push(alias);
      return;
    }
  }
  throw new ConflictingProfileField(contractId, field, [...left.aliases, alias]);
}

/** 别名定死的字段，发布成一个只有一个合法值的枚举（不是 `const`——Google 的 legacy 路径不认它，G-05）。 */
function aliasBoundProperty(values: readonly string[], field: string): JsonSchemaObject {
  return {
    type: "string",
    enum: [...values],
    description: `Which action to perform. Every other field is required by, or only meaningful to, specific values of \`${field}\`.`,
  };
}

export interface McpProfileTool {
  readonly contractId: string;
  /** 对外工具名。契约自己声明的那一个（`aliases.mcp`），不在这里发明。 */
  readonly name: string;
  readonly description: string;
  /** `tools/list` 上真正广播出去的那份 JSON Schema（含租约字段）。 */
  readonly inputSchema: JsonSchemaObject;
  /** 判别字段名 → 合法值。别名恢复用；`parseCall` 因此不需要任何映射表。 */
  readonly discriminators: Readonly<Record<string, readonly string[]>>;
  /** 声明出来的「外部才有」传输字段名。剥语义输入与算指纹时都按它跳过。 */
  readonly transportOnlyFields: readonly string[];
  /** 组成它的别名说明书，按声明顺序。指纹门岗与测试直接读它。 */
  readonly specs: readonly ModelFacingToolSpec[];
  readonly annotations?: { readonly readOnlyHint?: true; readonly destructiveHint?: true };
}

/**
 * MCP 注解**全量派生**（方案 §3.1 第三行）。今天是对 4 个工具手写 `readOnlyHint`，
 * 手写的必然漏——注解漏掉的后果是宿主把一个写操作当只读自动放行。
 *
 * 三条来源全在契约/描述符上，不在这里判断：
 *   · `readOnlyHint`   ← 契约 `effect === "read"`
 *   · `destructiveHint` ← 契约 `effectClass ∈ {irreversible, spend}`
 *   · MCP 规范说 hint **不可信除非来自受信服务器**，所以我们只用它抬高摩擦，从不降低。
 */
export function mcpAnnotationsFor(contract: AnyCapabilityContract): McpProfileTool["annotations"] {
  if (
    contract.effect === "destructive"
    || contract.effectClass === "irreversible"
    || contract.effectClass === "spend"
  ) {
    return Object.freeze({ destructiveHint: true as const });
  }
  if (contract.effect === "read") return Object.freeze({ readOnlyHint: true as const });
  return undefined;
}

/** Shared description for both descriptor profiles and the real MCP publication path. */
export function mcpToolDescription(contract: AnyCapabilityContract, specs: readonly ModelFacingToolSpec[]): string {
  const description = contract.projections.mcp?.description;
  if (!description) throw new Error(`Missing MCP projection metadata for ${contract.id}`);
  return [description, ...new Set(specs.flatMap(spec => spec.promptGuidelines ?? []))].join("\n");
}

/**
 * 一个契约的若干别名说明书 → 一个对外 MCP 工具。
 *
 * 合并规则只有三条，全部机械：
 *   ① 别名定死的字段（`aliasBoundInput`）发布成枚举，值 = 各别名声明的那个值；
 *   ② 模型可填字段取并集，同名字段形状必须相同（枚举取并集是唯一例外，见 `mergeFieldSchema`）；
 *   ③ 必填 = 租约字段 + 判别字段 + **所有别名都必填**的那些字段（少一个别名必填就不能全局必填）。
 */
export function projectMcpTool(
  contract: AnyCapabilityContract,
  specs: readonly ModelFacingToolSpec[],
): McpProfileTool {
  const name = contract.aliases.mcp;
  const description = contract.projections.mcp?.description;
  if (!name || !description) throw new Error(`Missing MCP projection metadata for ${contract.id}`);
  if (specs.length === 0) throw new Error(`No model-facing descriptor for ${contract.id}`);

  const discriminators = new Map<string, Set<string>>();
  const fields = new Map<string, { schema: JsonSchemaObject; aliases: string[] }>();
  const requiredCounts = new Map<string, number>();
  const transportOnly = new Map<string, JsonSchemaObject>();

  for (const spec of specs) {
    for (const [field, schema] of Object.entries(mcpTransportFieldsOf(spec))) transportOnly.set(field, schema);
    for (const [field, value] of Object.entries(aliasBoundInputOf(spec))) {
      const bucket = discriminators.get(field) ?? new Set<string>();
      bucket.add(value);
      discriminators.set(field, bucket);
    }
    const published = toPublishedJsonSchema(spec.schema);
    for (const [field, schema] of Object.entries(propertiesOf(published))) {
      const existing = fields.get(field);
      if (!existing) {
        fields.set(field, { schema, aliases: [spec.name] });
        continue;
      }
      mergeFieldSchema(contract.id, field, existing, schema, spec.name);
    }
    for (const field of requiredOf(published)) {
      requiredCounts.set(field, (requiredCounts.get(field) ?? 0) + 1);
    }
  }

  for (const field of discriminators.keys()) {
    if (fields.has(field)) {
      // 一个字段不能既由别名定死、又让模型填——那正是「让模型再选一次」的形状（G-01）。
      throw new ConflictingProfileField(contract.id, field, specs.map((spec) => spec.name));
    }
  }

  const properties: Record<string, JsonSchemaObject> = { ...MCP_LEASE_PROPERTIES };
  for (const [field, schema] of transportOnly) {
    if (fields.has(field) || discriminators.has(field)) {
      // 一个字段不能既是「外部才有的传输寻址」又是模型可见的语义输入——那是两个真相源。
      throw new ConflictingProfileField(contract.id, field, specs.map((spec) => spec.name));
    }
    properties[field] = schema;
  }
  for (const [field, values] of discriminators) {
    properties[field] = aliasBoundProperty([...values].sort(), field);
  }
  for (const [field, entry] of fields) properties[field] = entry.schema;

  const required = [
    "leaseHandle",
    ...[...discriminators.keys()].sort(),
    ...[...requiredCounts.entries()].filter(([, count]) => count === specs.length).map(([field]) => field).sort(),
  ];

  const annotations = mcpAnnotationsFor(contract);
  return Object.freeze({
    contractId: contract.id,
    name,
    description: mcpToolDescription(contract, specs),
    inputSchema: Object.freeze({
      type: "object",
      properties,
      required,
      additionalProperties: false,
    }) as JsonSchemaObject,
    discriminators: Object.freeze(
      Object.fromEntries([...discriminators].map(([field, values]) => [field, Object.freeze([...values].sort())])),
    ),
    transportOnlyFields: Object.freeze([...transportOnly.keys()].sort()),
    specs: Object.freeze([...specs]),
    ...(annotations ? { annotations } : {}),
  });
}

/**
 * MCP 入参 → 「哪个别名 + 模型填的那部分」。**没有映射表**：判别字段的值就是别名定死的语义值，
 * 所以匹配一次就够了。
 */
export function resolveMcpSpec(
  tool: McpProfileTool,
  args: Readonly<Record<string, unknown>>,
): ModelFacingToolSpec | undefined {
  const discriminatorFields = Object.keys(tool.discriminators);
  if (discriminatorFields.length > 0) {
    return tool.specs.find((spec) => {
      const bound = aliasBoundInputOf(spec);
      return discriminatorFields.every((field) => args[field] === bound[field]);
    });
  }
  if (tool.specs.length === 1) return tool.specs[0];
  // 别名没定死任何字段（画布写那一族：`operation` 本来就在参数里）。判别照样不需要映射表——
  // 每份说明书自己的根级枚举就是它认领的那几个动作，取值命中谁就是谁。
  return tool.specs.find((spec) => {
    const selectors = rootEnumSelectors(spec);
    const fields = Object.keys(selectors);
    return fields.length > 0 && fields.every((field) => {
      const value = args[field];
      return typeof value === "string" && selectors[field].includes(value);
    });
  });
}

/**
 * 一份说明书自己的**必填**根级枚举字段。它是「这个工具认领哪几个动作」的机器判据。
 *
 * 「必填」这一条不是修饰：`nomi_shot_reference_write` 的根上还有 `environment` / `layout` /
 * `move` / `speed` 等七八个**可选**枚举，把它们一并当判据就要求模型把它们全填上，
 * 于是 `create_staging_reference` 永远认领不到自己那次调用（`check:mcp-operation-constructible`
 * 当场抓到了这一条）。模型**必须**送的那个字段，才是能识别动作的那个字段。
 */
function rootEnumSelectors(spec: ModelFacingToolSpec): Record<string, readonly string[]> {
  const published = toPublishedJsonSchema(spec.schema);
  const required = new Set(requiredOf(published));
  return Object.fromEntries(
    Object.entries(propertiesOf(published))
      .filter(([field, schema]) => required.has(field) && Array.isArray(schema.enum))
      .map(([field, schema]) => [field, (schema.enum as unknown[]).filter((v): v is string => typeof v === "string")]),
  );
}

/** 判别字段的合法值清单，进拒收回执。模型自纠时最有用的一样东西。 */
export function mcpAllowedValues(tool: McpProfileTool): readonly string[] {
  return Object.values(tool.discriminators).flatMap((values) => [...values]);
}

// ── 指纹：两个 profile 是不是还在说同一句话 ────────────────────────────────

/**
 * 一个能力在一个 profile 上的**身份**：`别名 → 模型可见 JSON Schema` 的稳定串。
 *
 * 租约字段被摘掉——它是 profile 声明的差异，不是漂移。除此之外任何不同都是漂移：
 * 少一个字段、松一条约束、改一个描述，两边的串就不相等。
 */
export function profileFingerprint(entries: Readonly<Record<string, JsonSchemaObject>>): string {
  return stableStringify(entries);
}

/**
 * 指纹用的**规范形**。两个 profile 都过这一道，否则比到的是构造路径的差别，不是漂移：
 *   · `$schema` 摘掉——它是 zod→JSON Schema 转换器加的方言标记，与模型看到什么无关；
 *   · `required` 排序并在为空时省略——`[]` 与「没有这个键」说的是同一件事。
 */
function canonicalFingerprintEntry(
  properties: Readonly<Record<string, JsonSchemaObject>>,
  required: readonly string[],
): JsonSchemaObject {
  const sorted = [...new Set(required)].sort();
  return {
    type: "object",
    properties: { ...properties },
    ...(sorted.length > 0 ? { required: sorted } : {}),
    additionalProperties: false,
  } as JsonSchemaObject;
}

/** internal profile 的 `别名 → schema` 表。 */
export function internalFingerprintEntries(
  specs: readonly ModelFacingToolSpec[],
): Record<string, JsonSchemaObject> {
  return Object.fromEntries(specs.map((spec) => {
    const published = toPublishedJsonSchema(spec.schema);
    return [spec.name, canonicalFingerprintEntry(propertiesOf(published), requiredOf(published))];
  }));
}

/**
 * MCP profile 的 `别名 → schema` 表，从**广播出去的那份**反投影回来。
 *
 * 反投影而不是「再算一次 spec」是有意的：门岗要量的是宿主真正收到的东西。手改
 * `inputSchema` 的任何一个字节，这里就和 internal 对不上。
 *
 * 两处**合法**的还原，因为它们正是投影时机械做的那两步，不是网开一面：
 *   · 租约与判别字段摘掉——profile 声明的差异；
 *   · 合并时并集过的枚举收窄回这个别名自己声明的那几个值（画布写三个工具共用一个
 *     `operation` 字段，各带一半合法值）。收窄用交集：广播里少了一个值，这里就少一个，
 *     两边当场对不上。
 */
export function mcpFingerprintEntries(tool: McpProfileTool): Record<string, JsonSchemaObject> {
  const published = propertiesOf(tool.inputSchema);
  const declaredDifference = new Set([...MCP_LEASE_FIELD_NAMES, ...Object.keys(tool.discriminators), ...tool.transportOnlyFields]);
  return Object.fromEntries(tool.specs.map((spec) => {
    const own = toPublishedJsonSchema(spec.schema);
    const ownProperties = propertiesOf(own);
    const properties: Record<string, JsonSchemaObject> = {};
    for (const [field, schema] of Object.entries(published)) {
      if (declaredDifference.has(field)) continue;
      if (!ownProperties[field]) continue;
      properties[field] = narrowEnum(schema, ownProperties[field]);
    }
    // 必填按**这个别名自己**的清单还原，只保留广播里真的还在的字段。
    //
    // 为什么不直接读广播的 `required`：一契约一工具的合并是把 N 个别名摊平成一张属性表，
    // 全局必填只能取「所有别名都必填」的交集——`inspect_timeline_range` 的 startFrame
    // 因此在广播里不是必填（`read_timeline` 不要它）。那是合并的机械后果，不是漂移，
    // 判别字段的 description 已经把这件事对宿主说清了。手改广播里的 `required` 由
    // `mcpProjectionDrift` 那条（广播必须字节等于重算结果）抓，不由这条抓。
    return [spec.name, canonicalFingerprintEntry(
      properties,
      requiredOf(own).filter((field) => field in published),
    )];
  }));
}

/** Compare only aliases declared for both profiles; missing declared aliases still fail. */
export function declaredProfileDrift(
  internal: readonly ModelFacingToolSpec[],
  mcp: McpProfileTool,
): string[] {
  return profileDriftBetween(
    internalFingerprintEntries(internal.filter(spec => projectsToProfile(spec, "mcp"))),
    mcpFingerprintEntries({ ...mcp, specs: mcp.specs.filter(spec => projectsToProfile(spec, "internal")) }),
  );
}

function narrowEnum(published: JsonSchemaObject, own: JsonSchemaObject): JsonSchemaObject {
  const publishedEnum = published.enum;
  const ownEnum = own.enum;
  if (!Array.isArray(publishedEnum) || !Array.isArray(ownEnum)) return published;
  return { ...published, enum: ownEnum.filter((value) => publishedEnum.includes(value)) };
}

/**
 * 广播出去的那份还等于「从共享描述符重算一遍」的产物吗？
 *
 * 反投影只证明「两边**能对上**」；这一条证明「MCP 那份**就是**算出来的那份」——
 * 有人绕过投影函数手写一份，或者在枚举里悄悄多塞一个值，只有这条会红。
 */
export function mcpProjectionDrift(
  contract: AnyCapabilityContract,
  specs: readonly ModelFacingToolSpec[],
  broadcast: JsonSchemaObject,
): string | undefined {
  const expected = projectMcpTool(contract, specs).inputSchema;
  if (stableStringify(expected) === stableStringify(broadcast)) return undefined;
  return `${contract.aliases.mcp ?? contract.id} 广播的 inputSchema 与共享描述符重算的结果不同`;
}

/** 显式的空对象 schema。`{}` 说的是「随便填」，这个说的是「这个工具不收参数」。 */
export const NO_ARGUMENTS_SCHEMA = z.object({}).strict();

/**
 * 两个 profile 对同一个能力还在说同一句话吗？
 *
 * 逐别名比「模型可见 JSON Schema」的稳定串，返回人话差异（空数组 = 没有漂移）。
 * **报的是哪个别名、差在哪一边**——"schema 漂移了" 这句话救不了任何人。
 *
 * 判据故意粗暴（整串相等）：少一个字段、松一条约束、改一个描述，全都算。同源之后
 * 两边结构上不可能不同，所以任何不同都只可能来自「有人绕过投影手写了一份」。
 */
export function profileDriftBetween(
  internalEntries: Readonly<Record<string, JsonSchemaObject>>,
  mcpEntries: Readonly<Record<string, JsonSchemaObject>>,
): string[] {
  const drift: string[] = [];
  for (const alias of [...new Set([...Object.keys(internalEntries), ...Object.keys(mcpEntries)])].sort()) {
    const internal = internalEntries[alias];
    const mcp = mcpEntries[alias];
    if (!internal) {
      drift.push(`${alias}：只在对外 MCP 上存在，内部 profile 没有它`);
      continue;
    }
    if (!mcp) {
      drift.push(`${alias}：只在内部 profile 上存在，对外 MCP 广播里没有它`);
      continue;
    }
    const left = stableStringify(internal);
    const right = stableStringify(mcp);
    if (left === right) continue;
    drift.push(
      `${alias}：内部与对外的模型可见 schema 不同\n`
      + `       internal = ${left}\n`
      + `       mcp      = ${right}`,
    );
  }
  return drift;
}

/**
 * 对外 MCP 侧的容忍：**同一个钩子，同一族畸形**（方案 §3.1）。
 *
 * 为什么它必须存在，而不是「内部才需要容忍」：容忍钩子是**描述符上的声明**，不是 lane
 * 的私产。#547 抓到的那 8 种畸形（整包序列化成 JSON 字符串、字段叫 `text`/`body`、
 * 正文被拆成字符串数组、给不收参数的工具塞一个兄弟工具的参数……）是**跨模型的通用行为**，
 * 外部宿主背后跑的也是同一批模型。阶段 5a 之前对外那条路一次也没跑过这个钩子，于是
 * 同一个模型、同一句话，从 Claude Code 打进来就失败，从 Nomi 自己的 Agent 打进来就成功——
 * 而两边读的说明书还宣称是同一份。
 *
 * 两条纪律：
 *   ① **只捏合模型填的那一半**。租约、别名定死的判别字段、声明出来的「外部才有」传输字段
 *      原样留下——`noArgumentTolerance` 会把整个对象清空，直接喂它会连 `leaseHandle` 一起吃掉。
 *   ② **在校验之前跑**（`mcpProtocol.ts` 的 `validateToolArguments` 之前），与 pi 把
 *      `prepareArguments` 放在 ajv 之前是同一条理由：schema 不合法的参数根本走不到执行边界。
 */
export function prepareMcpArguments(
  tool: McpProfileTool,
  args: unknown,
): Record<string, unknown> {
  const record = args && typeof args === "object" && !Array.isArray(args)
    ? { ...(args as Record<string, unknown>) }
    : unwrapWholeArguments(args);
  const spec = resolveMcpSpec(tool, record);
  if (!spec?.prepareArguments) return record;

  const declaredDifference = new Set([
    ...MCP_LEASE_FIELD_NAMES,
    ...Object.keys(tool.discriminators),
    ...tool.transportOnlyFields,
  ]);
  const kept: Record<string, unknown> = {};
  const modelArgs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (declaredDifference.has(key)) kept[key] = value;
    else modelArgs[key] = value;
  }
  const prepared = spec.prepareArguments(modelArgs);
  return {
    ...kept,
    ...(prepared && typeof prepared === "object" && !Array.isArray(prepared)
      ? prepared as Record<string, unknown>
      : {}),
  };
}

/** Invalid/missing operations retain the conservative base contract until schema validation rejects them. */
export function modelToolCapabilityId(spec: ModelFacingToolSpec, args: unknown): string {
  const operation = args && typeof args === "object" && !Array.isArray(args)
    ? (args as Record<string, unknown>).operation : undefined;
  return typeof operation === "string" ? spec.operationCapabilityIds?.[operation] ?? spec.contractId : spec.contractId;
}
