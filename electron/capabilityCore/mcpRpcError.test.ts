import { describe, expect, it } from 'vitest'

import { RpcError } from './dispatcher'
import { buildToolErrorOutcome } from './mcpToolErrorResults'
import { rpcErrorFromPayload, rpcErrorWirePayload, RpcTransportError } from './mcpRpcError'

describe('structured local RPC errors', () => {
  it('keeps policy fields when decoding an object error payload', () => {
    const error = rpcErrorFromPayload({
      ok: false,
      error: {
        message: 'generation.single-shot phase_not_ready',
        code: 'phase_not_ready', nextAction: 'finish P0', phase: 'schema_only', capability: 'start',
      },
    }, 403)
    expect(error).toBeInstanceOf(RpcTransportError)
    expect(error).toMatchObject({
      message: 'generation.single-shot phase_not_ready', code: 'phase_not_ready', errorCode: 'phase_not_ready',
      nextAction: 'finish P0', phase: 'schema_only', capability: 'start',
    })
  })

  it('keeps ordinary legacy string errors as plain Errors', () => {
    const error = rpcErrorFromPayload({ ok: false, error: '未知方法: nope' }, 404)
    expect(error).not.toBeInstanceOf(RpcTransportError)
    expect(error).toMatchObject({ message: '未知方法: nope' })
  })

  it('serializes policy RpcErrors with typed recovery details and ordinary errors as strings', () => {
    const policyError = new RpcError('generation.single-shot phase_not_ready', 403, {
      code: 'phase_not_ready', nextAction: 'finish P0', phase: 'schema_only', capability: 'start',
    })
    expect(rpcErrorWirePayload(policyError)).toEqual({
      message: 'generation.single-shot phase_not_ready', code: 'phase_not_ready',
      nextAction: 'finish P0', phase: 'schema_only', capability: 'start',
    })
    expect(rpcErrorWirePayload(new Error('legacy failure'))).toBe('legacy failure')
    expect(rpcErrorWirePayload(new RpcError('bad request', 400))).toBe('bad request')
  })
  it.each(['document_not_found', 'project_not_found', 'node_not_found', 'capability_execution_failed'])(
    'preserves the public %s outcome across GUI RPC just like direct dispatch', (code) => {
      const failure = Object.assign(new Error('private implementation detail /tmp/project'), {
        code, secret: 'must-not-cross', cause: new Error('private cause'),
      })
      const direct = buildToolErrorOutcome('nomi_document_read', failure)
      const wire = rpcErrorWirePayload(failure)
      const transported = rpcErrorFromPayload({ ok: false, error: JSON.parse(JSON.stringify(wire)) }, 500)
      expect(buildToolErrorOutcome('nomi_document_read', transported)).toEqual(direct)
      expect(transported).toMatchObject({ code })
      expect(JSON.stringify(wire)).not.toContain('private')
      expect(JSON.stringify(wire)).not.toContain('must-not-cross')
    },
  )

  it('does not publish arbitrary native error codes or properties', () => {
    const failure = Object.assign(new Error('ordinary failure'), { code: 'ENOENT', path: '/private/file' })
    expect(rpcErrorWirePayload(failure)).toBe('ordinary failure')
  })

})
