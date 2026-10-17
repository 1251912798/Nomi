// 设计实验室 · 导演视图（3D-BOX）· 主按钮「出成片 ▾」各态（S5，设计卡 docs/plan/2026-10-16-director-3dbox-produce-design-card.md ★4）。
//
// 只改按钮的文案与状态，用现役组件出样（协调 10-16：只改文案和状态的，用现有组件出样即可）。每一格都是现役 DirectorEditor（可编辑）
// + 现役 Agent 面板；导演节点上的预演状态由夹具写进画布节点 meta（与常驻 Host 写回同一个键），按钮只读这一份判据。
// 浅色主题下导演台锁暗（2026-09-09 拍板），中文格用浅色主题、英文格用暗色主题，两种主题各覆盖一遍。
// 能出片的几格用夜街追车（3 镜 9 秒）：庭院对峙 12 秒超过预演上限，按当前工程判就是「超长」那一格（V-3dbox 10-16）。
import React from 'react'
import type { LabState } from '../../labScreen'
import { Director3dBoxLazyStage } from '../director3dboxLazyStage'

const SOURCE = 'docs/plan/2026-10-16-director-3dbox-produce-design-card.md ★4 · 样张 director-3dbox-mockup 顶栏右「出成片 ▾」'
const OPEN_MENU = [{ click: '[data-testid="director-produce-menu"]' }] as const

export const PRODUCE_STATES: readonly LabState[] = [
  {
    id: 'd3-produce-idle-zh',
    name: '出成片 · 可点（预演已好或待渲染）· 浅色 · 中文',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'light',
    capture: 'viewport',
    render: () => <Director3dBoxLazyStage locale="zh-CN" fixture="chase" drive="shot-2" preview="ready" editable />,
  },
  {
    id: 'd3-produce-idle-en',
    name: 'Produce · ready · dark · English',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    capture: 'viewport',
    render: () => <Director3dBoxLazyStage locale="en" fixture="chase" drive="shot-2" preview="ready" editable />,
  },
  {
    id: 'd3-produce-rendering-zh',
    name: '出成片 · 预演渲染中 · 浅色 · 中文',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'light',
    capture: 'viewport',
    render: () => <Director3dBoxLazyStage locale="zh-CN" fixture="chase" drive="shot-2" preview="rendering" editable />,
  },
  {
    id: 'd3-produce-rendering-en',
    name: 'Produce · rendering preview · dark · English',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    capture: 'viewport',
    render: () => <Director3dBoxLazyStage locale="en" fixture="chase" drive="shot-2" preview="rendering" editable />,
  },
  {
    id: 'd3-produce-retry-zh',
    name: '出成片 · 预演失败 · 重试预演 · 浅色 · 中文',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'light',
    capture: 'viewport',
    render: () => <Director3dBoxLazyStage locale="zh-CN" fixture="chase" drive="shot-2" preview="failed" editable />,
  },
  {
    id: 'd3-produce-too-long-en',
    name: 'Produce · courtyard runs 12s, over the 10s preview limit (judged on the current scene) · disabled · dark · English',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    capture: 'viewport',
    render: () => <Director3dBoxLazyStage locale="en" fixture="courtyard" drive="shot-2" editable />,
  },
  {
    id: 'd3-produce-empty-zh',
    name: '出成片 · 没有镜头 · 置灰 · 浅色 · 中文',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'light',
    capture: 'viewport',
    render: () => <Director3dBoxLazyStage locale="zh-CN" fixture="empty" editable />,
  },
  {
    id: 'd3-produce-menu-zh',
    name: '出成片 ▾ · 截图 + 录制 MP4 + 产出 · 浅色 · 中文',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'light',
    capture: 'viewport',
    render: () => <Director3dBoxLazyStage locale="zh-CN" fixture="chase" drive="shot-2" preview="ready" editable steps={OPEN_MENU} />,
  },
  {
    id: 'd3-produce-menu-en',
    name: 'Produce ▾ · screenshot + record MP4 + outputs · dark · English',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    capture: 'viewport',
    render: () => <Director3dBoxLazyStage locale="en" fixture="chase" drive="shot-2" preview="ready" editable steps={OPEN_MENU} />,
  },
]
