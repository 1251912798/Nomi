/**
 * 「AI 助手连接」卡里的状态框（MCP 第 4 段，画布 v5 拍板，docs/plan/2026-10-05-mcp-official-sdk.md「第 3、4 段界面」）。
 * 纯展示：六种状态（正在使用 / 最近连过 / 已写入还没连过来 / 等你在宿主里打开 / 配置失效 / 未接入）外加「指向另一份」，
 * 操作（测试连接 / 重新写入 / 撤销接入）收在框底一行轻量文字按钮里，撤销靠左压淡，其余靠右、「测试连接」最右。
 * 数据与动作由 ConnectAssistantCard 接，推导在 assistantActivationState.resolveAssistantConnection。
 */
import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { IconAlertTriangle, IconCircleCheck, IconCopy, IconCheck, IconPlugConnected, IconRefresh } from '@tabler/icons-react'
import { cn } from '../../utils/cn'
import { mcpToolDisplayTitle } from '../../../electron/shared/mcpToolDisplayTitles'
import type { McpClientUsage } from '../../desktop/mcpBridgeTypes'
import { formatUsageAgo, type AssistantBox } from './assistantActivationState'

export type AssistantTestState = 'idle' | 'running' | { toolCount: number | null }

export type AssistantStatusBoxProps = {
  box: AssistantBox
  client: string
  usage: McpClientUsage | null
  now: number
  /** 失效 / 指向另一份时框里要说的话（调用方按原因拼好）。 */
  detail?: React.ReactNode
  /** 通栏主按钮文案（升级接入 / 修复接入 / 一键接入 / 切到这一份）；没有就不画。 */
  primaryLabel?: string
  test: AssistantTestState
  busy: boolean
  confirmingRevoke: boolean
  copied: boolean
  onPrimary: () => void
  onTest: () => void
  onRewrite: () => void
  onRevoke: () => void
  onRevokeConfirm: () => void
  onRevokeCancel: () => void
  onCopy: () => void
  /** 宿主自己那道审批门的补充一句（仅「等你在宿主里打开」用）。 */
  approvalHint?: string
  /** 打开面板时 Nomi 自己实连成功的工具数：助手还没来过时，这是「配置能用」的唯一证据，不能因为换了状态框就丢。 */
  verifiedToolCount?: number | null
  /** 失效框标题（由调用方按 resolveAssistantBrokenAction 的投影传入；不传 = 默认「配置需要更新」）。 */
  brokenTitle?: string
  /** 失效 / 另一份的原因码，给走查断言用（此前挂在旧失效框上的 data-assistant-broken / -elsewhere）。 */
  brokenCode?: string
}

const TEXT_BUTTON = 'text-caption disabled:opacity-50 disabled:cursor-not-allowed'

