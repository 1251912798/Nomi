import path from 'node:path'
import { spawnMcpStdioClient, packagedMcpRuntime } from '../_mcpJourney.mjs'
import { expect } from '../_assert.mjs'
import { writeJson } from './sweep-evidence.mjs'
export async function inspectMcp({ profile, directory, projectId, packaged, input, walk }) {
  const mcp = spawnMcpStdioClient({ settingsDir: path.join(profile, 'settings'),
    userDataDir: path.join(profile, 'mcp-user-data'), projectsDir: path.join(profile, 'projects'),
    capabilityDir: path.join(profile, 'capability'), tracePath: path.join(directory, 'mcp.jsonl'),
    elicitationAction: 'decline', captureStderr: true,
    ...(packaged ? { runtime: packagedMcpRuntime(packaged) } : {}),
  })
  try {
    await walk.station({ id: 'mcp-initialize', surface: 'mcp', expected: '真实 MCP initialize 和 tools/list' }, async () => {
      const hello = await mcp.initialize(15000)
      expect(hello.result?.protocolVersion).toBeTruthy()
      const response = await mcp.rpc('tools/list', {}, 15000)
      writeJson(path.join(directory, 'mcp-tools.json'), response)
      expect(response.result?.tools.some(t => t.name === 'nomi_read')).toBe(true)
    })
    await walk.station({ id: 'mcp-read', surface: 'mcp', expected: '无效 runId 给明确错误；没有生成或扣费' }, async () => {
      const response = await mcp.callTool('nomi_read', { target: 'run', projectId, runId: input.text || 'sweep-missing-run' }, { timeoutMs: 15000 })
      writeJson(path.join(directory, 'mcp-read.json'), response)
      expect(response.isError, '错误 runId 不能报告成功').toBe(true)
      expect(JSON.stringify(response)).toMatch(/error|not.found|invalid|不存在|未找到|session|绑定/i)
    })
  } finally { await mcp.terminate() }
}
