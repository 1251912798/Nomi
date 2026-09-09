import React from 'react'

const SOFTWARE_RENDERER_PATTERNS = [/swiftshader/i, /llvmpipe/i, /software/i] as const

/** Software GL cannot sustain img-fx's animated WebGL path (SwiftShader/llvmpipe). */
export function hasSoftwareRenderer(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl: WebGLRenderingContext | null = canvas.getContext('webgl')
    if (!gl) return true
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '') : ''
    return SOFTWARE_RENDERER_PATTERNS.some(pattern => pattern.test(renderer))
  } catch { return true }
}

export function useReducedProcessMotion(): boolean {
  const [reduced, setReduced] = React.useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches || hasSoftwareRenderer())
  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches || hasSoftwareRenderer())
    query.addEventListener('change', update)
    update()
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}