export function AssistantStatusBox(props: AssistantStatusBoxProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const { box, client, usage, now, busy } = props
  const locale = i18n.language === 'en' ? 'en' : 'zh-CN'
  const tool = usage?.lastCall ? mcpToolDisplayTitle(usage.lastCall.tool, locale) : ''
  const count = usage?.callCount ?? 0

  const good = box === 'using' || box === 'recent'
  const Icon = box === 'broken' || box === 'elsewhere' ? IconAlertTriangle : good ? IconCircleCheck : IconPlugConnected

  const title = {
    using: t('onboardingProviders.assistant.box.usingTitle', { client }),
    recent: t('onboardingProviders.assistant.box.recentTitle', { client }),
    written: t('onboardingProviders.assistant.box.writtenTitle', { client }),
    'host-approval': t('onboardingProviders.assistant.box.hostApprovalTitle', { client }),
    broken: props.brokenTitle ?? t('onboardingProviders.assistant.brokenTitle'),
    elsewhere: t('onboardingProviders.assistant.elsewhereTitle'),
    none: t('onboardingProviders.assistant.box.noneTitle', { client }),
  }[box]

  const body = ((): React.ReactNode => {
    if (box === 'using' && usage?.lastCall) {
      return usage.inFlight > 0 ? t('onboardingProviders.assistant.box.usingRunning', { tool, count }) : t('onboardingProviders.assistant.box.usingJust', { tool, count })
    }
    if (box === 'recent') {
      const at = Math.max(usage?.lastSeenAt ?? 0, usage?.lastCall?.at ?? 0)
      return t('onboardingProviders.assistant.box.recentBody', { when: formatUsageAgo(at, now, locale, t('onboardingProviders.assistant.box.justNow')) })
    }
    if (box === 'written') return t('onboardingProviders.assistant.restartClient', { client })
    if (box === 'none') return t('onboardingProviders.assistant.description', { client })
    return props.detail
  })()

  const testing = props.test === 'running'
  const testOk = typeof props.test === 'object' ? props.test : null
  const showTest = box === 'using' || box === 'recent' || box === 'written' || box === 'host-approval'
  const showRevoke = box !== 'none'

  return (
    <div
      data-assistant-status={box}
      data-assistant-broken={box === 'broken' ? props.brokenCode ?? 'broken' : undefined}
      data-assistant-elsewhere={box === 'elsewhere' || undefined}
      className="flex flex-col rounded-nomi-sm bg-nomi-ink-05"
    >
      <div className="flex items-start gap-2 px-3 pt-2.5 pb-2">
        <Icon
          size={17}
          className={cn('mt-0.5 shrink-0', good ? 'text-workbench-success-ink' : box === 'broken' ? 'text-nomi-warning' : 'text-nomi-ink-60')}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <div className="text-body-sm font-semibold text-nomi-ink">{title}</div>
          {body ? (
            // 路径 / 命令这类没有空格可断的长串才允许在任意处断行；人话正文照常按词换行。
            <div className={cn('mt-0.5 text-caption leading-relaxed text-nomi-ink-60', (box === 'broken' || box === 'elsewhere') && 'break-all')}>{body}</div>
          ) : null}
          {box === 'host-approval' && props.approvalHint ? (
            <div className="mt-1 text-caption text-nomi-ink-40">{props.approvalHint}</div>
          ) : null}
          {(box === 'written' || box === 'host-approval') && typeof props.verifiedToolCount === 'number' && !testOk ? (
            <div data-assistant-verified className="mt-1 text-caption text-nomi-ink-60">
              {t('onboardingProviders.assistant.box.verifiedBody', { count: props.verifiedToolCount })}
            </div>
          ) : null}
          {testOk ? (
            <div data-assistant-test-result className="mt-1 text-caption text-workbench-success-ink">
              {typeof testOk.toolCount === 'number' ? t('onboardingProviders.assistant.box.testOk', { count: testOk.toolCount }) : t('onboardingProviders.assistant.box.testOkNoCount')}
            </div>
          ) : null}
        </div>
      </div>
      {props.primaryLabel ? (
        <div className="px-3 pb-2">
          <button
            type="button"
            data-assistant-primary
            onClick={props.onPrimary}
            disabled={busy}
            className={cn(
              'w-full h-9 rounded-nomi-sm bg-nomi-ink text-nomi-paper',
              'text-body-sm font-semibold inline-flex items-center justify-center gap-1.5',
              'hover:bg-nomi-accent disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {box === 'none' ? <IconPlugConnected size={15} stroke={1.8} /> : <IconRefresh size={15} stroke={1.8} />}
            {props.primaryLabel}
          </button>
        </div>
      ) : null}
      <div data-assistant-actions className="flex items-center gap-3 px-3 pb-2">
        {props.confirmingRevoke ? (
          <>
            <span className="min-w-0 text-caption text-nomi-ink-80">{t('onboardingProviders.assistant.box.revokeAsk', { client })}</span>
            <span className="flex-1" aria-hidden="true" />
            <span className="flex shrink-0 items-center gap-3">
              <button type="button" data-assistant-revoke-cancel onClick={props.onRevokeCancel} className={cn(TEXT_BUTTON, 'text-nomi-ink-60 hover:text-nomi-ink')}>
                {t('onboardingProviders.assistant.box.revokeCancel')}
              </button>
              <button type="button" data-assistant-revoke-confirm onClick={props.onRevokeConfirm} disabled={busy} className={cn(TEXT_BUTTON, 'font-semibold text-workbench-danger')}>
                {t('onboardingProviders.assistant.box.revokeConfirm')}
              </button>
            </span>
          </>
        ) : (
          <>
            {showRevoke ? (
              <button type="button" data-assistant-uninstall onClick={props.onRevoke} disabled={busy} className={cn(TEXT_BUTTON, 'text-nomi-ink-40 hover:text-workbench-danger')}>
                {t('onboardingProviders.assistant.disconnect')}
              </button>
            ) : null}
            {/* 撤销在左、其余在右：中间的弹性空档把两组推开。 */}
            <span className="flex-1" aria-hidden="true" />
            <span className="flex shrink-0 items-center gap-3">
              {box === 'none' ? (
                <button type="button" data-assistant-client-copy onClick={props.onCopy} className={cn(TEXT_BUTTON, 'inline-flex items-center gap-1 text-nomi-ink-60 hover:text-nomi-ink')}>
                  {props.copied ? <IconCheck size={13} stroke={1.8} /> : <IconCopy size={13} stroke={1.6} />}
                  {props.copied ? t('onboardingProviders.assistant.copied') : t('onboardingProviders.assistant.copyConfig', { client })}
                </button>
              ) : null}
              {showTest ? (
                <>
                  <button type="button" data-assistant-rewrite onClick={props.onRewrite} disabled={busy} className={cn(TEXT_BUTTON, 'text-nomi-ink-60 hover:text-nomi-ink')}>
                    {t('onboardingProviders.assistant.box.rewrite')}
                  </button>
                  <button type="button" data-assistant-test onClick={props.onTest} disabled={busy || testing} className={cn(TEXT_BUTTON, 'font-semibold text-nomi-ink-80 hover:text-nomi-accent')}>
                    {testing ? t('onboardingProviders.assistant.box.testing') : t('onboardingProviders.assistant.box.test')}
                  </button>
                </>
              ) : null}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
