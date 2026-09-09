import { afterEach, describe, expect, it, vi } from 'vitest'
import { readProcessMotionCapability, shouldReduceProcessMotion } from './processMotionCapability'

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
    expect(shouldReduceProcessMotion(readProcessMotionCapability())).toBe(reduced)
  })

  it('uses the static surface when no WebGL context exists', () => {
    mockContext(null)
    expect(shouldReduceProcessMotion(readProcessMotionCapability())).toBe(true)
  })

  it('uses the static surface when context creation throws', () => {
    vi.stubGlobal('document', { createElement: () => { throw new Error('context unavailable') } })
    expect(shouldReduceProcessMotion(readProcessMotionCapability())).toBe(true)
  })
})

// Accessibility preference and renderer are independent inputs at the shared boundary.
describe('pure process motion policy', () => {
  it.each([
    ['SwiftShader', false, true], ['llvmpipe', false, true], ['Software Rasterizer', false, true],
    [null, false, true], ['Apple M2', false, false], ['Apple M2', true, true], ['', false, false],
  ] as const)('renderer=%s reducedPreference=%s', (renderer, prefersReducedMotion, expected) => {
    expect(shouldReduceProcessMotion({ renderer, prefersReducedMotion })).toBe(expected)
  })
})
