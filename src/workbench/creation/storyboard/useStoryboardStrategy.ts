/**
 * 执行计划的一次 resolve 查询 + 它的三个消费方。
 *
 * 为什么抽成 hook（返工 7）：审阅面板、**行内警示**、闸 toast 要的是同一份 resolve 结果。
 * 上一版只有面板自己查，于是「这一镜超限」只有点开面板才看得见（违反 D1：摩擦发生在行上，
 * 提示就该在行上）。现在编辑器查一次，面板与表格行读同一份视图——不是两次 IPC、更不是两份判据。
 */
import React from 'react'
import type { StoryboardPlan } from '../../generationCanvas/agent/storyboardPlan'
import {
  classifyResolveStrategy,
  shotDurationWarnings,
  storyboardPlanToPlanShotInputs,
  type ResolveStrategyView,
  type ShotDurationWarning,
} from '../../generationCanvas/agent/storyboardStrategy'
import { GenerationResolveErrorCode } from '../../../../electron/shared/videoCapabilities/planResolutionContracts'
import { fetchStoryboardResolve, type StoryboardResolveClient } from './strategyGate'

export type StoryboardStrategyState =
  /** 没有视频镜 / 没有项目：这块地根本不该出现。 */
  | { status: 'idle' }
  | { status: 'loading' }
  /** 能力核还没起来 / 没有 bridge：还没查成，不是用户的问题，也没有可操作的下一步。 */
  | { status: 'unavailable' }
  /** 项目已切换（旧标签页把别的项目镜头喂进来了）。 */
  | { status: 'stale' }
  | { status: 'error' }
  | { status: 'ready'; view: ResolveStrategyView; warnings: Map<string, ShotDurationWarning> }

export function useStoryboardStrategy(
  plan: StoryboardPlan,
  projectId: string | null | undefined,
  client: StoryboardResolveClient | null | undefined,
): StoryboardStrategyState {
  const [state, setState] = React.useState<StoryboardStrategyState>({ status: 'idle' })

  // 只在「引擎投影输入」变化时重查：投影不含 prompt/绑定等文本字段，打字改 prompt 不会触发无谓 IPC。
  const projectionKey = React.useMemo(
    () => (projectId ? JSON.stringify(storyboardPlanToPlanShotInputs(plan)) : ''),
    [plan, projectId],
  )

  React.useEffect(() => {
    if (!projectId || !projectionKey || projectionKey === '[]') {
      setState({ status: 'idle' })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })
    void fetchStoryboardResolve(plan, projectId, client).then((envelope) => {
      if (cancelled) return
      if (!envelope) {
        setState({ status: 'unavailable' })
        return
      }
      if (!envelope.ok) {
        if (envelope.error.code === GenerationResolveErrorCode.CoreUnavailable) setState({ status: 'unavailable' })
        else if (envelope.error.code === GenerationResolveErrorCode.ProjectStale) setState({ status: 'stale' })
        else setState({ status: 'error' })
        return
      }
      setState({
        status: 'ready',
        view: classifyResolveStrategy(envelope.value),
        warnings: shotDurationWarnings(envelope.value),
      })
    })
    return () => {
      cancelled = true
    }
    // 投影 key 已编码 plan 的裁决字段；直接依赖 plan 会让每次编辑（含 prompt 打字）都重查一次 IPC。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectionKey, projectId, client])

  return state
}
