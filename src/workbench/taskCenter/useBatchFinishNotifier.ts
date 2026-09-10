// 批次跑完 → 失焦时提醒（系统通知 / 提示音）。
// 方案：docs/plan/2026-08-02-task-center-queue.md
//
// 只订阅「批次从未完成翻成已完成」这一个瞬间；窗口在前台什么都不做（已有 toast，别重复轰炸）。
import React from 'react'
import { slowGenerationEntries } from './slowGenerationNotice'
import { useTranslation } from 'react-i18next'
import { useGenerationQueueStore } from '../generationCanvas/runner/generationQueueStore'
import { notifyBatchFinished } from './taskCenterSettings'

export function useBatchFinishNotifier(): void {
  const { t } = useTranslation()
  React.useEffect(() => {
    // 已提醒过的批次：订阅回调可能因无关状态变化多次触发，靠这个集合保证一批只响一次。
    const announced = new Set<string>()
    for (const batch of Object.values(useGenerationQueueStore.getState().batches)) {
      if (batch.finishedAt) announced.add(batch.id)
    }
    const slowAnnounced = new Set<string>()
    const timer = setInterval(() => {
      for (const entry of slowGenerationEntries(useGenerationQueueStore.getState().entries, Date.now())) {
        if (slowAnnounced.has(entry.id)) continue
        slowAnnounced.add(entry.id)
        notifyBatchFinished({ title: t('settings.sound.brand'), body: t('settings.sound.slow'), event: 'slow' })
      }
    }, 1000)
    const unsubscribe = useGenerationQueueStore.subscribe((state) => {
      for (const batch of Object.values(state.batches)) {
        if (!batch.finishedAt || announced.has(batch.id)) continue
        announced.add(batch.id)
        const settled = state.entries.filter((entry) => entry.batchId === batch.id)
        const ok = settled.filter((entry) => entry.state === 'success').length
        const failed = settled.filter((entry) => entry.state === 'error').length
        // Single generations obey the same user preference (completion sound is opt-in).
        notifyBatchFinished({
          title: t('taskCenter.notification.title'),
          body:
            failed > 0
              ? t('taskCenter.notification.bodyWithFailures', { successes: ok, failures: failed })
              : t('taskCenter.notification.body', { count: ok }),
          event: failed > 0 ? 'decision' : 'completed',
        })
      }
    })
    return () => { unsubscribe(); clearInterval(timer) }
  }, [t])
}
