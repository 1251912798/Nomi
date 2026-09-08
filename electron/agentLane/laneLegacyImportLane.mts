import { AgentHarness, type AgentLane } from '@earendil-works/pi-agent-core';
import { BACKGROUND_CONTEXT } from '@earendil-works/pi-agent-core/harness/context';
import { createModels } from '@earendil-works/pi-ai';
import { createNomiModelDescriptor } from './laneModelProvider.mjs';
import { openLaneSession } from './laneSession.mjs';

/** No provider, credentials, tools, native environment or execution API escapes. */
export async function openLegacyImportLane(projectDir: string, laneName: string, sessionId: string) {
  const context = BACKGROUND_CONTEXT;
  const opened = await openLaneSession({ projectDir, laneName, createSessionId: sessionId }, context);
  let harness: AgentHarness<undefined> | undefined;
  try {
    const model = createNomiModelDescriptor({ kind: 'openai-compatible', providerId: 'nomi-unconfigured',
      modelId: 'legacy-import', baseURL: 'http://unconfigured.invalid', authType: 'none' });
    ({ harness } = await AgentHarness.create<undefined>({ session: opened.session, model, models: createModels(),
      tools: [], activeToolNames: [], systemPrompt: '' }, context));
    const lane = await harness.lane(laneName, context);
    let closing: Promise<void> | undefined;
    return {
      appendMessage: (message: Parameters<AgentLane['appendMessage']>[0]) => lane.appendMessage(message, context),
      appendCustomEntry: (customType: string, data: Parameters<AgentLane['appendCustomEntry']>[1]) => lane.appendCustomEntry(customType, data, context),
      entries: () => lane.findEntries({ order: 'oldestFirst' }, context),
      snapshot: async () => { const watch = await lane.watch(context); try { return watch.snapshot; } finally { watch.unsubscribe(); } },
      close: () => closing ??= (async () => {
        try { await harness!.close(context); } finally { await opened.release(context); }
      })(),
    };
  } catch (error) {
    try { if (harness) await harness.close(context); else await opened.session.close(context); }
    finally { await opened.release(context); }
    throw error;
  }
}
