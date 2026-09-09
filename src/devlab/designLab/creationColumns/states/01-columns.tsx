import React from 'react'
import type { LabState } from '../../labScreen'
import { CreationColumnsStage } from '../CreationColumnsStage'

const SOURCE = 'docs/design/2026-09-10-creation-workspace-columns.md'
export const CREATION_COLUMNS_STATES: readonly LabState[] = [
  {
    id: 'columns-current',
    name: '现状 · 真实创作外壳',
    source: SOURCE,
    coverage: 'shell',
    render: () => <CreationColumnsStage />,
  },
  {
    id: 'columns-specimen',
    name: '样张 · 统一外框（待拍板）',
    source: SOURCE,
    coverage: 'component-only',
    render: () => <CreationColumnsStage specimen />,
  },
  {
    id: 'columns-specimen-dark',
    name: '样张 · 暗色（待拍板）',
    source: SOURCE,
    coverage: 'component-only',
    scheme: 'dark',
    render: () => <CreationColumnsStage specimen />,
  },
]
