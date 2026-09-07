/**
 * `check:model-schema` —— 模型可见 schema 的身份式棘轮（方案 §8.2 草案落地）。
 *
 * **它在解决哪个真实摩擦**：模型给分镜表写 24 行，而它看到的 schema 只说
 * 「shots 是一个由任意对象组成的数组」——25 个字段名一个都没告诉它。真实成功率
 * **0/18**（`docs/audit/2026-09-06-agent-tool-layer-audit.md` §3.2）。今天没有任何机制
 * 在「写下一个空 schema」的那一刻拦住它：`z.record(z.unknown())` 编译得过、
 * 单测过、MCP 广播得出去，只有真模型会在半年后用一次失败告诉你。
 *
 * **为什么是身份式而不是计数式**（实核两种存量棘轮的差别）：
 *   · `check:heavy-path` 是计数式（`{ruleId: count}`）——修一条、偷加一条，总数不变就蒙混过关。
 *   · `check:boundaries` 是身份式（存每条违规的身份串）——`added` 红、`removed` 也红。
 * 模型可见 schema 恰恰是「可以修掉一个工具、同时在另一个工具上犯同样的错」那一族，
 * 所以取身份式，与 `check:boundaries` 同款纪律。
 *
 * **三个 profile 一起扫**，因为「内外同源」（方案 §3.6）要求外部宿主看到的 schema
 * 不弱于内部 agent：
 *   · `lane`     —— 新通路的模型可见工具面（`electron/agentLane/laneToolCatalog.ts`）
 *   · `internal` —— 旧通路发给 pi 的工具表（`modelToolSurfaceManifest`）
 *   · `mcp`      —— 对外 `tools/list` 真正广播出去的那份（`MCP_TOOL_RESOLVER`）
 *
 * 用法：
 *   pnpm exec tsx scripts/check-model-schema.ts                    校验（棘轮）
 *   pnpm exec tsx scripts/check-model-schema.ts --update-baseline  重算冻结基线
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MCP_TOOL_RESOLVER } from "../electron/capabilityCore/mcpToolCatalog";
import {
  collectStructuralFailures, collectVendorCompatibilityFailures, toPublishedJsonSchema,
} from "../electron/shared/agentCapabilities/modelVisibleJsonSchema";
import { LANE_MODEL_TOOL_CATALOG } from "../electron/agentLane/laneToolCatalog";
import { modelToolSurfaceManifest } from "../electron/harness/tools/modelToolSurfaceManifest";
import {
  evaluateLaneToolBudget, LANE_TOOL_REQUEST_TOOL_NAME, LANE_TOOL_SCHEMA_TOKEN_CEILING,
  type LaneToolCombination,
} from "../electron/agentLane/laneToolGroups.mjs";
import { LANE_CODING_TOOL_NAMES } from "../electron/agentLane/laneCodingTools.mjs";
import { laneToolModelDescription } from "../electron/shared/agentLane/laneToolContract";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const baselinePath = path.join(repoRoot, "scripts", "model-schema-baseline.json");

/** 描述够不够厚的门槛。上游 Anthropic 的原话是「by far the most important factor in tool performance」。 */
const MIN_DESCRIPTION_CHARS = 120;
/** 到了这个复杂度还没有示例，模型只能猜形状（#547：35/35 零示例）。 */
const EXAMPLE_REQUIRED_FIELD_COUNT = 10;

type Profile = "lane" | "internal" | "mcp";

interface ModelVisibleTool {
  profile: Profile;
  name: string;
  description: string;
  /** 已经是模型真正收到的那份 JSON Schema。 */
  schema: Record<string, unknown>;
  /** 描述里带没带一个 schema-valid 的示例（S5）。 */
  hasExample: boolean;
}

type RuleId =
  | "empty-schema"
  | "root-union"
  | "const-instead-of-enum"
  | "identical-input-schema"
  | "thin-description"
  | "missing-example";

const RULE_ORDER: readonly RuleId[] = [
  "empty-schema",
  "root-union",
  "const-instead-of-enum",
  "identical-input-schema",
  "thin-description",
  "missing-example",
];

interface Finding {
  rule: RuleId;
  /** 稳定身份。修掉一条必须同步删基线那一行。 */
  identity: string;
  /** 人话，进报错——「schema 不合法」这句话救不了任何人。 */
  detail: string;
}

