// P-D1: real pi serializers + existing HTTP loopback; no credentials or paid calls.
// This tests menu-to-wire placement. laneHost does not yet wire the unlock hook.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zstdDecompressSync } from 'node:zlib';
import type { Api, Context, Model, ProviderStreams, Tool } from '@earendil-works/pi-ai';
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';
import { openAICodexResponsesApi } from '@earendil-works/pi-ai/api/openai-codex-responses.lazy';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { createCodingTools, createReadOnlyTools } from '@earendil-works/pi-coding-agent';
import { LANE_MODEL_TOOL_CATALOG } from '../../electron/agentLane/laneToolCatalog.js';
import { LANE_CODING_TOOL_NAMES } from '../../electron/agentLane/laneCodingTools.mjs';
import { addedToolNamesForUnlock, laneToolMenu, LANE_TOOL_REQUEST_TOOL_NAME }
  from '../../electron/agentLane/laneToolGroups.mjs';
import { laneToolModelDescription } from '../../electron/shared/agentLane/laneToolContract.js';
import { toPublishedJsonSchema } from '../../electron/shared/agentCapabilities/modelVisibleJsonSchema.js';
import { createHttpFixture } from './httpFixture.mjs';

const TRANSPORTS: { api: Api; streams: ProviderStreams; compat: Model<Api>['compat'] }[] = [
  { api: 'anthropic-messages', streams: anthropicMessagesApi(), compat: { supportsToolReferences: true } },
  { api: 'openai-responses', streams: openAIResponsesApi(), compat: { supportsAdditionalTools: true } },
  { api: 'openai-codex-responses', streams: openAICodexResponsesApi(), compat: { supportsAdditionalTools: true } },
  { api: 'openai-completions', streams: openAICompletionsApi(), compat: {} },
];

// Synthetic, unsigned JWT ONLY for the local Codex serializer's account-id parser.
const CODEX_FIXTURE_TOKEN = `e30.${Buffer.from(JSON.stringify({
  'https://api.openai.com/auth': { chatgpt_account_id: 'pd1-loopback' },
})).toString('base64url')}.fixture`;

function toolsForMenu(): { locked: Tool[]; unlocked: Tool[] } {
  const catalog: Tool[] = LANE_MODEL_TOOL_CATALOG.map((tool) => ({
    name: tool.name, description: laneToolModelDescription(tool),
    parameters: toPublishedJsonSchema(tool.schema) as Tool['parameters'],
  }));
  // No production request-tools descriptor exists at this baseline; only its name
  // is published. This minimal unlock schema is a fixture, explicitly excluded
  // from the report's historical 11/18 catalog-size comparison.
  const unlock: Tool = {
    name: LANE_TOOL_REQUEST_TOOL_NAME, description: 'Unlock the coding tool group.',
    parameters: { type: 'object', properties: {}, additionalProperties: false } as Tool['parameters'],
  };
  const byName = new Map([...catalog, unlock,
    ...createCodingTools('/pd1-fixture'), ...createReadOnlyTools('/pd1-fixture')]
    .map((tool) => [tool.name, tool]));
  const select = (unlocked: boolean): Tool[] => laneToolMenu({
    unlocked: unlocked ? ['model-requested'] : [],
  }).activeToolNames.map((name) => {
    const tool = byName.get(name);
    assert.ok(tool, `Missing real catalog/factory tool: ${name}`);
    return tool;
  });
  return { locked: select(false), unlocked: select(true) };
}

type WireTool = { name?: string; function?: { name: string }; defer_loading?: boolean; cache_control?: unknown };
function wireTools(body: Record<string, unknown>): WireTool[] {
  assert.ok(Array.isArray(body.tools), 'A successful request must carry a tool menu');
  return body.tools as WireTool[];
}
const names = (tools: WireTool[]) => tools.map((tool) => tool.name ?? tool.function?.name);

