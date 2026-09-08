/**
 * P-D1 探针：**解锁 coding 组会打掉多少前缀缓存**，分传输量。
 *
 * ── 它量的是什么，为什么这样量 ──
 *
 * 「一次解锁的缓存代价」这句话的机器含义只有一个：**新解锁的工具定义有没有落进
 * 可缓存的请求前缀**。落进去了，前缀就变了，供应商那边这一段缓存整段作废；落在转录里
 * （工具结果之后），前缀一个字节没动，缓存全中。
 *
 * pi 的 `splitDeferredTools`（`pi-ai/dist/utils/deferred-tools.js`）按**传输**决定放哪儿。
 * 所以这条代价是**传输的属性，不是我们代码的属性**——同一份解锁逻辑，在 anthropic-messages
 * 上零代价，在 DeepSeek 官方的 chat-completions 上要付一次。
 *
 * ── 为什么用出站报文而不是供应商的 `prompt_cache_hit_tokens` ──
 *
 * 两条：
 *   ① **它更强**。缓存命中数受供应商自己的 TTL、分片、负载影响，同一段对话跑两次能差很多；
 *      而「前缀变了几个字节」是确定的、可复跑的、在 CI 里能当断言的。
 *   ② **真实收据这一轮拿不到，且原因要明说**（D4）。本机的 key 全在
 *      `model-catalog.json` 里走 Electron `safeStorage`，密钥的钥匙串 ACL 绑的是**打包后的
 *      Nomi.app 那个签名**；仓库里的开发版 Electron 解不开（2026-09-07 实跑：10 个 vendor
 *      全部 `Error while decrypting the ciphertext`）。所以三条真实传输的**活体**收据是
 *      一笔明标的欠账，不是一个被跳过的步骤。
 *
 * 用法：`pnpm exec tsx scripts/probe-lane-deferred-tools.mts`
 */
import { createServer } from 'node:http';
import { once } from 'node:events';
import { AddressInfo } from 'node:net';

import { createNomiProvider } from '../electron/agentLane/laneModelProvider.mjs';
import { LANE_CODING_TOOL_NAMES } from '../electron/agentLane/laneCodingTools.mjs';
import { LANE_MODEL_TOOL_CATALOG } from '../electron/agentLane/laneToolCatalog.js';
import { toPublishedJsonSchema } from '../electron/shared/agentCapabilities/modelVisibleJsonSchema.js';
import { laneToolModelDescription } from '../electron/shared/agentLane/laneToolContract.js';

type TransportKind = 'openai-compatible' | 'openai-responses' | 'anthropic';

const TRANSPORTS: readonly {
  kind: TransportKind; api: string; realWorldExample: string
  /** 把「转录内定义」打开需要在模型档案上声明什么（pi 的 compat 开关）。`null` = 这条传输上打不开。 */
  inlineCompat: Record<string, unknown> | null
}[] = [
  {
    kind: 'openai-compatible', api: 'openai-completions', realWorldExample: 'DeepSeek 官方 / GLM 官方 / Kimi 官方',
    // Chat Completions 上**唯一**的转录内路径是 kimi 模式（`openai-completions.js:611-612,1129-1139`）：
    // 把解锁的工具从 `tools` 数组里摘出来，作为一条 `role:"system"` 消息追加在工具结果之后。
    // 自动探测**从不**开它（`:1310` 恒 undefined），要靠档案显式声明。
    inlineCompat: { deferredToolsMode: 'kimi' },
  },
  {
    kind: 'openai-responses', api: 'openai-responses', realWorldExample: 'OpenAI 官方 Responses',
    inlineCompat: { supportsAdditionalTools: true },
  },
  {
    kind: 'anthropic', api: 'anthropic-messages', realWorldExample: 'Anthropic 官方 / DeepSeek·GLM 的 Anthropic 兼容端点',
    inlineCompat: { supportsToolReferences: true },
  },
];

