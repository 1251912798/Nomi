import React from 'react'
import type { NotificationData } from '@mantine/notifications'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { notifications, notificationsStore } from '@mantine/notifications'

import { buildToastNotification, useToastStore } from './toast'

type ToastMessageProps = {
  id: string
  message: React.ReactNode
  actionLabel?: string
  onAction?: () => void
}

function renderToastMessage(notification: NotificationData): React.ReactElement<{ children: React.ReactNode }> {
  const element = notification.message as React.ReactElement<ToastMessageProps>
  const Component = element.type as (props: ToastMessageProps) => React.ReactElement<{ children: React.ReactNode }>
  return Component(element.props)
}

describe('Nomi toast contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    notifications.clean()
    vi.spyOn(notifications, 'hide')
  })

  it('uses short semantic lifetimes and no close button for passive feedback', () => {
    expect(buildToastNotification({ id: 'success', message: 'done', type: 'success' })).toMatchObject({
      autoClose: 2600,
      withCloseButton: false,
    })
    expect(buildToastNotification({ id: 'info', message: 'noted', type: 'info' })).toMatchObject({
      autoClose: 3000,
      withCloseButton: false,
    })
    expect(buildToastNotification({ id: 'error', message: 'failed', type: 'error' })).toMatchObject({
      autoClose: 6000,
      withCloseButton: true,
    })
  })

  it('keeps repeated failures available until dismissal or recovery', () => {
    expect(buildToastNotification({ id: 'error', message: 'failed again', type: 'error', count: 2 })).toMatchObject({
      autoClose: false,
      withCloseButton: true,
    })
  })

  it('renders an explicit action button that closes before invoking the action', () => {
    const onAction = vi.fn()
    const notification = buildToastNotification({
      id: 'retry',
      message: 'failed',
      type: 'error',
      actionLabel: 'retry',
      onAction,
    })
    const rendered = renderToastMessage(notification)
    const action = React.Children.toArray(rendered.props.children).find(
      (child): child is React.ReactElement<{ onClick: (event: { stopPropagation: () => void }) => void }> =>
        React.isValidElement(child) && child.type === 'button',
    )

    expect(action).toBeDefined()
    expect(notification.autoClose).toBe(8000)
    const stopPropagation = vi.fn()
    action?.props.onClick({ stopPropagation })
    expect(stopPropagation).toHaveBeenCalledOnce()
    expect(notifications.hide).toHaveBeenCalledWith('retry')
    expect(onAction).toHaveBeenCalledOnce()
    expect(vi.mocked(notifications.hide).mock.invocationCallOrder[0]).toBeLessThan(onAction.mock.invocationCallOrder[0])
  })

  it('keeps the full dynamic action label available when visually truncated', () => {
    const label = '切到供应商显示名称 · GPT Image 2'
    const rendered = renderToastMessage(buildToastNotification({
      id: 'long-action', message: '检查连接', actionLabel: label, onAction: vi.fn(),
    }))
    const action = React.Children.toArray(rendered.props.children).find(
      (child) => React.isValidElement(child) && child.type === 'button',
    ) as React.ReactElement<{ title: string; children: string }>
    expect(action.props.title).toBe(label)
    expect(action.props.children).toBe(label)
  })

  it('updates a stable id in the real notification store', () => {
    useToastStore.getState().push({ id: 'canvas-batch-run', message: 'starting', ttl: false })
    useToastStore.getState().push({ id: 'canvas-batch-run', message: 'still starting', ttl: false })
    const state = notificationsStore.getState()
    expect([...state.notifications, ...state.queue]).toHaveLength(1)
    expect(state.notifications[0]).toMatchObject({ id: 'canvas-batch-run', autoClose: false })
    expect(state.notifications[0].message).toHaveProperty('props.message', 'still starting')
  })
})