// ── 枚举模型可见工具 ────────────────────────────────────────────────────────

function collectTools(): ModelVisibleTool[] {
  const tools: ModelVisibleTool[] = [];

  for (const tool of LANE_MODEL_TOOL_CATALOG) {
    tools.push({
      profile: "lane",
      name: tool.name,
      description: tool.description,
      schema: toPublishedJsonSchema(tool.schema),
      hasExample: tool.examples.length > 0,
    });
  }

  const internal = [
    ...modelToolSurfaceManifest.generation,
    ...modelToolSurfaceManifest.editing,
    ...modelToolSurfaceManifest.canvas,
    ...modelToolSurfaceManifest.document,
  ];
  for (const tool of internal) {
    tools.push({
      profile: "internal",
      name: tool.name,
      description: tool.intent,
      schema: toPublishedJsonSchema(tool.inputSchema),
      hasExample: hasInlineExample(tool.intent),
    });
  }

  for (const tool of MCP_TOOL_RESOLVER.list() as readonly {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }[]) {
    tools.push({
      profile: "mcp",
      name: tool.name,
      description: tool.description ?? "",
      schema: tool.inputSchema ?? {},
      hasExample: hasInlineExample(tool.description ?? ""),
    });
  }

  return tools;
}

/**
 * 示例写进 description（不用 Anthropic 专有的 `input_examples`——我们要跨供应商，
 * 方案 §3.2 S5）。认的是一段 JSON 对象字面量，不是「例如」两个字。
 */
