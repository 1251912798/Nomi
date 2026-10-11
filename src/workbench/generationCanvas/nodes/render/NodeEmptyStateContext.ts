import React from 'react'

/** The canvas host owns selection; individual empty bodies must not infer intent. */
export const NodeEmptyStateContext = React.createContext({ engaged: false, readOnly: true })

export function useNodeEmptyStateContext(): { engaged: boolean; readOnly: boolean } {
  return React.useContext(NodeEmptyStateContext)
}

/** Selection may change between pointerdown and click. Admit the gesture at its start. */
export function useEmptyNodeActivation(): {
  canActivate: boolean
  onPointerDownCapture: () => void
  onPointerCancelCapture: () => void
  onClickCapture: (event: React.MouseEvent) => void
} {
  const { engaged, readOnly } = useNodeEmptyStateContext()
  const canActivate = engaged && !readOnly
  const admitted = React.useRef<boolean | null>(null)
  return {
    canActivate,
    onPointerDownCapture: () => { admitted.current = canActivate },
    onPointerCancelCapture: () => { admitted.current = false },
    onClickCapture: (event) => {
      // Keyboard activation has no pointerdown and uses the current host verdict.
      const allowed = canActivate && (event.detail === 0 || (admitted.current ?? false))
      // A label forwards this click to its hidden input. Keep the same admission
      // through both events; the next pointerdown/cancel replaces it.
      if (!allowed) event.preventDefault()
    },
  }
}