/** 一个只把请求体记下来、然后回一条最短合法回复的服务器。三种传输的响应形状各不相同。 */
async function startCapturingServer() {
  const bodies: Record<string, unknown>[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>);
    const pathname = new URL(request.url ?? '/', 'http://probe').pathname;
    response.writeHead(200, { 'content-type': 'text/event-stream', connection: 'close' });
    const send = (data: unknown) => response.write(`data: ${JSON.stringify(data)}\n\n`);
    if (pathname.endsWith('/messages')) {
      for (const [type, value] of [
        ['message_start', { message: { id: 'm', type: 'message', role: 'assistant', model: 'probe', content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 1 } } }],
        ['content_block_start', { index: 0, content_block: { type: 'text', text: '' } }],
        ['content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'ok' } }],
        ['content_block_stop', { index: 0 }],
        ['message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } }],
        ['message_stop', {}],
      ] as const) {
        response.write(`event: ${type}\n`);
        send({ type, ...(value as object) });
      }
    } else if (pathname.includes('/responses')) {
      send({ type: 'response.created', response: { id: 'r', model: 'probe', output: [] } });
      send({ type: 'response.output_text.delta', delta: 'ok', item_id: 'i', output_index: 0, content_index: 0 });
      send({ type: 'response.completed', response: { id: 'r', model: 'probe', status: 'completed', output: [{ type: 'message', id: 'i', role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] }], usage: { input_tokens: 1, output_tokens: 1 } } });
    } else {
      send({ id: 'c', object: 'chat.completion.chunk', model: 'probe', choices: [{ index: 0, delta: { role: 'assistant', content: 'ok' }, finish_reason: null }] });
      send({ id: 'c', object: 'chat.completion.chunk', model: 'probe', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
      response.write('data: [DONE]\n\n');
    }
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return { bodies, baseURL: `http://127.0.0.1:${port}/v1`, close: () => new Promise<void>((r) => server.close(() => r())) };
}

/** 我们真正会发出去的工具面。always-on 走 lane 目录，coding 走 pi 的工厂。 */
async function toolSets() {
  const pi = await import('@earendil-works/pi-coding-agent');
  const alwaysOn = LANE_MODEL_TOOL_CATALOG.map((tool) => ({
    name: tool.name,
    description: laneToolModelDescription(tool),
    parameters: toPublishedJsonSchema(tool.schema),
  }));
  const byName = new Map<string, { name: string; description: string; parameters: unknown }>();
  for (const tool of [...pi.createCodingTools('/probe'), ...pi.createReadOnlyTools('/probe')]) {
    byName.set(tool.name, { name: tool.name, description: tool.description ?? '', parameters: tool.parameters });
  }
  const coding = LANE_CODING_TOOL_NAMES.map((name) => {
    const tool = byName.get(name);
    if (!tool) throw new Error(`pi 不再提供 coding 工具 ${name}`);
    return tool;
  });
  return { alwaysOn, coding };
}

/**
 * 「可缓存前缀」= 供应商在这个传输上按前缀匹配的那一段。三种传输各自的定义：
 *   · chat-completions —— `tools` 数组 + 第一条 system message（DeepSeek 的 context caching 就按它前缀匹配）
 *   · responses        —— `tools` + `instructions`
 *   · anthropic        —— `tools` + `system`
 * 转录里的消息不在其中（它们是逐轮追加的，本来就在前缀之后）。
 */
function cacheablePrefixBytes(body: Record<string, unknown>): number {
  const parts: unknown[] = [body.tools];
  if ('instructions' in body) parts.push(body.instructions);
  if ('system' in body) parts.push(body.system);
  if (Array.isArray(body.messages)) {
    const first = body.messages[0] as { role?: string } | undefined;
    if (first?.role === 'system' || first?.role === 'developer') parts.push(first);
  }
  return Buffer.byteLength(JSON.stringify(parts.filter((part) => part !== undefined)), 'utf8');
}

async function drain(stream: AsyncIterable<unknown>): Promise<void> {
  // **错误必须炸出来**：一条静默失败的流会让下面的字节数变成「两次都没发请求」，
  // 而那看起来和「零缓存代价」一模一样（这正是假绿最常见的来源）。
  for await (const event of stream) {
    const type = (event as { type?: string }).type;
    if (type === 'error') throw new Error(`stream error: ${JSON.stringify(event)}`);
  }
}

async function measure(transport: (typeof TRANSPORTS)[number], declareInlineCompat: boolean) {
  const server = await startCapturingServer();
  try {
    const { alwaysOn, coding } = await toolSets();
    const { provider, model } = await createNomiProvider({
      kind: transport.kind, providerId: 'probe', modelId: 'probe-model',
      baseURL: server.baseURL, authType: 'api-key', apiKey: 'probe-key',
    });
    const streams = provider as unknown as {
      stream(model: unknown, context: unknown, options?: unknown): AsyncIterable<unknown>
    };
    // 直接调 provider.stream 时凭据不走 `createModels` 那条路，所以显式给一把假 key。
    // 它只是让请求发得出去——探针的服务器不看它。
    const options = { apiKey: 'probe-key' };

    // **今天 `createNomiProvider` 一个 compat 字段都不设**（`model.mts:118-131` 实核），
    // 所以三条传输上「转录内定义」全都关着。这一臂按需把它打开，量的就是「声明了能省多少」。
    const probeModel = declareInlineCompat && transport.inlineCompat
      ? { ...(model as object), compat: { ...transport.inlineCompat } }
      : model;

    const systemPrompt = 'NOMI_LANE_SYSTEM_PROMPT';
    // ── 臂 A：锁着。只有 always-on 组。 ──
    await drain(streams.stream(probeModel, {
      systemPrompt, tools: alwaysOn,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    }, options));

    // ── 臂 B：解锁。工具表里多了 coding 组，且**上一条工具结果带 `addedToolNames`**
    //    ——那正是 pi 用来判断「这些是后来解锁的」的信号。 ──
    await drain(streams.stream(probeModel, {
      systemPrompt, tools: [...alwaysOn, ...coding],
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'hello' }] },
        { role: 'assistant', content: [{ type: 'toolCall', id: 't1', name: 'nomi_request_tools', arguments: { query: 'run a script' } }] },
        {
          role: 'toolResult', toolCallId: 't1', toolName: 'nomi_request_tools', isError: false,
          content: [{ type: 'text', text: 'Success. Found 7 matching tool(s)' }],
          addedToolNames: [...LANE_CODING_TOOL_NAMES],
        },
      ],
    }, options));

    const [locked, unlocked] = server.bodies.slice(-2) as [Record<string, unknown>, Record<string, unknown>];
    const before = cacheablePrefixBytes(locked);
    const after = cacheablePrefixBytes(unlocked);
    const toolsInPrefix = Array.isArray(unlocked.tools) ? unlocked.tools.length : 0;
    return {
      arm: declareInlineCompat ? 'compat 已声明' : '今天出厂的样子',
      transport: transport.api,
      realWorldExample: transport.realWorldExample,
      prefixBytesLocked: before,
      prefixBytesUnlocked: after,
      deltaBytes: after - before,
      invalidatedPct: before === 0 ? 0 : Math.round(((after - before) / before) * 1000) / 10,
      toolsInPrefixAfterUnlock: toolsInPrefix,
      placement: after === before ? 'transcript（零缓存代价）' : 'prefix（前缀失效一次）',
    };
  } finally {
    await server.close();
  }
}

async function main(): Promise<void> {
  const rows = [];
  for (const transport of TRANSPORTS) {
    rows.push(await measure(transport, false));
    rows.push(await measure(transport, true));
  }
  console.log('\nP-D1 · 解锁 coding 组的缓存代价（按传输 × 两臂）\n');
  console.log('| 传输 | 真实用户接的是 | 臂 | 前缀字节（锁着） | 前缀字节（解锁后） | 增量 | 前缀失效 | 放置 |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const row of rows) {
    console.log(
      `| \`${row.transport}\` | ${row.realWorldExample} | ${row.arm} | ${row.prefixBytesLocked} | ${row.prefixBytesUnlocked} `
      + `| ${row.deltaBytes >= 0 ? '+' : ''}${row.deltaBytes} | ${row.invalidatedPct}% | ${row.placement} |`);
  }
  console.log('');
  console.log(JSON.stringify(rows, null, 2));
}

void main();
