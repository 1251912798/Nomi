// 设计实验室 · 导演视图（3D-BOX）· 「切回旧导演台」入口样张（2026-10-16，拍板前只出样张，不接线）。
//
// 用户 10-16：3D-BOX 默认打开、开关代码保留、留切回入口；协调定：只切界面（全屏、默认进精修、底部「描述场景…」），
// 写回规矩与 Agent 工具面都不切（docs/plan/2026-10-16-director-editor-persistence-direction-check.md）。
// 入口位置：精修顶栏「视图 ▾ → 偏好设置」对话框里新加一节「导演台样式」（现役 SettingsDialog，传了 layout 才出现；
// 产品里还没有传，拍板后才接线）。格子：开关关 / 开 × 中文浅色 / 英文暗色，外加「开」之后的样子（旧导演台，与开关关时同一个壳）。
import React, { type JSX } from 'react'
import i18n, { type AppLocale } from '../../../../i18n'
import { SettingsDialog } from '../../../../workbench/generationCanvas/nodes/director/panels/dialogs/SettingsDialog'
import { readDirectorPreferences } from '../../../../workbench/generationCanvas/nodes/director/scene/viewSettings'
import type { LabState } from '../../labScreen'
import { Director3dBoxLazyStage } from '../director3dboxLazyStage'

const SOURCE = '切回旧导演台入口样张（协调 10-16：只切界面；入口 = 视图 ▾ → 偏好设置 → 导演台样式）'

/**
 * 现役偏好设置对话框（开关样张态）。对话框由实验室直接打开（产品里从「视图 ▾ → 偏好设置」进），开关与滑杆在格子里真能改（只改这一格的状态，不写本机偏好）。
 * 背后不挂导演台：与导演台同挂时实验室就绪检测 20 秒超时（实测，原因未查），这一格只看对话框本身。
 */
function SwitchbackSettings({ locale, legacy }: { locale: AppLocale; legacy: boolean }): JSX.Element {
  const [on, setOn] = React.useState(legacy)
  const [open, setOpen] = React.useState(true)
  const [preferences, setPreferences] = React.useState(readDirectorPreferences)
  React.useMemo(() => void i18n.changeLanguage(locale), [locale])
  return (
    <div className="fixed inset-0 bg-nomi-bg">
      <SettingsDialog
        open={open}
        preferences={preferences}
        onChange={setPreferences}
        onClose={() => setOpen(false)}
        onOpenHelp={() => setOpen(false)}
        layout={{ legacy: on, onChange: setOn }}
      />
    </div>
  )
}

export const SWITCHBACK_STATES: readonly LabState[] = [
  {
    id: 'd3-switchback-off-zh',
    name: '切回入口 · 偏好设置 · 开关关（用 3D-BOX）· 浅色 · 中文（产品里导演台开着时整个 App 锁暗，这一版看不到，只证明 token）',
    source: SOURCE,
    coverage: 'component-only',
    scheme: 'light',
    capture: 'viewport',
    render: () => <SwitchbackSettings locale="zh-CN" legacy={false} />,
  },
  {
    id: 'd3-switchback-on-zh',
    name: '切回入口 · 偏好设置 · 开关开（用旧导演台）· 浅色 · 中文（产品里锁暗，只证明 token）',
    source: SOURCE,
    coverage: 'component-only',
    scheme: 'light',
    capture: 'viewport',
    render: () => <SwitchbackSettings locale="zh-CN" legacy />,
  },
  {
    id: 'd3-switchback-on-zh-dark',
    name: '切回入口 · 偏好设置 · 开关开（用旧导演台）· 暗色 · 中文（产品里看到的就是这一版）',
    source: SOURCE,
    coverage: 'component-only',
    scheme: 'dark',
    capture: 'viewport',
    render: () => <SwitchbackSettings locale="zh-CN" legacy />,
  },
  {
    id: 'd3-switchback-off-en',
    name: 'Switch-back · preferences · off (3D-BOX) · dark · English',
    source: SOURCE,
    coverage: 'component-only',
    scheme: 'dark',
    capture: 'viewport',
    render: () => <SwitchbackSettings locale="en" legacy={false} />,
  },
  {
    id: 'd3-switchback-on-en',
    name: 'Switch-back · preferences · on (classic director) · dark · English',
    source: SOURCE,
    coverage: 'component-only',
    scheme: 'dark',
    capture: 'viewport',
    render: () => <SwitchbackSettings locale="en" legacy />,
  },
  {
    id: 'd3-switchback-legacy-zh',
    name: '切回之后：旧导演台（全屏、默认进精修、底部「描述场景…」）· 浅色 · 中文',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'light',
    capture: 'viewport',
    render: () => <Director3dBoxLazyStage locale="zh-CN" fixture="courtyard" flag="off" />,
  },
  {
    id: 'd3-switchback-legacy-en',
    name: 'After switching back: classic director (full screen, Refine, “Describe scene…”) · dark · English',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    capture: 'viewport',
    render: () => <Director3dBoxLazyStage locale="en" fixture="courtyard" flag="off" />,
  },
]
