// Notification and sound preferences are read at delivery time by the main-process boundary.
import { getDesktopBridge } from '../../desktop/bridge'
import type { AttentionSoundEvent } from '../../../electron/shared/contracts/attentionSound'

export function notifyBatchFinished(input: {
  title: string; body: string; event?: AttentionSoundEvent
}): 'none' | 'notification' {
  if (typeof document === 'undefined' || document.hasFocus()) return 'none'
  const bridge = getDesktopBridge()
  if (!bridge?.notifications?.show) return 'none'
  void bridge.notifications.show({ title: input.title, body: input.body, event: input.event ?? 'completed' }).catch(() => undefined)
  return 'notification'
}
