import { describe, expect, it } from 'vitest'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import {
  VIDEO_DEPTH_META_KEY,
  formatVideoDepthEta,
  isVideoDepthBusy,
  readVideoDepthSettings,
  videoDepthProgressView,
  videoDepthSettingsPatch,
} from './videoDepthNodeModel'
import {
  initialVideoDepthRunState,
  nextVideoDepthRunState,
  type VideoDepthPhase,
} from '../../../../electron/shared/canvas/videoDepthRun'

function node(partial: Partial<GenerationCanvasNode>): GenerationCanvasNode {
  return {
    id: 'n1',
    kind: 'video',
    position: { x: 0, y: 0 },
    status: 'idle',
    ...partial,
  } as GenerationCanvasNode
}

describe('readVideoDepthSettings', () => {
  it('returns the defaults for a node that has never been configured', () => {
    const settings = readVideoDepthSettings(node({}))
    expect(settings.mode).toBe('depth')
    expect(settings.maxResolution).toBe(518)
    expect(settings.processingFps).toBe(30)
  })

  it('falls back to defaults rather than painting half a broken setting', () => {
    const broken = node({ meta: { [VIDEO_DEPTH_META_KEY]: { mode: 'skeleton_black', maxResolution: 1024 } } })
    expect(readVideoDepthSettings(broken).mode).toBe('depth')
  })

  it('keeps a valid stored setting intact', () => {
    const stored = node({
      meta: { [VIDEO_DEPTH_META_KEY]: { mode: 'original_skeleton', maxResolution: 'original', processingFps: 12 } },
    })
    const settings = readVideoDepthSettings(stored)
    expect(settings.mode).toBe('original_skeleton')
    expect(settings.maxResolution).toBe('original')
    expect(settings.processingFps).toBe(12)
  })
})

describe('videoDepthSettingsPatch', () => {
  it('merges one change into the full settings and keeps the rest of meta', () => {
    const source = node({ meta: { other: 'keep me', [VIDEO_DEPTH_META_KEY]: { processingFps: 12 } } })
    const patch = videoDepthSettingsPatch(source, { mode: 'depth_skeleton' }, () => 1_700_000_000_000)
    expect(patch.meta.other).toBe('keep me')
    const next = patch.meta[VIDEO_DEPTH_META_KEY] as { mode: string; processingFps: number; updatedAt: string }
    expect(next.mode).toBe('depth_skeleton')
    expect(next.processingFps).toBe(12)
    expect(next.updatedAt).toBe(new Date(1_700_000_000_000).toISOString())
  })

  it('repairs a broken stored setting on the next edit instead of writing more of it back', () => {
    const broken = node({ meta: { [VIDEO_DEPTH_META_KEY]: { mode: 'skeleton_black' } } })
    const next = videoDepthSettingsPatch(broken, { processingFps: 24 }).meta[VIDEO_DEPTH_META_KEY] as { mode: string }
    expect(next.mode).toBe('depth')
  })
})

describe('videoDepthProgressView', () => {
  it('reports no percent at all when there is nothing measured yet', () => {
    expect(videoDepthProgressView(initialVideoDepthRunState('j'))).toEqual({ phase: 'idle' })
  })

  it('turns byte progress into a percent during the download phase', () => {
    const state = nextVideoDepthRunState(
      nextVideoDepthRunState(initialVideoDepthRunState('j'), { kind: 'enter', phase: 'downloading' }),
      { kind: 'bytes', doneBytes: 25, totalBytes: 100 },
    )
    expect(videoDepthProgressView(state)).toEqual({ phase: 'downloading', percent: 25 })
  })

  it('carries the eta through only when the run actually measured one', () => {
    const running = nextVideoDepthRunState(initialVideoDepthRunState('j'), { kind: 'enter', phase: 'processing' })
    const measured = nextVideoDepthRunState(running, { kind: 'frames', doneFrames: 5, totalFrames: 20, etaSeconds: 90 })
    const unmeasured = nextVideoDepthRunState(running, { kind: 'frames', doneFrames: 1, totalFrames: 20, etaSeconds: null })
    expect(videoDepthProgressView(measured).etaSeconds).toBe(90)
    expect(videoDepthProgressView(unmeasured).etaSeconds).toBeUndefined()
  })
})

describe('isVideoDepthBusy', () => {
  it('covers every waiting phase and no terminal one', () => {
    const waiting: VideoDepthPhase[] = ['downloading', 'extracting', 'warming', 'processing', 'encoding']
    const settled: VideoDepthPhase[] = ['idle', 'done', 'failed', 'cancelled']
    expect(waiting.every(isVideoDepthBusy)).toBe(true)
    expect(settled.some(isVideoDepthBusy)).toBe(false)
  })
})

describe('formatVideoDepthEta', () => {
  it('formats as m:ss and never shows a negative countdown', () => {
    expect(formatVideoDepthEta(9)).toBe('0:09')
    expect(formatVideoDepthEta(125)).toBe('2:05')
    expect(formatVideoDepthEta(-3)).toBe('0:00')
  })
})
