import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { reportPickCameraFirst, type Scene3DFeedback } from './useScene3DFullscreenActions'
import { makeCamera } from './scene3dMath'
import { notifications, notificationsStore } from '@mantine/notifications'

const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')

describe('scene editor local feedback', () => {
  it('five camera-selection failures keep one host message with the latest action', () => {
    notifications.clean()
    let feedback: Scene3DFeedback | null = null
    const present = (next: Scene3DFeedback | null) => { feedback = next }
    const pick = vi.fn()
    const cameras = Array.from({ length: 5 }, () => makeCamera())
    for (const camera of cameras) reportPickCameraFirst(camera, pick, present)
    const latest = feedback as Scene3DFeedback | null
    expect(latest?.message).toBeTruthy()
    expect(latest?.actionLabel).toBeTruthy()
    latest?.onAction?.()
    expect(pick).toHaveBeenCalledExactlyOnceWith(cameras[4].id)
    expect(notificationsStore.getState().notifications).toHaveLength(0)
  })

  it('missing camera remains visible as actionable guidance in the editor', () => {
    const present = vi.fn()
    reportPickCameraFirst(undefined, vi.fn(), present)
    expect(present).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }))
    expect(present.mock.calls[0][0].message.length).toBeGreaterThan(0)
  })

  it('all fullscreen producer hooks require their host instead of importing toast', () => {
    for (const file of ['useScene3DFullscreenActions.ts', 'useScene3DCaptureExport.ts', 'useScene3DTaskFlow.ts', 'useScene3DTakeRecorder.ts']) {
      expect(source(file)).not.toMatch(/import .*\b(?:toast|useToastStore)\b.*from/)
      expect(source(file)).toContain('reportFeedback: ReportScene3DFeedback')
    }
    expect(source('Scene3DFullscreen.tsx')).toContain("level: 'inline'")
    expect(source('Scene3DFullscreen.tsx')).toContain('role="status"')
    expect(source('useScene3DCaptureExport.ts')).toContain('onKeyframesExported: (count: number) => void')
  })
})
