// `document.read` / `document.write` 的模型可见描述符（说明书那一半，两个 profile 共用）。
//
// 为什么先选这两个：#547 实测它们今天就是 **100%**（读类 37/37）。所以垂直切片里
// 任何一次失败都能干净地归因到**新通路**，而不是「模型本来就填不对」。
//
// 三条形状规则，全部来自 #547 的真实数据而不是审美：
//   ① **一个别名 = 一个工具**。`read_full_text` / `read_selection` 是两个工具，不是一个
//      带 `scope` 枚举的工具——出问题的从来不是「工具多」，是「一个工具里塞 9 个分支」。
//   ② **别名定死的字段不出现在模型可见 schema 里**。`read_full_text` 的 `scope` 已经由
//      名字说完了，再让模型填一次就是请它多做一次可能做错的选择。那个值不会消失，
//      它以 `aliasBoundInput` 的形式留在描述符上——**对外 MCP 的 `scope` 枚举正是从它派生的**。
//   ③ **容忍在 `prepareArguments`，不在 schema**。schema 不合法的参数根本走不到执行边界，
//      pi 的校验器先把它拦下；放松 schema 则是对**所有**调用放松，那是 0/18 的来历。
//
// 阶段 5a 的增量：这份说明书从 `electron/agentLane/laneDocumentTools.ts` 搬到能力契约旁边，
// 因为它**不属于任何一个 profile**——对外 MCP 的 `nomi_document_read` 从今天起读的是同一份。
import { z } from "zod";

import {
  DOCUMENT_READ_ALIASES,
  documentReadScopeForAlias,
  type DocumentReadInput,
} from "./documentRead";
import {
  DOCUMENT_WRITE_ALIASES,
  documentWriteOperationForAlias,
  type DocumentWriteInput,
} from "./documentWrite";
import {
  LANE_MODEL_OUTPUT_MAX_BYTES,
  LANE_MODEL_OUTPUT_MAX_LINES,
} from "../agentLane/laneContracts";
import { modelArgumentTolerance, noArgumentTolerance } from "./modelArgumentTolerance";
import { NO_ARGUMENTS_SCHEMA, type ModelFacingToolSpec } from "./modelFacingTools";

/**
 * 说明书和执行必须是同一个数（G-04）。这句话里的两个上限**不是抄的**，是从
 * `laneContracts.ts` 的同一对常量插出来的——截断真正发生的地方（`laneTools.mts`）
 * 读的也是它们。原来这里写的是 "with no truncation"，那句话在截断落地的那一刻
 * 就变成了一句谎：模型会把半截原稿当成全文，而它读到的说明书告诉它「不会被截」。
 */
const OUTPUT_LIMIT_SENTENCE = `Long text is truncated to the first ${LANE_MODEL_OUTPUT_MAX_LINES} lines or ${
  LANE_MODEL_OUTPUT_MAX_BYTES / 1024
}KB, whichever comes first; when that happens the result says so and tells you what to do next.`;

/**
 * 通道③ · 这一族工具共享的纪律，**只写一次**。
 *
 * 上游 pi 把「该用它还是用隔壁那个」放进系统提示词的 `Guidelines`，去重且按实际工具集
 * 条件化（`core/system-prompt.js:45-76`）。写进每个工具的 description 等于把同一段话
 * 买 N 遍——那正是方案原本的 S4 与 S7（≤4000 token）在数学上互斥的地方。
 */
const DOCUMENT_GUIDELINES = Object.freeze([
  "Read the creation document before you change it: the user may have edited it since the last thing you saw.",
  "Write finished prose into the document, never a diff, a summary of your change, or a plan to write it later.",
]);

const READ_SPECS: Readonly<Record<DocumentReadInput["scope"], { description: string; snippet: string }>> = {
  full: {
    description: [
      "Read the entire creation document as plain text.",
      "Takes no arguments; the returned text is the document exactly as the user sees it.",
      OUTPUT_LIMIT_SENTENCE,
    ].join(" "),
    snippet: "read the whole creation document as plain text.",
  },
  selection: {
    description: [
      "Read only the text the user currently has selected in the creation document.",
      "Takes no arguments; returns an empty string when nothing is selected, which means you should ask rather than guess.",
      OUTPUT_LIMIT_SENTENCE,
    ].join(" "),
    snippet: 'read just the text the user has selected — the only way to resolve "this" or "here".',
  },
};

const WRITE_SPECS: Readonly<Record<DocumentWriteInput["operation"], { description: string; snippet: string }>> = {
  insert: {
    description: [
      "Insert new text into the creation document at the user's cursor.",
      "Existing text is never removed; everything after the cursor is pushed down.",
      "Pass the finished prose in `content` — not a diff, not a description of what you would write.",
    ].join(" "),
    snippet: "insert finished prose at the user's cursor, pushing later text down.",
  },
  replace: {
    description: [
      "Replace the text the user currently has selected with new text.",
      "The selection disappears and `content` takes its place, so read the selection first unless the user told you exactly what to write.",
      "Pass the finished prose in `content`; an empty selection makes this behave like an insertion at the cursor.",
    ].join(" "),
    snippet: "swap the user's current selection for new prose.",
  },
  append: {
    description: [
      "Append text to the very end of the creation document.",
      "Nothing existing is touched and the cursor position is irrelevant, which makes this the safe choice for adding a new section.",
      "Pass the finished prose in `content`, including any leading blank line you want between it and the previous text.",
    ].join(" "),
    snippet: "add a new section at the very end of the document.",
  },
};

