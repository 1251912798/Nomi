import { randomUUID } from 'node:crypto';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import { assertPdfProtocol, rewritePdfPayload } from '../../../ai/nativePdfPayload.js';
import { z } from 'zod';

const customType = 'nomi.native-pdf.v1';
const filesSchema = z.object({ files: z.array(z.object({
  marker: z.string().min(1), fileName: z.string().min(1),
  data: z.string().min(1).regex(/^[A-Za-z0-9+/]+={0,2}$/),
})) });
// Pi's public messages have text/image but no file part. Store a typed custom
// message with a unique token; replace only that user content at the official
// onPayload boundary. Bytes never masquerade as an image or extracted text.
export async function addPdfContext(session: AgentSession, files: ReadonlyArray<{ fileName: string; data: Uint8Array }>): Promise<void> {
  if (!files.length) return;
  if (!session.isIdle || session.isCompacting) throw new Error('PDF context requires an idle session');
  assertPdfProtocol(session.model?.api);
  const nativeFiles = filesSchema.parse({ files: files.map((file) => ({
    marker: `[nomi-pdf:${randomUUID()}]`, fileName: file.fileName,
    data: Buffer.from(file.data).toString('base64'),
  })) }).files;
  await session.sendCustomMessage({ customType,
    content: nativeFiles.map((file) => ({ type: 'text', text: file.marker })),
    display: false, details: { files: nativeFiles },
  }, { triggerTurn: false });
}

export function installNativePdfBridge(session: AgentSession): () => void {
  const previous = session.agent.streamFunction;
  const wrapper: typeof previous = (model, context, options) => {
    const allFiles = session.sessionManager.getBranch().flatMap((entry) => {
      if (entry.type !== 'custom_message' || entry.customType !== customType) return [];
      return filesSchema.parse(entry.details).files;
    });
    // Compaction intentionally summarizes old messages. Do not revive files
    // absent from the current request or pull attachments from another branch.
    const userTexts = new Set(context.messages.flatMap((message) => {
      if (message.role !== 'user') return [];
      if (typeof message.content === 'string') return [message.content];
      return message.content.filter((part) => part.type === 'text').map((part) => part.text);
    }));
    const files = allFiles.filter((file) => userTexts.has(file.marker));
    return previous(model, context, { ...options,
      onPayload: async (payload, requestedModel) => {
        const transformed = await options?.onPayload?.(payload, requestedModel);
        const result = rewritePdfPayload(transformed ?? payload, requestedModel.api, files);
        if (files.some((file) => !result.applied.has(file.marker))) {
          throw new Error('Native PDF was not preserved by the provider payload adapter');
        }
        return result.payload;
      },
    });
  };
  session.agent.streamFunction = wrapper;
  return () => { if (session.agent.streamFunction === wrapper) session.agent.streamFunction = previous; };
}
