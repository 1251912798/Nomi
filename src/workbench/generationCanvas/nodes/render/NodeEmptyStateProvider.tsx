import React, { type JSX } from 'react'
import { NodeEmptyStateContext } from './NodeEmptyStateContext'

export function NodeEmptyStateProvider({ engaged, readOnly = false, children }: {
  engaged: boolean
  readOnly?: boolean
  children: React.ReactNode
}): JSX.Element {
  const value = React.useMemo(() => ({ engaged, readOnly }), [engaged, readOnly])
  return <NodeEmptyStateContext.Provider value={value}>{children}</NodeEmptyStateContext.Provider>
}
