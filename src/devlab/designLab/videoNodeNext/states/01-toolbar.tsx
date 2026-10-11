// 设计实验室 · 屏「视频节点的下一步」· 选中视频节点的浮条。
// 截帧候选由四轨（中浅 / 英浅 / 中暗 / 英暗）登记，尚未接正式功能。
import React from 'react'
import type { LabState } from '../../labScreen'
import { FrameCaptureStage } from '../FrameCaptureStage'

const SOURCE = 'docs/plan/2026-10-11-frame-capture-reference.md §1 浮条'

export const VN_TOOLBAR_STATES: readonly LabState[] = [
  {
    id: 'vn-01-frame-menu-zh',
    name: '视频节点选中 · 卡内进度条右侧相机，一键截取当前画面；首尾帧留在浮条（中文 · 浅色）',
    source: SOURCE,
    mirrors: 'none',
    coverage: 'component-only',
    capture: 'viewport',
    render: () => <FrameCaptureStage locale="zh-CN" />,
  },
  {
    id: 'vn-01-frame-menu-en',
    name: '视频节点选中 · 卡内进度条右侧相机，一键截取当前画面；首尾帧留在浮条（英文 · 浅色）',
    source: SOURCE,
    mirrors: 'none',
    coverage: 'component-only',
    capture: 'viewport',
    render: () => <FrameCaptureStage locale="en" />,
  },
  {
    id: 'vn-01-frame-menu-zh-dark',
    name: '视频节点选中 · 卡内进度条右侧相机，一键截取当前画面；首尾帧留在浮条（中文 · 暗色）',
    source: SOURCE,
    mirrors: 'none',
    coverage: 'component-only',
    capture: 'viewport',
    scheme: 'dark',
    render: () => <FrameCaptureStage locale="zh-CN" />,
  },
  {
    id: 'vn-01-frame-menu-en-dark',
    name: '视频节点选中 · 卡内进度条右侧相机，一键截取当前画面；首尾帧留在浮条（英文 · 暗色）',
    source: SOURCE,
    mirrors: 'none',
    coverage: 'component-only',
    capture: 'viewport',
    scheme: 'dark',
    render: () => <FrameCaptureStage locale="en" />,
  },
]
