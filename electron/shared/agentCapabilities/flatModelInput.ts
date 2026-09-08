// 能力契约 · 判别式 union → **模型可见的扁平入参**（G-01 的处方，方案 §3.2 S2 的升级版）。
//
// ── 它在解决哪个真实摩擦 ──
//
// 今天 `canvas.write` 的模型可见 schema 是一个 9 分支的根级 `anyOf`，真实成功率 **0/18**。
// 方案原本的处方是「拆成 3 个工具、每个 ≤4 分支」——但那治不了病，因为**拆完仍然是根级
// `anyOf`**：
//   · Anthropic 的适配器会把自定义工具 schema 的根级 `anyOf` **静默丢掉**（上游 pi #9134，
//     2026-09-04 已关）；
//   · Google 的 legacy `parameters` 路径是 OpenAPI 3.03，*"(including anyOf, oneOf, const, etc.)"*
//     只有新的 `parametersJsonSchema` 路径支持，而 Cloud Code Assist + Claude 走的是 legacy
//     那条（`pi-ai/dist/api/google-shared.js:278-281`）。
// 在那两条路上，一个根级 union 的工具**等于没有 schema**——这很可能就是 0/18 的第三个成因。
// pi 自己 8 个内建工具没有一个是根级 union，全是扁平 `Type.Object`。
//
// ── 为什么是「派生」而不是「重写」（这是本文件全部的设计重量）──
//
// 手工把 9 个分支抄成一个扁平对象，等于制造第二个真相源：以后加一个 operation，
// 两处都要记得改，漏一处的症状是「主进程收得下、模型看不见」——一种不会报错的病。
// 所以这里做的是**机械派生**：
//   · 作者继续写 `z.discriminatedUnion`（62 个文件的既有投资、TypeScript narrowing 全保住）；
//   · 派生出的扁平 schema **只负责被发布出去**；
//   · 校验仍然是原来那个 union 做的（`transform` 里跑一次 `union.safeParse`）。
// 于是「接受哪些输入、拒绝哪些输入」在**构造上**与原 union 逐字相同——不是靠测试碰运气
// 碰出来的相等，是没有第二份判断逻辑可以漂移。
//
// ── 校验仍然只发生一次 ──
//
// 发布出去的是扁平对象，pi 用它跑一遍 ajv（带 `normalizeOptionalNulls` + `Value.Convert`
// 两道官方容忍，G-08）；扁平对象只声明「有哪些字段、每个长什么样」，跨字段约束
// （哪个 operation 必须带哪些字段）由 `transform` 里那一次 union 校验裁决。
// 两者不重叠：前者是形状，后者是组合。**不是**两个互不认识的验证器各判一遍
// （那正是 #547 §2.2③「8 行报错只有 1 行是真的」的成因）。
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// `zodToJsonSchema` 的泛型签名会在 zod 的深层递归类型上把 tsc 顶爆
// （TS2589 "Type instantiation is excessively deep"）。仓库里已有先例，
// 同款处置：`mcpTransportSchemaFromZod.ts:29`。运行时行为一个字没变。
const convertToJsonSchema = zodToJsonSchema as unknown as (schema: unknown, options: Record<string, unknown>) => unknown;

import { modelFacingBranch } from "./jsonArgTolerance";

/** 同名字段在不同分支上声明成了不同形状——这是**作者的**问题，不能由派生器替他猜。 */
export class ConflictingBranchField extends Error {
  constructor(readonly unionName: string, readonly field: string, readonly branches: readonly string[]) {
    super(
      `"${unionName}" 的字段 "${field}" 在分支 ${branches.join(" / ")} 上声明成了不同形状。`
      + "扁平化只能发布其中一种，替你挑一个就等于悄悄放宽或收紧了另一个分支。"
      + "把它们改成同一个形状（更松的那个），把差额挪进 union 自己的 superRefine——"
      + "那一层照样会拒绝，而且拒绝的理由能说清是哪个 operation 要求的。",
    );
    this.name = "ConflictingBranchField";
  }
}

type AnyBranch = z.ZodObject<z.ZodRawShape>;

