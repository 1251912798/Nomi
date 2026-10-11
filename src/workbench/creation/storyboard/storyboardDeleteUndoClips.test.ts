import { beforeEach, describe, expect, it } from 'vitest'
import { deleteStoryboardRows, restoreStoryboardDeletion } from './storyboardDeleteUndo'
import type { StoryboardPlan } from '../../generationCanvas/agent/storyboardPlan'
import { useGenerationCanvasStore } from '../../generationCanvas/store/generationCanvasStore'
import { useWorkbenchStore } from '../../workbenchStore'
import { normalizeTimeline } from '../../timeline/timelineMath'
import type { TimelineClip } from '../../timeline/timelineTypes'

const canvas = () => useGenerationCanvasStore.getState()
const workbench = () => useWorkbenchStore.getState()
const plan = (): StoryboardPlan => ({ title: 'P', anchors: [], shots: [1, 2].map(index => ({ index, shotId: `s${index}`, prompt: `Prompt ${index}`, durationSec: 3, anchorIds: [] })) })
const clip = (id: string, sourceNodeId: string, start: number, end: number): TimelineClip => ({
  id, type: 'video', sourceNodeId, label: id, startFrame: start, endFrame: end, frameCount: end - start, offsetStartFrame: 0, offsetEndFrame: 0, url: `https://example.invalid/${id}.mp4`,
})
const clipIds = () => workbench().timeline.tracks.flatMap(track => track.clips.map(c => c.id)).sort()
/** What the project file holds: serialize, then load it back the way reopening does. */
const reopened = () => normalizeTimeline(JSON.parse(JSON.stringify(workbench().timeline)))

beforeEach(() => {
  canvas().restoreSnapshot({
    nodes: ['n1', 'n2'].map(id => ({ id, kind: 'video', title: id, categoryId: 'shots', position: { x: 0, y: 0 } })),
    edges: [], groups: [],
  })
  // n1 backs two clips (one with a transition into the n2 clip); n2 backs two clips.
  workbench().restoreTimeline({
    version: 1, fps: 30, scale: 1, playheadFrame: 0, textClips: [],
    tracks: [{ id: 'videoTrack', type: 'video', label: 'v', clips: [clip('c1', 'n1', 0, 30), clip('c2', 'n2', 30, 60), clip('c3', 'n1', 60, 90), clip('c4', 'n2', 90, 120)] }],
    transitions: [{ fromClipId: 'c1', toClipId: 'c2', type: 'crossfade', durationFrames: 6 }],
  })
})

describe('storyboard row deletion undo restores the timeline clips the deletion removed', () => {
  it('delete -> undo -> reopen: clip count equals the count before deletion', () => {
    const before = plan()
    expect(clipIds()).toEqual(['c1', 'c2', 'c3', 'c4'])
    const { plan: after, undo } = deleteStoryboardRows(before, [before.shots[0]], ['n1'], canvas())
    expect(clipIds()).toEqual(['c2', 'c4'])
    restoreStoryboardDeletion(after, undo, canvas())
    expect(canvas().nodes.map(node => node.id).sort()).toEqual(['n1', 'n2'])
    expect(clipIds()).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(reopened().tracks.flatMap(track => track.clips).length).toBe(4)
    expect(workbench().timeline.transitions).toEqual([{ fromClipId: 'c1', toClipId: 'c2', type: 'crossfade', durationFrames: 6 }])
    expect(workbench().timeline.tracks.flatMap(track => track.clips).find(c => c.id === 'c3')).toMatchObject({ startFrame: 60, endFrame: 90 })
  })

  it('the same class: plain canvas Cmd+Z of a node delete brings its clips back, redo takes them out again', () => {
    canvas().deleteNode('n1')
    expect(clipIds()).toEqual(['c2', 'c4'])
    canvas().undo()
    expect(clipIds()).toEqual(['c1', 'c2', 'c3', 'c4'])
    canvas().redo()
    expect(clipIds()).toEqual(['c2', 'c4'])
  })

  it('cutting a node strips its clips like delete does, and undo returns them', () => {
    canvas().selectNodes(['n1'])
    canvas().cutSelectedNodes()
    expect(clipIds()).toEqual(['c2', 'c4'])
    canvas().undo()
    expect(clipIds()).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  it('does not put a clip back on top of something placed in its slot after the deletion', () => {
    const before = plan()
    const { plan: after, undo } = deleteStoryboardRows(before, [before.shots[0]], ['n1'], canvas())
    workbench().restoreTimeline({
      ...workbench().timeline,
      tracks: workbench().timeline.tracks.map(track => track.id === 'videoTrack' ? { ...track, clips: [...track.clips, clip('late', 'n2', 0, 20)] } : track),
    })
    restoreStoryboardDeletion(after, undo, canvas())
    expect(clipIds()).toEqual(['c2', 'c3', 'c4', 'late'])
  })
})