for (const transport of TRANSPORTS) {
  for (const arm of ['enabled', 'default', 'without-addedToolNames'] as const) {
    test(`P-D1 ${transport.api} / ${arm}: locked → unlock → sticky third request`, async (t) => {
      const http = await createHttpFixture([
        { type: 'tool', calls: [{ id: 'unlock1', name: LANE_TOOL_REQUEST_TOOL_NAME, arguments: {} }] },
        { type: 'text', text: 'Ready.' },
        { type: 'text', text: 'Still ready.' },
      ]);
      t.after(http.close);
      const model: Model<Api> = {
        api: transport.api, provider: 'pd1-loopback', id: 'pd1-model', name: 'PD1 fixture',
        baseUrl: transport.api === 'anthropic-messages' ? http.baseURL.replace(/\/v1$/, '') : http.baseURL,
        reasoning: false, input: ['text'], contextWindow: 128_000, maxTokens: 64,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        ...(arm === 'default' ? {} : { compat: transport.compat }),
      };
      const { locked, unlocked } = toolsForMenu();
      assert.deepEqual(unlocked.slice(0, locked.length), locked);
      assert.deepEqual(unlocked.slice(locked.length).map((tool) => tool.name), [...LANE_CODING_TOOL_NAMES]);
      const context: Context = {
        systemPrompt: 'P-D1 deterministic transport placement fixture.', tools: locked,
        messages: [{ role: 'user', content: 'Unlock coding.', timestamp: 1 }],
      };
      for (let turn = 1; turn <= 3; turn++) {
        const reply = await transport.streams.stream(model, context, {
          apiKey: transport.api === 'openai-codex-responses' ? CODEX_FIXTURE_TOKEN : 'fixture-key',
          transport: 'sse', maxTokens: 64, cacheRetention: 'short', sessionId: 'pd1-loopback',
          signal: AbortSignal.timeout(10_000),
          // Codex compresses HTTP bodies. The existing fixture consumes JSON;
          // decode losslessly at its boundary, keeping pi's serialized payload.
          fetch: async (input, init) => {
            const request = new Request(input, init);
            if (request.headers.get('content-encoding') !== 'zstd') return fetch(request);
            const headers = new Headers(request.headers);
            headers.delete('content-encoding');
            headers.delete('content-length');
            return fetch(request.url, { method: request.method, headers, signal: request.signal,
              body: zstdDecompressSync(Buffer.from(await request.arrayBuffer())).toString('utf8') });
          },
        }).result();
        assert.equal(reply.stopReason, turn === 1 ? 'toolUse' : 'stop', reply.errorMessage);
        context.messages.push(reply);
        if (turn === 1) {
          const call = reply.content.find((part) => part.type === 'toolCall');
          assert.ok(call?.type === 'toolCall');
          assert.equal(call.name, LANE_TOOL_REQUEST_TOOL_NAME);
          context.tools = unlocked;
          context.messages.push({
            role: 'toolResult', toolCallId: call.id, toolName: call.name,
            content: [{ type: 'text', text: 'Coding unlocked.' }], isError: false, timestamp: 2,
            ...(arm === 'without-addedToolNames' ? {} : { addedToolNames: [...addedToolNamesForUnlock()] }),
          });
        } else if (turn === 2) {
          context.messages.push({ role: 'user', content: 'Keep the same tools.', timestamp: 3 });
        }
      }
      assert.equal(http.requests.length, 3, 'No retry or missing request may masquerade as stability');
      const [first, second, third] = http.requests.map((request) => request.body);
      const initial = wireTools(first);
      const expanded = wireTools(second);
      const deferred = arm === 'enabled' && transport.api !== 'openai-completions';
      const transcriptDefinitions = deferred && transport.api.endsWith('responses');
      assert.deepEqual(names(initial), locked.map((tool) => tool.name));
      if (transport.api === 'anthropic-messages' && !deferred) {
        // pi places the cache breakpoint on the last immediate tool. With
        // deferral off it moves to the new tail; report this instead of hiding it.
        const definitions = (tools: WireTool[]) => tools.map(({ cache_control: _marker, ...tool }) => tool);
        assert.deepEqual(definitions(expanded.slice(0, initial.length)), definitions(initial));
        assert.ok(initial.at(-1)?.cache_control);
        assert.equal(expanded[initial.length - 1].cache_control, undefined);
        assert.ok(expanded.at(-1)?.cache_control);
      } else {
        assert.deepEqual(expanded.slice(0, initial.length), initial, 'Full definitions, flags and order stay stable');
      }
      assert.deepEqual(wireTools(third), expanded, 'Sticky unlock must not flip the third request menu');
      assert.deepEqual(names(expanded), (transcriptDefinitions ? locked : unlocked).map((tool) => tool.name));
      if (transport.api.endsWith('responses')) {
        const input = second.input as Record<string, unknown>[];
        const additions = input.filter((item) => item.type === 'additional_tools');
        assert.equal(additions.length, transcriptDefinitions ? 1 : 0);
        if (transcriptDefinitions) {
          assert.deepEqual(names(wireTools(additions[0])), [...LANE_CODING_TOOL_NAMES]);
          const additionIndex = input.indexOf(additions[0]);
          assert.equal(input[additionIndex - 1]?.type, 'function_call_output');
          assert.deepEqual((third.input as unknown[]).slice(0, input.length), input);
          assert.equal(third.instructions, first.instructions);
        }
      } else if (transport.api === 'anthropic-messages') {
        assert.equal(expanded.filter((tool) => tool.defer_loading === true).length,
          deferred ? LANE_CODING_TOOL_NAMES.length : 0);
        const references = JSON.stringify(second.messages).match(/"type":"tool_reference"/g) ?? [];
        assert.equal(references.length, deferred ? LANE_CODING_TOOL_NAMES.length : 0);
        assert.deepEqual(second.system, first.system);
      } else {
        assert.ok(!JSON.stringify(second.messages).includes('additional_tools'));
        assert.ok(!expanded.some((tool) => tool.defer_loading));
      }
      t.diagnostic(JSON.stringify({ api: transport.api, arm, paidCalls: 0,
        catalogCount: LANE_MODEL_TOOL_CATALOG.length, unlockFixtureCount: 1,
        topLevelCounts: http.requests.map((request) => wireTools(request.body).length),
        toolArrayBytes: http.requests.map((request) => Buffer.byteLength(JSON.stringify(request.body.tools))),
      }));
    });
  }
}
