import React from 'react'
import type { LabState } from '../../labScreen'
import { B2cModelSpecimen, B2cProcessSpecimen } from '../b2cFormFixtures'
export const V4_FORM_STATES: readonly LabState[] = [
  { id: 'b2c-process-running',
    name: '进行中 · 最新一步',
    source: '2026-09-09 B2c 已批准样张',
    coverage: 'component-only',
    render: () => <B2cProcessSpecimen state="running" /> },
  { id: 'b2c-process-done',
    name: '结束 · 摘要与回答',
    source: '2026-09-09 B2c 已批准样张',
    coverage: 'component-only',
    render: () => <B2cProcessSpecimen state="done" /> },
  { id: 'b2c-process-failed',
    name: '失败 · 独立卡',
    source: '2026-09-09 B2c 已批准样张',
    coverage: 'component-only',
    render: () => <B2cProcessSpecimen state="failed" /> },
  { id: 'b2c-model-three-kinds',
    name: '模型 · 真实目录三类投影',
    source: '2026-09-09 21:45 用户增补',
    coverage: 'component-only',
    render: () => <B2cModelSpecimen /> },
]
