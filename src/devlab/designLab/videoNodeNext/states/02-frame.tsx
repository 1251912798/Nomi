// 设计实验室 · 屏「视频节点的下一步」· 截当前帧：旁边出一张图片卡并连线。
// 截帧候选由四轨（中浅 / 英浅 / 中暗 / 英暗）登记，尚未接正式功能。
import React from 'react'
import type { LabState } from '../../labScreen'
import { FrameCaptureStage } from '../FrameCaptureStage'

const SOURCE = 'docs/plan/2026-10-11-frame-capture-reference.md §2 截帧'

export const VN_FRAME_STATES: readonly LabState[] = [
  {
    id: 'vn-02-frame-done-zh',
    name: '截当前帧之后 · 原视频右侧新出一张图片卡（停在 0:02.2 的那一帧）并连上线，原视频不动（中文 · 浅色）',
    source: SOURCE,
    mirrors: 'none',
    coverage: 'component-only',
    render: () => <FrameCaptureStage locale="zh-CN" initial="done" />,
  },
  {
    id: 'vn-02-frame-done-en',
    name: '截当前帧之后 · 原视频右侧新出一张图片卡（停在 0:02.2 的那一帧）并连上线，原视频不动（英文 · 浅色）',
    source: SOURCE,
    mirrors: 'none',
    coverage: 'component-only',
    render: () => <FrameCaptureStage locale="en" initial="done" />,
  },
  {
    id: 'vn-02-frame-done-zh-dark',
    name: '截当前帧之后 · 原视频右侧新出一张图片卡（停在 0:02.2 的那一帧）并连上线，原视频不动（中文 · 暗色）',
    source: SOURCE,
    mirrors: 'none',
    coverage: 'component-only',
    scheme: 'dark',
    render: () => <FrameCaptureStage locale="zh-CN" initial="done" />,
  },
  {
    id: 'vn-02-frame-done-en-dark',
    name: '截当前帧之后 · 原视频右侧新出一张图片卡（停在 0:02.2 的那一帧）并连上线，原视频不动（英文 · 暗色）',
    source: SOURCE,
    mirrors: 'none',
    coverage: 'component-only',
    scheme: 'dark',
    render: () => <FrameCaptureStage locale="en" initial="done" />,
  },
]
