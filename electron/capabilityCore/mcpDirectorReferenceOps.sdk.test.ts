// 对外 MCP 的摆位参考 / 运镜参考（nomi_canvas_edit 的 create_staging_reference / create_camera_move）用**官方 SDK** 实调。
//
// 链路全是真的：官方 SDK 客户端（StreamableHTTPClientTransport）→ 本机 HTTP 端点（startMcpHttpServer）→ 协议层
// （createNomiMcpServer，经回环 RPC 的 createLoopbackMcpHttpSession，与桌面同一扇门）→ 主进程 RPC（startRpcServer，
// 项目会话租约 + 连接证明）→ 渲染端的画布写口。只有两处替身：项目会话权威（租约验过即给项目）和渲染端那一跳
// （记下收到的操作，回一份领域结果）——渲染端怎么执行这两个操作见 src/workbench/capability/mcpDirectorReferenceOps.test.ts。
//
// 2026-10-16 V-3dbox 用同一种方式实调，两个操作都回 capability_unsupported：主进程把它们落到了只认三种操作的
// 无头分支（dispatcher.ts），从没送到渲染端。工具面快照照样绿——所以这里不比快照，只认线上真回包。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mcpHttpIdentityHeaders } from './mcpHttpEndpoint'
import { createLoopbackMcpHttpSession, startMcpHttpServer, type McpHttpServerHandle } from './mcpHttpServer'
import { startRpcServer, type RpcServerHandle } from './rpcServer'
import { ensureToken, readToken, signMcpClient } from './security'

const capabilityRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-mcp-director-ops-'))
const PROJECT_ID = 'project-director-ops'

type RendererCall = { op: string; payload: Record<string, unknown> }
let rendererCalls: RendererCall[] = []

vi.mock('electron', () => ({
  app: { getPath: () => capabilityRoot, getAppPath: () => process.cwd() },
}))

vi.mock('./rendererBridge', () => ({
  isRendererAvailable: () => true,
  requestRenderer: async (op: string, payload: Record<string, unknown>) => {
    rendererCalls.push({ op, payload })
    if (op !== 'canvas.write') throw new Error(`这条用例不该走到渲染端的 ${op}`)
    const input = payload.input as { operation: string }
    // 这四个的结果形状照 canvasWriteResultSchema（渲染端真实返回的就是这些形状，见 mcpDirectorReferenceOps.test.ts）。
    const receipt = { applied: true, operation: input.operation, proposalId: `p-${input.operation}`, changeId: `canvas:v1:p-${input.operation}`, reconciliation: { ok: true, deviationCount: 0 } }
    if (input.operation === 'tidy_canvas') return { ...receipt, affectedNodeIds: [], categoryId: 'shots', nodeCount: 2 }
    if (input.operation === 'set_node_text') return { ...receipt, affectedNodeIds: ['text-1'] }
    if (input.operation === 'propose_storyboard_plan' || input.operation === 'arrange_storyboard_to_timeline') return { ...receipt, result: { ok: true } }
    return input.operation === 'create_camera_move'
      ? { applied: true, operation: input.operation, proposalId: 'p-camera', changeId: 'canvas:v1:p-camera', result: { cameraMoveNodeId: 'director-camera', targetNodeId: 'node-v1' }, reconciliation: { ok: true, deviationCount: 0 } }
      : { applied: true, operation: input.operation, proposalId: 'p-staging', changeId: 'canvas:v1:p-staging', result: { stagingNodeId: 'director-staging', targetNodeId: 'node-k1' }, reconciliation: { ok: true, deviationCount: 0 } }
  },
  requestRendererDecision: async (op: string) => { throw new Error(`这条用例不该等人：${op}`) },
}))

let rpc: RpcServerHandle | null = null
let http: McpHttpServerHandle | null = null
let client: Client | null = null

beforeEach(async () => {
  vi.stubEnv('NOMI_CAPABILITY_DIR', capabilityRoot)
  ensureToken()
  rendererCalls = []
  rpc = await startRpcServer({
    runTask: async () => { throw new Error('这条用例不花钱') },
    isProjectOpen: (id) => id === PROJECT_ID,
    projectSessionAuthority: {
      verifyLease: vi.fn(async () => ({
        projectId: PROJECT_ID,
        immutableProjectUuid: '44444444-4444-4444-8444-444444444444',
        projectGeneration: 1,
        canonicalRootDigest: 'root-digest',
      })),
    } as never,
  })
  const rpcPort = rpc.port
  http = await startMcpHttpServer({
    port: 0,
    sessionFor: (identity) => createLoopbackMcpHttpSession({
      identity,
      rpc: () => ({ port: rpcPort, token: readToken() ?? '' }),
      fetchImpl: fetch,
      getLocale: () => 'en',
    }),
  })
  client = new Client({ name: 'nomi-director-ops-test', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(http.url), {
    requestInit: { headers: mcpHttpIdentityHeaders('codex', signMcpClient('codex') ?? '') },
  }))
})

