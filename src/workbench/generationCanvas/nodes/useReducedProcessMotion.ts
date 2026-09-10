import React from 'react'
import { readProcessMotionCapability, shouldReduceProcessMotion } from './processMotionCapability'

export function useReducedProcessMotion(): boolean {
  const [reduced, setReduced] = React.useState(() => shouldReduceProcessMotion(readProcessMotionCapability()))
  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(shouldReduceProcessMotion(readProcessMotionCapability()))
    query.addEventListener('change', update)
    update()
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}