function hasInlineExample(description: string): boolean {
  return /\{[\s\S]*"[\w-]+"\s*:/.test(description);
}

// ── 规则 ───────────────────────────────────────────────────────────────────


/**
 * 规则本体不住在这里——生成点（`electron/agentLane/laneToolSchema.mts`）与本门岗用的是
 * **同一份** `electron/shared/agentCapabilities/modelVisibleJsonSchema.ts`。
 *
 * 第一版这两处各写了一份，注释里写着「两边必须逐字相同」。那句话本身就是漂移预警：
 * 靠人记得的相同，是还没发生的不同。生成点拦新写的、门岗拦存量，**判据只有一条**。
 */

function schemaFingerprint(schema: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(stableStringify(schema)).digest("hex").slice(0, 16);
}

/** 结构指纹要与键序无关，否则「同一个 schema」会因为构造顺序不同而看起来不同。 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * schema 里还留着一个「要模型再选一次动作」的选择点吗？
 *
 * 两种形态，都算：
 *   · **根级 union**——一个根 `anyOf` 本身就是「请从这几支里挑一支」；
 *   · **根级属性上的多值枚举**——扁平化之后的同一件事（`operation: enum[...]`）。
 * 嵌套字段里的枚举（`edges[].mode` 那种）不算：那是数据取值，不是动作选择。
 */
function hasMultiValueEnumField(schema: Record<string, unknown>): boolean {
  for (const keyword of ["anyOf", "oneOf"]) {
    const branches = schema[keyword];
    if (Array.isArray(branches) && branches.length > 1) return true;
  }
  const properties = schema.properties;
  if (!properties || typeof properties !== "object") return false;
  return Object.values(properties as Record<string, unknown>).some((field) => {
    const values = (field as Record<string, unknown> | null)?.enum;
    return Array.isArray(values) && values.length > 1;
  });
}

function countFields(schema: Record<string, unknown>): number {
  const properties = schema.properties;
  if (!properties || typeof properties !== "object") return 0;
  return Object.keys(properties as Record<string, unknown>).length;
}

function analyse(tools: readonly ModelVisibleTool[]): Finding[] {
  const findings: Finding[] = [];

  for (const tool of tools) {
    const where = `${tool.profile}/${tool.name}`;

    const structural: string[] = [];
    collectStructuralFailures(tool.schema, "", structural);
    for (const detail of structural) {
      findings.push({ rule: "empty-schema", identity: `${where}#${detail.split(" ")[0]}`, detail: `${where} ${detail}` });
    }

    // 供应商底线两条一起收：根级 union 的身份是工具本身（一个工具只可能有一个根），
    // `const` 的身份带上 JSON 指针（同一个工具里可能有好几个，修掉一个要能单独销账）。
    const vendor: string[] = [];
    collectVendorCompatibilityFailures(tool.schema, "", vendor);
    for (const detail of vendor) {
      const isRootUnion = /的根是一个 (anyOf|oneOf|allOf)/.test(detail);
      findings.push({
        rule: isRootUnion ? "root-union" : "const-instead-of-enum",
        identity: isRootUnion ? where : `${where}#${detail.split(" ")[0]}`,
        detail: `${where} ${detail}`,
      });
    }

    if (tool.description.trim().length < MIN_DESCRIPTION_CHARS) {
      findings.push({
        rule: "thin-description",
        identity: where,
        detail: `${where} 的描述只有 ${tool.description.trim().length} 字符`
          + `（门槛 ${MIN_DESCRIPTION_CHARS}）——说清「干什么 / 有什么限制 / 输出会不会被截断」`,
      });
    }

    const fieldCount = countFields(tool.schema);
    if (fieldCount >= EXAMPLE_REQUIRED_FIELD_COUNT && !tool.hasExample) {
      findings.push({
        rule: "missing-example",
        identity: where,
        detail: `${where} 有 ${fieldCount} 个字段却没有示例——把一个 schema-valid 的调用写进 description`,
      });
    }
  }

  // S3 · 两个模型可见工具让模型只能抛硬币。
  //
  // 判据不是「schema 相同」那么简单——那会把一整族**故意**共享 schema 的工具误判成 bug。
  // `insert_at_cursor` / `append_to_end` / `replace_selection` 的入参都是 `{content}`，
  // 但**动作由工具名定死**，schema 里没有任何东西要模型再选一次；#547 的数据说这一族
  // 的真实成功率就是 100%。
  //
  // 真正的病是另一种：`nomi_canvas_plan` 与 `nomi_canvas_edit` 字节级相同（各 8238 B），
  // **而且两者的 schema 里都还留着一个 9 值的 `operation` 枚举**——也就是说两个名字
  // 什么也没区分开，两个工具都能做全部 9 件事。真机序列
  // `plan→edit→edit→edit→plan→edit→plan` 就是在两枚一模一样的硬币间抛。
  //
  // 所以判据是：**schema 相同 + schema 里仍留着一个多值判别枚举**。
  // 前者说「两个工具长得一样」，后者说「名字没承担区分的责任」。缺任何一半都不成立。
  for (const profile of ["lane", "internal", "mcp"] as const) {
    const byFingerprint = new Map<string, string[]>();
    for (const tool of tools.filter((candidate) => candidate.profile === profile)) {
      if (!hasMultiValueEnumField(tool.schema)) continue;
      const fingerprint = schemaFingerprint(tool.schema);
      byFingerprint.set(fingerprint, [...(byFingerprint.get(fingerprint) ?? []), tool.name]);
    }
    for (const [fingerprint, names] of byFingerprint) {
      if (names.length < 2) continue;
      const sorted = [...names].sort();
      findings.push({
        rule: "identical-input-schema",
        identity: `${profile}/${sorted.join("+")}`,
        detail: `${profile}：${sorted.join(" 与 ")} 的 inputSchema 结构完全相同（指纹 ${fingerprint}），`
          + "而 schema 里仍有一个多值枚举要模型再选一次动作——两个工具名什么也没区分开，模型只能抛硬币",
      });
    }
  }

  return findings;
}

// ── 棘轮 ───────────────────────────────────────────────────────────────────

interface Baseline {
  _comment?: readonly string[];
  [rule: string]: readonly string[] | Record<string, string> | undefined;
}

function readBaseline(): Baseline | null {
  if (!fs.existsSync(baselinePath)) return null;
  return JSON.parse(fs.readFileSync(baselinePath, "utf8")) as Baseline;
}

function writeBaseline(findings: readonly Finding[]): void {
  const out: Record<string, unknown> = {
    _comment: [
      "模型可见 schema 棘轮基线（方案 §8.2）：身份式，只减不增。",
      "规则住 scripts/check-model-schema.ts；本文件冻结存量违规的具体身份（非裸数字）。",
      "身份 = <profile>/<tool> 或 <profile>/<tool>#<json-pointer>。",
      "修掉一条必须同步删这里对应一行；新增违规当场报红，不许追加进本文件抬高基线。",
      "归零时点：方案阶段 4（切换 PR）。基线不归零 = 重做没做完（G7）。",
    ],
  };
  for (const rule of RULE_ORDER) {
    const identities = [...new Set(findings.filter((f) => f.rule === rule).map((f) => f.identity))].sort();
    if (identities.length > 0) out[rule] = identities;
  }
  fs.writeFileSync(baselinePath, `${JSON.stringify(out, null, 2)}\n`);
}

function baselineIdentities(baseline: Baseline, rule: RuleId): Set<string> {
  const entry = baseline[rule];
  if (!entry) return new Set();
  return new Set(Array.isArray(entry) ? entry : Object.keys(entry));
}


// ── 预算与按需装载（阶段 5c）────────────────────────────────────────────────
//
// 两条判据住在 `electron/agentLane/laneToolGroups.mts`（生产代码那一份），这里只负责
// **量出真实的三个组合**再喂给它。为什么量在门岗里而不是在生产代码里：coding 组的
// schema 来自 pi 的工厂，只有真的把 7 个工具建出来才知道它们有多大——生产代码在
// 装配时已经建过一次，门岗要的是**不起 App 就能量**（`laneToolCatalog.ts` 头部那条纪律）。

/** pi 自己的 token 估法（`estimateTokens`，chars/4，偏保守）。**不另写一个估算器**（R29）。 */
async function estimateSchemaTokens(chunks: readonly string[]): Promise<number> {
  const { estimateTokens } = await import("@earendil-works/pi-coding-agent");
  const asMessage = (text: string) => ({ role: "user" as const, content: [{ type: "text" as const, text }] });
  return chunks.reduce((sum, chunk) => sum + estimateTokens(asMessage(chunk) as never), 0);
}

async function laneToolCombinations(): Promise<LaneToolCombination[]> {
  const alwaysOnChunks = LANE_MODEL_TOOL_CATALOG.map(
    (tool) => laneToolModelDescription(tool) + JSON.stringify(toPublishedJsonSchema(tool.schema)));
  const pi = await import("@earendil-works/pi-coding-agent");
  const codingByName = new Map<string, { description: string; parameters: unknown }>();
  for (const tool of [...pi.createCodingTools("/nomi-schema-probe"), ...pi.createReadOnlyTools("/nomi-schema-probe")]) {
    codingByName.set(tool.name, { description: tool.description ?? "", parameters: tool.parameters });
  }
  const missing = LANE_CODING_TOOL_NAMES.filter((name) => !codingByName.has(name));
  if (missing.length > 0) {
    throw new Error(
      `pi 不再提供这些 coding 工具：${missing.join(", ")}。`
      + "上游改了工具面——先读 CHANGELOG 决定跟不跟，别在这里补一个自研版本（R29）。",
    );
  }
  const codingChunks = LANE_CODING_TOOL_NAMES.map((name) => {
    const tool = codingByName.get(name)!;
    return tool.description + JSON.stringify(tool.parameters);
  });
  // `nomi_request_tools` 的 schema 极小，但它**常驻**，所以每个组合都算上它。
  const requestToolChunk = JSON.stringify({
    name: LANE_TOOL_REQUEST_TOOL_NAME,
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  });

  const alwaysOn = await estimateSchemaTokens([...alwaysOnChunks, requestToolChunk]);
  const coding = await estimateSchemaTokens(codingChunks);
  return [
    { label: "always-on（锁着）", toolNames: LANE_MODEL_TOOL_CATALOG.map((t) => t.name), estimatedTokens: alwaysOn },
    {
      label: "always-on + coding（解锁后）",
      toolNames: [...LANE_MODEL_TOOL_CATALOG.map((t) => t.name), ...LANE_CODING_TOOL_NAMES],
      estimatedTokens: alwaysOn + coding,
    },
  ];
}

async function checkLaneToolBudget(): Promise<boolean> {
  const combinations = await laneToolCombinations();
  for (const combination of combinations) {
    console.log(`  · ${combination.label}：${combination.toolNames.length} 个工具，约 ${combination.estimatedTokens} token`);
  }
  const failures = evaluateLaneToolBudget({
    alwaysOnCount: LANE_MODEL_TOOL_CATALOG.length,
    combinations,
  });
  if (failures.length === 0) {
    console.log(
      `✅ lane 工具预算通过（always-on ≤ ${LANE_MODEL_TOOL_CATALOG.length <= 12 ? 12 : "?"} 且任一组合 ≤ ${LANE_TOOL_SCHEMA_TOKEN_CEILING} token）。`);
    return true;
  }
  console.error("\n✖ lane 工具预算超了：");
  for (const failure of failures) console.error(`   · ${failure}`);
  return false;
}

async function main(): Promise<void> {
  const tools = collectTools();
  const findings = analyse(tools);
  const byRule = new Map<RuleId, Map<string, string>>();
  for (const finding of findings) {
    const bucket = byRule.get(finding.rule) ?? new Map<string, string>();
    if (!bucket.has(finding.identity)) bucket.set(finding.identity, finding.detail);
    byRule.set(finding.rule, bucket);
  }

  if (process.argv.includes("--update-baseline")) {
    writeBaseline(findings);
    const counts = RULE_ORDER.map((rule) => `${rule}=${byRule.get(rule)?.size ?? 0}`).join(", ");
    console.log(`✅ 已重算模型可见 schema 基线：${counts}`);
    console.log(`   → ${path.relative(repoRoot, baselinePath)}`);
    return;
  }

  const baseline = readBaseline();
  if (baseline === null) {
    console.error(`✖ 缺少 ${path.relative(repoRoot, baselinePath)}；先核对实扫结果，再用 --update-baseline 初始化存量`);
    process.exitCode = 1;
    return;
  }

  const added: Finding[] = [];
  const removed: { rule: RuleId; identity: string }[] = [];
  for (const rule of RULE_ORDER) {
    const current = byRule.get(rule) ?? new Map<string, string>();
    const frozen = baselineIdentities(baseline, rule);
    for (const [identity, detail] of current) if (!frozen.has(identity)) added.push({ rule, identity, detail });
    for (const identity of frozen) if (!current.has(identity)) removed.push({ rule, identity });
  }

  const totalCurrent = RULE_ORDER.reduce((n, rule) => n + (byRule.get(rule)?.size ?? 0), 0);
  const totalFrozen = RULE_ORDER.reduce((n, rule) => n + baselineIdentities(baseline, rule).size, 0);
  const byProfile = (["lane", "internal", "mcp"] as const)
    .map((profile) => `${profile} ${tools.filter((tool) => tool.profile === profile).length}`)
    .join(" / ");
  console.log(
    `模型可见 schema：${tools.length} 个工具（${byProfile}）；当前 ${totalCurrent} 处违规；`
    + `基线冻结 ${totalFrozen} 处（棘轮只减不增，阶段 4 归零）`,
  );

  if (added.length > 0) {
    console.error(`\n✖ 模型可见 schema 回归：${added.length} 处**新增**违规（不在基线里）：`);
    for (const { rule, detail } of added) console.error(`   · [${rule}] ${detail}`);
    console.error("");
    console.error("  这一族的失败不会在本地出现：它编译得过、单测过、广播得出去，只有真模型会用一次失败告诉你。");
    console.error("  修法见 docs/plan/2026-09-07-agent-runtime-rebuild.md §3.2 与 §8.2。");
    console.error("  绝不允许把新违规追加进 model-schema-baseline.json 抬高基线。");
    process.exitCode = 1;
    return;
  }

  if (removed.length > 0) {
    console.error(`\n✖ 基线过期：${removed.length} 处违规已消失，但仍留在基线里（成了永久豁免）：`);
    for (const { rule, identity } of removed) console.error(`   · [${rule}] ${identity}`);
    console.error("");
    console.error(`  你修好了一处——请从 ${path.relative(repoRoot, baselinePath)} 删掉对应行以锁定战果（棘轮只减不增）。`);
    console.error("  或直接跑：pnpm exec tsx scripts/check-model-schema.ts --update-baseline");
    process.exitCode = 1;
    return;
  }

  console.log("✅ 模型可见 schema 棘轮通过（无新增空 schema / 根级 union / const / 重复工具；基线只减不增）。");

  if (!(await checkLaneToolBudget())) process.exitCode = 1;
}

void main();
