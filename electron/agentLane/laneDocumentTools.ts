// Agent lane · `document.read` / `document.write` 的**执行那一半**。
//
// 说明书那一半（名字、三条描述通道、schema、示例、容忍钩子、副作用声明）住
// `electron/shared/agentCapabilities/documentModelTools.ts` —— 它不属于任何一个 profile，
// 对外 MCP 的 `nomi_document_read` / `nomi_document_edit` 读的是同一份（方案 §3.1，阶段 5a）。
// 留在这里的只有「拿到参数之后真的去动编辑器」那一步，它需要一个活着的领域 port。
import {
  documentReadScopeForAlias,
  projectDocumentRead,
  type DocumentReadInput,
  type DocumentReadResult,
} from "../shared/agentCapabilities/documentRead";
import {
  documentWriteOperationForAlias,
  documentWriteResultSchema,
  type DocumentWriteInput,
  type DocumentWriteResult,
} from "../shared/agentCapabilities/documentWrite";
import { documentModelToolSpecs } from "../shared/agentCapabilities/documentModelTools";
import { bindLaneTool, type LaneToolDescriptor, type LaneToolExecutionContext } from "./laneRuntimePort";

/** 领域侧。lane 不认识编辑器，只认识这两个动作——K4/K5 的「按 id 引用，永不复制」同一条纪律。 */
export interface DocumentLanePort {
  read(scope: DocumentReadInput["scope"], context: LaneToolExecutionContext): Promise<unknown>;
  write(input: DocumentWriteInput, context: LaneToolExecutionContext): Promise<DocumentWriteResult>;
}

export function createDocumentLaneTools(port: DocumentLanePort): LaneToolDescriptor[] {
  return documentModelToolSpecs().map((spec) => {
    const scope = documentReadScopeForAlias(spec.name);
    if (scope) {
      return bindLaneTool(spec, async (_args, context) => {
        const result: DocumentReadResult = projectDocumentRead(await port.read(scope, context));
        return { ok: true, text: result.text, details: { scope } };
      });
    }
    const operation = documentWriteOperationForAlias(spec.name);
    if (!operation) throw new Error(`Unregistered document lane tool: ${spec.name}`);
    return bindLaneTool(spec, async (args, context) => {
      // 形状由 pi 的 ajv 验过、契约 parse 由 `laneTools.mts` 在唯一出口跑过，才轮到这里。
      // 这里**不再** parse——再来一遍就是第二个互不认识的验证器（#547 §2.2③）。
      const { content } = args as { content: string };
      // 领域适配器的**输出**仍然校验：那是能力契约的收据形状（K1），
      // 与「模型输入校验几次」是两件事。
      const receipt = documentWriteResultSchema.parse(await port.write({ operation, content }, context));
      // 模型看到的是一张**收据**，不是被写进去的正文——正文它自己刚写的，回显一遍
      // 只是在烧上下文。`revision` 是它下一步该引用的那个 id（按 id join，不复制）。
      return {
        ok: true,
        text: `Applied ${operation} to the document. New revision ${receipt.revision}.`,
        details: receipt,
      };
    });
  });
}
