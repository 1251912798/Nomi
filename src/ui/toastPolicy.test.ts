import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notifications, notificationsStore } from '@mantine/notifications'
import { useToastStore } from './toast'

const items = () => {
  const state = notificationsStore.getState()
  return [...state.notifications, ...state.queue]
}

describe('notification identity across the real Mantine visible list and queue', () => {
  beforeEach(() => {
    notifications.clean()
    notificationsStore.setState({ ...notificationsStore.getState(), limit: 2 })
  })

  it('five repeats retain one item, latest payload and count', () => {
    for (let index = 0; index < 5; index++) {
      useToastStore.getState().push({ id: 'project-a:import', reason: 'read-failed', message: `failure ${index}`, type: 'error' })
    }
    expect(items()).toHaveLength(1)
    expect(items()[0]['data-notification-count']).toBe(5)
    expect(items()[0].message).toHaveProperty('props.message', 'failure 4')
  })

  it('deduplicates queued items as well and keeps unrelated objects separate', () => {
    for (const id of ['a', 'b', 'c', 'c', 'c']) {
      useToastStore.getState().push({ id, reason: 'failed', message: id, type: 'error' })
    }
    expect(notificationsStore.getState().notifications).toHaveLength(2)
    expect(notificationsStore.getState().queue).toHaveLength(1)
    expect(notificationsStore.getState().queue[0]['data-notification-count']).toBe(3)
    notifications.hide('a')
    expect(notificationsStore.getState().notifications.map((item) => item.id)).toEqual(['b', 'c'])
  })

  it('a new reason replaces the same identity and resets the counter', () => {
    useToastStore.getState().push({ id: 'task', reason: 'offline', message: 'offline' })
    useToastStore.getState().push({ id: 'task', reason: 'unauthorized', message: 'unauthorized' })
    expect(items()).toHaveLength(1)
    expect(items()[0]['data-notification-count']).toBe(1)
    notifications.hide('task')
    useToastStore.getState().push({ id: 'task', reason: 'unauthorized', message: 'again' })
    expect(items()[0]['data-notification-count']).toBe(1)
  })

  it('replaces obsolete actions instead of retaining an earlier callback', () => {
    const obsolete = vi.fn()
    const latest = vi.fn()
    useToastStore.getState().push({ id: 'retry', reason: 'failed', message: 'old', actionLabel: 'retry', onAction: obsolete })
    useToastStore.getState().push({ id: 'retry', reason: 'failed', message: 'new', actionLabel: 'retry', onAction: latest })
    expect(items()[0].message).toHaveProperty('props.onAction', latest)
  })
})

describe('contextual notification policy', () => {
  beforeEach(() => notifications.clean())

  it('writes local feedback without also enqueuing a toast', async () => {
    const { notify } = await import('./notificationPolicy')
    const present = vi.fn()
    useToastStore.getState().push({ id: 'object', message: 'old background state' })
    notify({ identity: 'object', reason: 'read-failed', message: 'Permission denied; choose another folder', level: 'inline', present })
    expect(present).toHaveBeenCalledExactlyOnceWith('Permission denied; choose another folder')
    expect(items()).toHaveLength(0)
  })

  it('keeps already visible success on its existing status surface', async () => {
    const { notify } = await import('./notificationPolicy')
    notify({ identity: 'object', reason: 'saved', message: 'saved', type: 'success', level: 'status' })
    expect(items()).toHaveLength(0)
  })

  it('retains a real next step for background failures', async () => {
    const { notify } = await import('./notificationPolicy')
    const onAction = vi.fn()
    notify({ identity: 'task', reason: 'export-failed', message: 'Export failed', type: 'error', level: 'background', actionLabel: 'Open task', onAction })
    expect(items()).toHaveLength(1)
    expect(items()[0].message).toHaveProperty('props.onAction', onAction)
  })

  it('does not resolve a required decision before the existing confirmation host settles', async () => {
    const { notify } = await import('./notificationPolicy')
    const { bindConfirmDialogHost } = await import('../design/confirmDialogStore')
    const dispatch = vi.fn()
    bindConfirmDialogHost(dispatch)
    try {
      const resolved = vi.fn()
      const decision = notify({ identity: 'delete', reason: 'irreversible', message: 'Permanently delete?', level: 'decision', title: 'Delete', confirmLabel: 'Delete', danger: true })
      void decision.then(resolved)
      expect(resolved).not.toHaveBeenCalled()
      expect(items()).toHaveLength(0)
      dispatch.mock.calls[0][0].resolve(false)
      await expect(decision).resolves.toBe(false)
    } finally {
      bindConfirmDialogHost(null)
    }
  })
})
