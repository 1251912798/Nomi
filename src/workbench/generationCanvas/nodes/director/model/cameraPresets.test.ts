import { describe, expect, it } from 'vitest'
import { CAMERA_PRESETS, buildCameraFromPreset } from './cameraPresets'

describe('cameraPresets', () => {
  it('ships all 14 presets', () => {
    expect(CAMERA_PRESETS.map((preset) => preset.id)).toEqual([
      'current', 'front_medium', 'front_closeup', 'front_wide', 'side_follow', 'side_closeup', 'back_medium',
      'high_wide', 'high_40', 'low_angle', 'low_wide', 'ots_left', 'ots_right', 'birds_eye',
    ])
  })

  it('front_closeup relative to a subject at (2,0,3) facing +X lands on its +X side looking at its face', () => {
    const preset = CAMERA_PRESETS.find((item) => item.id === 'front_closeup')!
    const camera = buildCameraFromPreset({
      preset,
      id: 'cam',
      name: '机位 1',
      subject: { position: { x: 2, y: 0, z: 3 }, rotation: { x: 0, y: 90, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    })
    expect(camera.position.x).toBeCloseTo(3.2)
    expect(camera.position.y).toBeCloseTo(1.6)
    expect(camera.position.z).toBeCloseTo(3)
    // 预设只给位姿，不挂看向字段
    expect(camera.lookAtType).toBeUndefined()
    expect(camera.lookAtCoords).toBeUndefined()
    expect(camera.yaw).toBeCloseTo(270)
    expect(camera.fov).toBe(35)
    expect(camera.focalLengthMm).toBeCloseTo(38.1, 0)
  })

  it('without a subject the preset is placed around the world origin', () => {
    const preset = CAMERA_PRESETS.find((item) => item.id === 'birds_eye')!
    const camera = buildCameraFromPreset({ preset, id: 'cam', name: 'x' })
    expect(camera.position).toEqual({ x: 0, y: 8, z: 0.1 })
    expect(camera.pitch).toBeGreaterThan(85)
    expect(camera.fov).toBe(60)
  })

  // 2026-10-24 走查 ④：给上传的泼溅加「正面特写」，机位落到地面以下（Y = -1.60）。泼溅按源轴约定绕 X 翻 180°，
  // 预设套主体的整份旋转，本地 y = +1.6 就成了世界 y = -1.6。机位预设只取主体的位置、水平朝向和各轴尺度大小。
  describe('the preset frame is the subject position + horizontal heading + scale magnitude, never its tilt', () => {
    const closeup = CAMERA_PRESETS.find((item) => item.id === 'front_closeup')!
    const unit = { x: 1, y: 1, z: 1 }
    const at = (rotation: { x: number; y: number; z: number }, scale = unit, position = { x: 0, y: 0, z: 0 }) =>
      buildCameraFromPreset({ preset: closeup, id: 'cam', name: 'x', subject: { position, rotation, scale } })
    const expectSamePose = (actual: ReturnType<typeof at>, expected: ReturnType<typeof at>) => {
      for (const axis of ['x', 'y', 'z'] as const) expect(actual.position[axis], axis).toBeCloseTo(expected.position[axis], 6)
      expect(actual.yaw).toBeCloseTo(expected.yaw, 6)
      expect(actual.pitch).toBeCloseTo(expected.pitch, 6)
    }

    it('reported case: a splat flipped 180° about X (source-axis convention) gets its front close-up above ground', () => {
      const camera = at({ x: 180, y: 0, z: 0 })
      expect(camera.position.y).toBeGreaterThan(0)
      expect(camera.position.y).toBeCloseTo(1.6)
      expect(camera.position.z).toBeCloseTo(1.2)
      expect(camera.pitch).toBeCloseTo(0)
      expect(camera.roll).toBeCloseTo(0)
    })

    it('a negative y scale (mirrored upside down) also keeps the close-up above ground', () => {
      expect(at({ x: 0, y: 0, z: 0 }, { x: 1, y: -1, z: 1 }).position.y).toBeCloseTo(1.6)
    })

    it.each([
      ['pitched 30°', { x: 30, y: 0, z: 0 }],
      ['rolled 20°', { x: 0, y: 0, z: 20 }],
      ['lying on its back (pitched -90°)', { x: -90, y: 0, z: 0 }],
    ])('a subject %s does not tilt the camera or change its height', (_label, rotation) => {
      expectSamePose(at(rotation), at({ x: 0, y: 0, z: 0 }))
    })

    it('body-type scale still applies: a child close-up sits at child eye height', () => {
      const camera = at({ x: 0, y: 0, z: 0 }, { x: 0.72, y: 0.7, z: 0.72 })
      expect(camera.position.y).toBeCloseTo(1.12)
      expect(camera.position.z).toBeCloseTo(0.864)
    })

    it('the heading is read from the frame, not the Euler y digit: a world frame decomposed as (180, 60, 180) frames like a 120° yaw', () => {
      expectSamePose(at({ x: 180, y: 60, z: 180 }, unit, { x: 2, y: 0, z: 3 }), at({ x: 0, y: 120, z: 0 }, unit, { x: 2, y: 0, z: 3 }))
    })

    it('a flipped splat turned in the inspector follows the way it visually turns', () => {
      // 绕 X 翻过的主体，本地 Y 轴朝下：检查器里 Y +90° 在世界里是往 -90° 转
      expectSamePose(at({ x: 180, y: 90, z: 0 }), at({ x: 0, y: -90, z: 0 }))
    })
  })

  it('"current" freezes the free camera pose and rounds its fov', () => {
    const camera = buildCameraFromPreset({
      preset: CAMERA_PRESETS[0],
      id: 'cam',
      name: 'x',
      currentView: { position: { x: 1, y: 2, z: 3 }, yaw: 12.5, pitch: -3, roll: 0, fov: 33.4 },
    })
    expect(camera.position).toEqual({ x: 1, y: 2, z: 3 })
    expect(camera.yaw).toBe(12.5)
    expect(camera.fov).toBe(33)
    expect(camera.lookAtType).toBeUndefined()
  })
})
