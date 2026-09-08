import React from 'react'
import { SoundStage } from '../settingsSoundLabKit'
import type { LabState } from '../../labScreen'

export const SETTINGS_SOUND_STATES: readonly LabState[] = [
  {
    id: 'sound-01-on',
    name: '默认开',
    source: 'AttentionSoundSection + settings bridge',
    coverage: 'shell',
    render: () => <SoundStage state="on" />,
  },
  {
    id: 'sound-02-off',
    name: '已关闭',
    source: 'AttentionSoundSection + settings bridge',
    coverage: 'shell',
    render: () => <SoundStage state="off" />,
  },
  {
    id: 'sound-03-custom',
    name: '自定义文件',
    source: 'AttentionSoundSection + settings bridge',
    coverage: 'shell',
    render: () => <SoundStage state="custom" />,
  },
  {
    id: 'sound-04-playing',
    name: '试听中',
    source: 'AttentionSoundSection + settings bridge',
    coverage: 'shell',
    render: () => <SoundStage state="playing" />,
  },
]
