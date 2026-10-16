import { describe, expect, it } from 'vitest'

import {
  PROJECT_AGENT_APPROVAL_MODES,
  type ProjectAgentApprovalPolicy,
} from '../shared/agentCapabilities/capabilityApprovalPolicy'
import { TRUST_LEVEL_STRICTNESS, assertCallerDeclaredTrustLevel, isTrustDowngrade, trustLevelFromApprovalPolicy } from './productionRunTrustAuthority'
import { normalizeTrustLevel, type TrustLevel } from './productionRunTypes'

/**
 * 用户只在一个地方表达过「Nomi 还问不问我」。这组测试钉的是：那句话到 Run 那一侧的翻译
 * **只有一个答案**，而且穷举——两个档位，一格都不许悬空。
 */
describe('trustLevelFromApprovalPolicy', () => {
  const expected: Record<string, TrustLevel> = {
    request: 'key_confirm',
    direct: 'budget_only',
  }

  it('穷举两档：每一档都有唯一答案', () => {
    for (const mode of PROJECT_AGENT_APPROVAL_MODES) {
      const level = trustLevelFromApprovalPolicy({ mode } as ProjectAgentApprovalPolicy)
      expect(level, mode).toBe(expected[mode])
      expect(normalizeTrustLevel(level), `${mode} 必须是合法档位`).toBe(level)
    }
    // 两个权限档必须映到两个**不同**的信任档：塌成一档等于用户少了一个能表达的意思。
    expect(new Set(Object.values(expected)).size).toBe(PROJECT_AGENT_APPROVAL_MODES.length)
  })

  it('没有档位（老记录 / 还没选过）→ 默认那一档，而不是最松的那一档', () => {
    expect(trustLevelFromApprovalPolicy(undefined)).toBe('key_confirm')
    expect(TRUST_LEVEL_STRICTNESS[trustLevelFromApprovalPolicy(undefined)])
      .toBeGreaterThan(TRUST_LEVEL_STRICTNESS.budget_only)
  })

  it('「问得更多」的档位不会被当成放松（阳性对照）', () => {
    expect(isTrustDowngrade(trustLevelFromApprovalPolicy({ mode: 'request' }), 'confirm_all')).toBe(false)
    expect(isTrustDowngrade(trustLevelFromApprovalPolicy({ mode: 'request' }), 'budget_only')).toBe(true)
  })

  it('调用方自报的档位按**派生出来的**那一档判，而不是按硬编码默认档', () => {
    const fullAuto = { trustLevel: trustLevelFromApprovalPolicy({ mode: 'direct' }) }
    // 用户已经选了全自动 → 外部入口要 budget_only 不再是「放松」，放行。
    expect(() => assertCallerDeclaredTrustLevel('budget_only', fullAuto)).not.toThrow()
    const stepByStep = { trustLevel: trustLevelFromApprovalPolicy({ mode: 'request' }) }
    // 用户选的是请求批准 → 同一个请求必须被拒，并指向那条会真的问人的路。
    expect(() => assertCallerDeclaredTrustLevel('budget_only', stepByStep)).toThrow(/set_trust/)
  })
})
