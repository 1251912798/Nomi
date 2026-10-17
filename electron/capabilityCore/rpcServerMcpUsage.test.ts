// 主进程回环 RPC 是三条传输（HTTP / Electron stdio / 裸 Node 启动器）汇合后的第一个边界：
// 带已验证身份的工具调用在这里记一笔「助手用了哪个工具」。口令错的、没带记账头的、头不合法的都不记。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const capabilityRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-rpc-usage-cap-'))

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir(), getAppPath: () => process.cwd() },
}))

import { createMcpConnectionContext, getMcpConnectionAttestation } from './mcpConnectionContext'
import { MCP_CALL_ID_HEADER, MCP_CALL_TOOL_HEADER } from './mcpLoopbackRpcRequest'
import { mcpUsageRegistry } from './mcpUsageRegistry'
import { startRpcServer, type RpcServerHandle } from './rpcServer'
import { ensureToken, signMcpClient } from './security'

let server: RpcServerHandle
let token = ''

beforeEach(async () => {
  vi.stubEnv('NOMI_CAPABILITY_DIR', capabilityRoot)
  token = ensureToken()
  server = await startRpcServer({ runTask: async () => ({ id: 't', status: 'succeeded', assets: [] }) })
})
afterEach(async () => {
  await server.close()
  vi.unstubAllEnvs()
})

async function call(client: string, proof: string, extra: Record<string, string> = {}): Promise<number> {
  const connection = proof ? (() => { try { return createMcpConnectionContext({ client, proof }) } catch { return null } })() : null
  const response = await fetch(`http://127.0.0.1:${server.port}/rpc`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-nomi-mcp-client': client,
      'x-nomi-mcp-client-proof': proof,
      ...(connection ? { 'x-nomi-mcp-connection-attestation': getMcpConnectionAttestation(connection) } : {}),
      ...extra,
    },
    body: JSON.stringify({ method: 'nomi_get_locale', params: {} }),
  })
  await response.text()
  return response.status
}

describe('回环 RPC · 使用情况记账', () => {
  it('已验证的助手带着记账头调用：记工具、计数，响应结束后不再在途', async () => {
    const before = mcpUsageRegistry().snapshot().codex?.callCount ?? 0
    const status = await call('codex', signMcpClient('codex')!, { [MCP_CALL_TOOL_HEADER]: 'nomi_read', [MCP_CALL_ID_HEADER]: 'call-1' })
    expect(status).toBe(200)
    const usage = mcpUsageRegistry().snapshot().codex
    expect(usage.callCount).toBe(before + 1)
    expect(usage.lastCall?.tool).toBe('nomi_read')
    await vi.waitFor(() => expect(mcpUsageRegistry().snapshot().codex.inFlight).toBe(0))
  })

  it('同一次工具调用的两跳请求只算一次', async () => {
    const before = mcpUsageRegistry().snapshot().cursor?.callCount ?? 0
    const proof = signMcpClient('cursor')!
    const headers = { [MCP_CALL_TOOL_HEADER]: 'nomi_operation_plan', [MCP_CALL_ID_HEADER]: 'same-call' }
    await call('cursor', proof, headers)
    await call('cursor', proof, headers)
    expect(mcpUsageRegistry().snapshot().cursor.callCount).toBe(before + 1)
  })

  it('口令错：被拒，而且什么都没记', async () => {
    const before = JSON.stringify(mcpUsageRegistry().snapshot())
    const status = await call('claude', 'not-a-proof', { [MCP_CALL_TOOL_HEADER]: 'nomi_read', [MCP_CALL_ID_HEADER]: 'bad-1' })
    expect(status).toBe(403)
    expect(JSON.stringify(mcpUsageRegistry().snapshot())).toBe(before)
  })

  it('没带记账头 / 头里不是合法标签：身份对也不记', async () => {
    const before = JSON.stringify(mcpUsageRegistry().snapshot())
    const proof = signMcpClient('claude')!
    await call('claude', proof)
    await call('claude', proof, { [MCP_CALL_TOOL_HEADER]: 'bad tool; drop', [MCP_CALL_ID_HEADER]: 'x' })
    await call('claude', proof, { [MCP_CALL_TOOL_HEADER]: 'nomi_read', [MCP_CALL_ID_HEADER]: '' })
    expect(JSON.stringify(mcpUsageRegistry().snapshot())).toBe(before)
  })
})