/**
 * 契约通常不是**裸** union，而且不一定是 `z.discriminatedUnion`：
 *   · `canvasWriteSemanticInputSchema` 是 `discriminatedUnion.superRefine(跨字段约束)`；
 *   · `timelineOperationSchema` 是一个**普通** `z.union`——因为它有一支带 `superRefine`
 *     （`ZodEffects`），而 `z.discriminatedUnion` 不收 effects 包着的分支。
 * 两种在**模型看到的 JSON Schema 里长得一模一样**（都是 `anyOf` + `const` 判别字段），
 * 所以两种都得能扁平化，否则门岗会拦住一个改法而那个改法不存在。
 *
 * 这里坚持只收**最外层**那个契约、自己往里剥，而不是让调用方分别递「union（取形状）」
 * 和「refined（做校验）」两个参数——那种 API 有一种必然会犯的错：只递 union。
 * 症状是扁平 schema 照常发布、跨字段约束**静默消失**，而两个参数看起来都对。
 * 探到这条的方式恰恰是它自己发生了一次：第一版实现取了 `_def.schema`，
 * `connect_canvas_edges` 给空数组当场变成合法。防线建在忘不掉的那一层（R28）。
 */
function unwrapEffects(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  for (;;) {
    const def = current._def as { typeName?: string; schema?: z.ZodTypeAny };
    if (def.typeName === z.ZodFirstPartyTypeKind.ZodEffects && def.schema) {
      current = def.schema;
      continue;
    }
    return current;
  }
}

interface UnionShape {
  readonly discriminator: string;
  readonly branches: readonly AnyBranch[];
}

function readUnion(schema: z.ZodTypeAny): UnionShape {
  const inner = unwrapEffects(schema);
  const def = inner._def as { typeName?: string; discriminator?: string; options?: unknown };
  const rawOptions = def.options;
  const options: z.ZodTypeAny[] = Array.isArray(rawOptions)
    ? (rawOptions as z.ZodTypeAny[])
    : rawOptions instanceof Map ? [...(rawOptions as Map<unknown, z.ZodTypeAny>).values()] : [];
  if (options.length === 0) {
    throw new Error("flattenDiscriminatedUnion 只收 union（可以裹着 refine/superRefine），收到的不是");
  }
  const branches = options.map((option) => {
    const bare = unwrapEffects(option);
    if ((bare._def as { typeName?: string }).typeName !== z.ZodFirstPartyTypeKind.ZodObject) {
      throw new Error("union 的每一支都必须是对象——扁平化没法合并非对象分支");
    }
    return bare as AnyBranch;
  });
  if (typeof def.discriminator === "string") return { discriminator: def.discriminator, branches };
  return { discriminator: inferDiscriminator(branches), branches };
}

/**
 * 普通 `z.union` 没有声明判别字段，所以从分支里推：**每一支都有、且都是字符串字面量、
 * 且取值互不相同**的那个字段名。推不出来就抛——扁平化一个没有判别字段的 union
 * 会把「这一支要 A，那一支要 B」压成「A 和 B 都是可选的」，那是真的放宽了语义。
 */
function inferDiscriminator(branches: readonly AnyBranch[]): string {
  const candidates = Object.keys(branches[0].shape).filter((key) =>
    branches.every((branch) => {
      const field = branch.shape[key];
      return field !== undefined
        && (unwrapEffects(field)._def as { typeName?: string }).typeName === z.ZodFirstPartyTypeKind.ZodLiteral;
    }));
  for (const key of candidates) {
    const values = branches.map((branch) => (unwrapEffects(branch.shape[key])._def as { value?: unknown }).value);
    if (values.every((value) => typeof value === "string") && new Set(values).size === values.length) return key;
  }
  throw new Error(
    "这个 union 没有一个「每支都有、都是字符串字面量、取值互不相同」的判别字段，扁平化会放宽语义。"
    + "给它加一个判别字段，或者别把它做成模型可见的入参。",
  );
}

