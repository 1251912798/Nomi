import {
  getMcpConnectionAttestation,
  type McpConnectionContext,
} from './mcpConnectionContext'

/** 工具调用的记账头：只在身份已验证的请求上才被采信（rpcServer），不签名也不影响授权。 */
export const MCP_CALL_TOOL_HEADER = 'x-nomi-mcp-tool'
export const MCP_CALL_ID_HEADER = 'x-nomi-mcp-call'

export type McpLoopbackRpcRequestInput = Readonly<{
  token: string
  clientProof: string
  connection: McpConnectionContext
  method: string
  params: Record<string, unknown>
  planConfirmed?: boolean
  documentConfirmed?: boolean
  /** 这一跳属于哪一次工具调用；主进程据此给「AI 助手连接」卡记账。 */
  call?: Readonly<{ tool: string; id: string }>
  signal?: AbortSignal
}>

/** One request shape for both packaged-Node and in-Electron loopback clients. */
export function createMcpLoopbackRpcRequest(input: McpLoopbackRpcRequestInput): RequestInit {
  return {
    method: 'POST',
    // The bearer may be stripped by Fetch on a cross-origin redirect, but
    // custom client-proof and connection-attestation headers are not. A local
    // RPC endpoint therefore never gets to redirect this authenticated hop.
    redirect: 'error',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${input.token}`,
      'x-nomi-mcp-client': input.connection.authenticatedClient,
      'x-nomi-mcp-client-proof': input.clientProof,
      'x-nomi-mcp-connection-attestation': getMcpConnectionAttestation(input.connection),
      ...(input.call ? { [MCP_CALL_TOOL_HEADER]: input.call.tool, [MCP_CALL_ID_HEADER]: input.call.id } : {}),
    },
    body: JSON.stringify({
      method: input.method,
      params: input.params,
      ...(input.planConfirmed ? { planConfirmed: true } : {}),
      ...(input.documentConfirmed ? { documentConfirmed: true } : {}),
    }),
    signal: input.signal,
  }
}
