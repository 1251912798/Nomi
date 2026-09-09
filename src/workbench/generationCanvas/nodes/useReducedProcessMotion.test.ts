import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasSoftwareRenderer } from './useReducedProcessMotion'

afterEach(() => vi.unstubAllGlobals())

function mockContext(context: unknown) {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) })
}

describe('process motion renderer admission', () => {
  it.each([
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device ...))', true],
    ['llvmpipe (LLVM 15.0.7, 256 bits)', true],
    ['Apple M2', false],
  ])('classifies %s without starting an effect', (renderer, reduced) => {
    mockContext({
      getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 0x9246 }),
      getParameter: () => renderer,
    } as unknown as WebGLRenderingContext)
    expect(hasSoftwareRenderer()).toBe(reduced)
  })

  it('uses the static surface when no WebGL context exists', () => {
    mockContext(null)
    expect(hasSoftwareRenderer()).toBe(true)
  })

  it('uses the static surface when context creation throws', () => {
    vi.stubGlobal('document', { createElement: () => { throw new Error('context unavailable') } })
    expect(hasSoftwareRenderer()).toBe(true)
  })
})
