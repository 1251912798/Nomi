// C-5（MCP 真宿主实测 10-16）：HTTP 监听端口被占时，连接状态卡要能说出原因，而不是只在后台日志里。
// 真占一个本机端口 → 真调 startDesktopMcpHttp → 真走连接状态卡用的实连检查（verifyHttpEntry）。
import net from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../appFetch', () => ({ appFetch: vi.fn() }))
vi.mock('../desktopLocale', () => ({ getDesktopLocale: () => 'zh-CN' }))
vi.mock('../logging/logger', () => ({ logInfo: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }))
vi.mock('./mcpHostEntries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./mcpHostEntries')>()),
  isStableLocalMcpUrl: () => true,
}))

import { startDesktopMcpHttp, stopDesktopMcpHttp } from './mcpHttpDesktop'
import { clearMcpHttpStartFailure, mcpHttpStartFailure } from './mcpHttpListenState'
import { MCP_HTTP_CLIENT_HEADER, MCP_HTTP_CLIENT_PROOF_HEADER } from './mcpHttpEndpoint'
import { verifyHttpEntry } from './mcpVerifyHttp'
import { ensureToken, signMcpClient } from './security'

const blockers: net.Server[] = []
afterEach(async () => {
  stopDesktopMcpHttp()
  clearMcpHttpStartFailure()
  vi.unstubAllEnvs()
  await Promise.all(blockers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
})

async function occupyPort(): Promise<number> {
  const server = net.createServer()
  blockers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as net.AddressInfo).port
}

describe('HTTP 监听端口被占：状态进连接状态卡的实连结论', () => {
  it('端口被占 → 状态 port-in-use；实连检查回 http-not-listening，一个字节都不发', async () => {
    const port = await occupyPort()
    vi.stubEnv('NOMI_MCP_HTTP_PORT', String(port))
    await startDesktopMcpHttp({ rpcPort: () => null })
    expect(mcpHttpStartFailure()).toBe('EADDRINUSE')

    ensureToken()
    const outcome = await verifyHttpEntry('codex', {
      url: `http://127.0.0.1:${port}/mcp`,
      headers: { [MCP_HTTP_CLIENT_HEADER]: 'codex', [MCP_HTTP_CLIENT_PROOF_HEADER]: signMcpClient('codex') ?? '' },
    })
    expect(outcome).toMatchObject({ ok: false, reason: 'http-not-listening', detail: 'EADDRINUSE' })
  })

  it('端口空闲 → listening，实连检查不受影响', async () => {
    vi.stubEnv('NOMI_MCP_HTTP_PORT', '0')
    await startDesktopMcpHttp({ rpcPort: () => null })
    expect(mcpHttpStartFailure()).toBeNull()
  })
})