const writeContentSchema = z
  .object({
    content: z
      .string()
      .min(1)
      .describe("The exact text to write into the document. Plain prose or Markdown, never a diff or a summary of the change."),
  })
  .strict();

/**
 * 文稿这一族的副作用声明（第 ⑨ 维）。
 *
 * 与画布那一族差一档：文稿写入是**直接落进用户的稿子**的，它只是进了撤销栈
 * （`reversal: "undoable"`），不像画布提案那样还等一次接受。这一档差别过去只存在于
 * 两个领域适配器的实现里，模型面和恢复策略都看不见它。
 */
const DOCUMENT_READ_EFFECTS = Object.freeze({ mutates: false, billable: false, reversal: "none" } as const);
const DOCUMENT_WRITE_EFFECTS = Object.freeze({ mutates: true, billable: false, reversal: "undoable" } as const);

/**
 * 写入工具的容忍：`content` 是这一族里唯一会被写错的字段，实机见过三种写法——
 * 整包参数被序列化成 JSON 字符串、字段名写成 `text`/`body`、正文拆成字符串数组。
 * 三种都是「意思对、形状错」，捏合它们不放松任何语义。
 *
 * 前两种由共享的 `modelArgumentTolerance` 处理（A 族与 D 族）；第三种是这一族特有的
 * ——数组元素拼回一整段正文，而不是包成一元数组——所以在这里补一小步。
 */
const prepareWriteArguments = (() => {
  const shared = modelArgumentTolerance({ fieldAliases: { content: ["text", "body"] } });
  return (args: unknown): Record<string, unknown> => {
    if (typeof args === "string" && !args.trim().startsWith("{")) return { content: args };
    const record = shared(args);
    if (Array.isArray(record.content)) {
      record.content = record.content.filter((part): part is string => typeof part === "string").join("");
    }
    return record;
  };
})();

/**
 * 「哪一份文稿」——**只有外部宿主需要说**（`ModelFacingToolSpec.mcpTransportFields`）。
 *
 * Agent lane 是有头的：它写的永远是用户此刻正看着的那份（渲染层的 `activeDocumentId`），
 * 模型多填一个 id 只能填错。外部宿主是无头的，`dispatcher.ts` 的 `document.read` /
 * `document.write` 从租约加这个 id 定位文稿。它**不进语义输入**（契约只认 `scope` /
 * `operation` + `content`），所以也不进两个 profile 的指纹比对。
 */
const DOCUMENT_ID_TRANSPORT_FIELD = Object.freeze({
  documentId: Object.freeze({
    type: "string" as const,
    minLength: 1,
    description: "Which document to act on. Omit to use the project's active creation document.",
  }),
});

export function documentModelToolSpecs(): ModelFacingToolSpec[] {
  const reads = (Object.values(DOCUMENT_READ_ALIASES) as string[]).map((alias): ModelFacingToolSpec => {
    const scope = documentReadScopeForAlias(alias);
    if (!scope) throw new Error(`Unregistered document.read alias: ${alias}`);
    return {
      contractId: "document.read",
      name: alias,
      description: READ_SPECS[scope].description,
      promptSnippet: READ_SPECS[scope].snippet,
      promptGuidelines: DOCUMENT_GUIDELINES,
      effects: DOCUMENT_READ_EFFECTS,
      schema: NO_ARGUMENTS_SCHEMA,
      examples: [{ when: "Always call it with no arguments:", arguments: {} }],
      // 别名定死的语义输入。MCP 的 `scope` 枚举就是这几个值的并集——没有第二套词表。
      aliasBoundInput: Object.freeze({ scope }),
      mcpTransportFields: DOCUMENT_ID_TRANSPORT_FIELD,
      prepareArguments: noArgumentTolerance,
    };
  });
  const writes = (Object.values(DOCUMENT_WRITE_ALIASES) as string[]).map((alias): ModelFacingToolSpec => {
    const operation = documentWriteOperationForAlias(alias);
    if (!operation) throw new Error(`Unregistered document.write alias: ${alias}`);
    return {
      contractId: "document.write",
      name: alias,
      description: WRITE_SPECS[operation].description,
      promptSnippet: WRITE_SPECS[operation].snippet,
      promptGuidelines: DOCUMENT_GUIDELINES,
      effects: DOCUMENT_WRITE_EFFECTS,
      schema: writeContentSchema,
      examples: [{ when: "Write one finished paragraph:", arguments: { content: "The rain had not stopped for three days." } }],
      aliasBoundInput: Object.freeze({ operation }),
      mcpTransportFields: DOCUMENT_ID_TRANSPORT_FIELD,
      prepareArguments: prepareWriteArguments,
    };
  });
  return [...reads, ...writes];
}
