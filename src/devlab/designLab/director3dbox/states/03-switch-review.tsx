// 设计实验室 · 导演视图（3D-BOX）· 切换前对账格（2026-10-16，用户「开了吧 别一直关着」）。
//
// 切换 = 3D-BOX 成为唯一的导演台（方案 docs/plan/2026-10-04-director-3dbox-phase3.md §11）。走设计流程
// （docs/engineering/design-pipeline.md）之前，01 / 02 屏只有暗色 + 默认宽度的格子；这里补齐清单
// docs/design/boards/2026-10-16/Director3dbox.board.json 要的状态：浅色主题（导演台按 09-09 拍板锁暗，
// 看的是浅色主题下用户实际看到的整屏）、窄窗（真机最小窗 1100 × 默认 Agent 时壳宽 728）、空工程的浅色与窄窗。
// 每一格都是现役 DirectorEditor+ 现役 Agent 面板，数据同 01 屏（庭院对峙 4 镜 12 秒）。
import React from 'react'
import type { LabState } from '../../labScreen'
import { Director3dBoxLazyStage } from '../director3dboxLazyStage'

const SOURCE = 'docs/design/boards/2026-10-16/Director3dbox.board.json · 切换前对账（样张 director-3dbox-mockup 布局 A + v2）'
/** 窄格：Agent 面板 520，把导演台壳压到 728（与精修屏 d3a-narrow-* 同一取值）。 */
const NARROW_AGENT = 520

export const SWITCH_REVIEW_STATES: readonly LabState[] = [
  {
    id: 'd3-switch-courtyard-light-zh',
    name: '切换前对账 · 浅色主题 · 庭院对峙 · 点第 2 镜（中文）',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'light',
    capture: 'viewport',
    render: () => <Director3dBoxLazyStage locale="zh-CN" fixture="courtyard" drive="shot-2" />,
  },
  {
    id: 'd3-switch-courtyard-light-en',
    name: 'Switch review · light theme · courtyard · shot 2 picked (English)',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'light',
    capture: 'viewport',
    render: () => <Director3dBoxLazyStage locale="en" fixture="courtyard" drive="shot-2" />,
  },
  {
    id: 'd3-switch-empty-light-zh',
    name: '切换前对账 · 浅色主题 · 空工程（中文）',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'light',
    capture: 'viewport',
    render: () => <Director3dBoxLazyStage locale="zh-CN" fixture="empty" />,
  },
  {
    id: 'd3-switch-narrow-light-zh',
    name: '切换前对账 · 浅色主题 · 窄窗 728 · 点第 2 镜（中文）',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'light',
    capture: 'viewport',
    render: () => <Director3dBoxLazyStage locale="zh-CN" fixture="courtyard" drive="shot-2" agentWidth={NARROW_AGENT} />,
  },
  {
    id: 'd3-switch-narrow-en',
    name: 'Switch review · dark · narrow 728 · shot 2 picked (English)',
    source: SOURCE,
    coverage: 'shell',
    scheme: 'dark',
    capture: 'viewport',
    render: () => <Director3dBoxLazyStage locale="en" fixture="courtyard" drive="shot-2" agentWidth={NARROW_AGENT} />,
  },
]