/** 结构指纹与键序无关，否则「同一个 schema」会因为构造顺序不同被误判成冲突。 */
function fingerprint(schema: z.ZodTypeAny): string {
  return stableStringify(convertToJsonSchema(schema, { $refStrategy: "none", effectStrategy: "input" }));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * 剥掉 optional/default/nullable 的外壳，比较字段**本体**的形状；顺带把过渡补丁 T1 的
 * 「同一个值的 JSON 文本」运输分支收掉（`modelFacingBranch`）。
 *
 * 后半句不是顺手做的：那条分支在模型可见 schema 上是一个 `anyOf`，而 Google 的 legacy
 * `parameters` 路径压根不支持 `anyOf`——扁平化把根级 union 消掉了，却在字段级留一个，
 * 等于把病从大门挪到窗户。新通路的容忍住在 `prepareArguments`（校验之前），
 * 契约本身回到干净的 `z.array(...)`。
 */
function core(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  for (;;) {
    const def = current._def as { typeName?: string; innerType?: z.ZodTypeAny };
    if (
      def.typeName === z.ZodFirstPartyTypeKind.ZodOptional
      || def.typeName === z.ZodFirstPartyTypeKind.ZodDefault
      || def.typeName === z.ZodFirstPartyTypeKind.ZodNullable
    ) {
      if (!def.innerType) return current;
      current = def.innerType;
      continue;
    }
    return modelFacingBranch(current);
  }
}

function discriminatorValue(branch: AnyBranch, discriminator: string): string {
  const field = core(branch.shape[discriminator]);
  const value = (field._def as { value?: unknown }).value;
  if (typeof value !== "string") {
    throw new Error(`判别字段 "${discriminator}" 的分支值必须是字符串字面量，收到 ${typeof value}`);
  }
  return value;
}

export interface FlattenOptions {
  /** 进报错用。它是这条信息里唯一能让人「知道去哪儿看」的东西。 */
  readonly name: string;
  /** 判别字段自己的说明。不给就用一句派生的。 */
  readonly discriminatorDescription?: string;
}

/**
 * `z.discriminatedUnion` → 一个扁平 `z.object`，**接受/拒绝的输入集合与原 union 完全相同**。
 *
 * 产物形状：
 *   · 判别字段 → `z.enum([...分支值])`（不是 `z.literal`——`z.literal` 生成 `const`，
 *     而 Google 的 OpenAPI 3.03 路径不认 `const`，G-05）；
 *   · 其余字段 → 全部 optional，描述前缀标明「哪几个 operation 会用到我」
 *     （模型要靠这个做参数绑定，没有它扁平化就是把 9 张说明书混成一张）；
 *   · 组合约束 → `transform` 里那一次 `union.safeParse`，issue 原样搬过来。
 */
export function flattenDiscriminatedUnion<T extends z.ZodTypeAny>(
  contract: T,
  options: FlattenOptions,
): z.ZodType<z.output<T>, z.ZodTypeDef, unknown> {
  const { discriminator, branches } = readUnion(contract);
  const values = branches.map((branch) => discriminatorValue(branch, discriminator));

  const merged = new Map<string, { schema: z.ZodTypeAny; print: string; operations: string[] }>();
  branches.forEach((branch: AnyBranch, index: number) => {
    for (const [field, schema] of Object.entries(branch.shape)) {
      if (field === discriminator) continue;
      const bare = core(schema as z.ZodTypeAny);
      const print = fingerprint(bare);
      const existing = merged.get(field);
      if (!existing) {
        merged.set(field, { schema: bare, print, operations: [values[index]] });
        continue;
      }
      if (existing.print !== print) {
        throw new ConflictingBranchField(options.name, field, [...existing.operations, values[index]]);
      }
      existing.operations.push(values[index]);
    }
  });

  const shape: z.ZodRawShape = {
    [discriminator]: z
      .enum(values as [string, ...string[]])
      .describe(options.discriminatorDescription ?? `Which action to perform. Every other field is required by, or only meaningful to, specific values here.`),
  };
  for (const [field, entry] of merged) {
    // 这个前缀不是装饰：扁平化把 N 张说明书合成了一张，模型必须知道「这个字段属于哪个
    // operation」才填得对。ToolRobustBench 把这一段单独归成「参数绑定」失败，
    // 而它恰恰是扁平化唯一可能引入的新失败模式——所以补偿必须和扁平化同一处生成。
    const scope = `[for ${entry.operations.join(", ")}]`;
    const existing = entry.schema.description;
    shape[field] = entry.schema.describe(existing ? `${scope} ${existing}` : scope).optional();
  }

  return z
    .object(shape)
    .strict()
    .transform((value, ctx): z.output<T> => {
      // 校验用的是**最外层契约**，不是里面那个裸 union：跨字段约束住在外层的 refine 上。
      const parsed = contract.safeParse(value);
      if (parsed.success) return parsed.data as z.output<T>;
      for (const issue of parsed.error.issues) ctx.addIssue(issue);
      return z.NEVER as never;
    }) as unknown as z.ZodType<z.output<T>, z.ZodTypeDef, unknown>;
}