afterEach(async () => {
  await client?.close().catch(() => {})
  await http?.close()
  await rpc?.close()
  client = null
  http = null
  rpc = null
})

async function canvasEdit(args: Record<string, unknown>) {
  return client!.callTool({ name: 'nomi_canvas_edit', arguments: { leaseHandle: 'verified-lease', projectId: PROJECT_ID, ...args } }) as Promise<{
    isError?: boolean
    structuredContent?: { nomiOutcome?: Record<string, unknown> }
  }>
}

describe('external MCP staging / camera-move references (official SDK, Streamable HTTP)', () => {
  it('create_camera_move reaches the live renderer write and comes back applied', async () => {
    const result = await canvasEdit({ operation: 'create_camera_move', shotClientId: 'node-v1', move: 'push_in' })
    expect(result.structuredContent?.nomiOutcome?.errorCode).toBeUndefined()
    expect(result.isError).not.toBe(true)
    expect(rendererCalls).toEqual([expect.objectContaining({
      op: 'canvas.write',
      payload: expect.objectContaining({ projectId: PROJECT_ID, input: expect.objectContaining({ operation: 'create_camera_move', shotClientId: 'node-v1', move: 'push_in' }) }),
    })])
  })

  it('create_staging_reference reaches the live renderer write and comes back applied', async () => {
    const result = await canvasEdit({ operation: 'create_staging_reference', shotClientId: 'node-k1', characters: [{ name: 'A' }, { name: 'B' }], layout: 'facing' })
    expect(result.structuredContent?.nomiOutcome?.errorCode).toBeUndefined()
    expect(result.isError).not.toBe(true)
    expect(rendererCalls).toEqual([expect.objectContaining({
      op: 'canvas.write',
      payload: expect.objectContaining({ projectId: PROJECT_ID, input: expect.objectContaining({ operation: 'create_staging_reference', layout: 'facing' }) }),
    })])
  })

  it('the receipt ids are minted by the main process per operation', async () => {
    await canvasEdit({ operation: 'create_camera_move', shotClientId: 'node-v1', move: 'push_in' })
    const payload = rendererCalls[0]?.payload ?? {}
    expect(payload.receiptProposalId).toEqual(expect.stringMatching(/^mcp-canvas:create_camera_move:/))
    expect(payload.approvalId).toEqual(expect.stringMatching(/^mcp-canvas-approval:create_camera_move:/))
  })
})

// 2026-10-17：说明书里写着能做、线上却回 capability_unsupported 的另外 4 个画布操作（V-3dbox 第五轮）。
// 同一条真链路（官方 SDK → HTTP 端点 → 协议层 → 主进程 RPC + 租约 → 渲染端），只认线上真回包。
describe('external MCP canvas operations that used to answer capability_unsupported (official SDK)', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['tidy_canvas', { operation: 'tidy_canvas', categoryId: 'shots' }],
    ['set_node_text', { operation: 'set_node_text', nodeId: 'text-1', text: 'hello', mode: 'replace' }],
    ['propose_storyboard_plan', { operation: 'propose_storyboard_plan', title: 'T', anchors: [], shots: [{ index: 1, shotKind: 'image', durationSec: 0, anchorIds: [], prompt: 'p' }] }],
    ['arrange_storyboard_to_timeline', { operation: 'arrange_storyboard_to_timeline', nodeIds: ['node-v1'] }],
  ]

  it.each(cases)('%s reaches the live renderer write and comes back applied', async (operation, args) => {
    const result = await canvasEdit(args)
    expect(result.structuredContent?.nomiOutcome?.errorCode).not.toBe('capability_unsupported')
    expect(result.isError).not.toBe(true)
    expect(rendererCalls).toEqual([expect.objectContaining({
      op: 'canvas.write',
      payload: expect.objectContaining({ projectId: PROJECT_ID, input: expect.objectContaining({ operation }) }),
    })])
  })
})
