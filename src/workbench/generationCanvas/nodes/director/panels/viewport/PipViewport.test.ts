import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PipRect } from '../../scene/pipCamera'

type Effect = { deps: readonly unknown[]; cleanup?: (() => void) | void }
const runtime = vi.hoisted(() => ({
  refs: [] as { current: unknown }[], refIndex: 0, effects: [] as Effect[], effectIndex: 0,
  layoutEffects: [] as (() => void)[], effectsAfterCommit: [] as (() => void)[],
  layout: { left: 14, bottom: 14, width: 280, collapsed: false }, show: true, camera: true,
}))
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>()
  const schedule = (queue: (() => void)[]) => (setup: () => (() => void) | void, deps: readonly unknown[]) => {
    const index = runtime.effectIndex++; const previous = runtime.effects[index]
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      queue.push(() => { previous?.cleanup?.(); runtime.effects[index] = { deps, cleanup: setup() } })
    }
  }
  return { ...actual, default: { ...actual,
    useRef: (current: unknown) => runtime.refs[runtime.refIndex++] ??= { current },
    useState: () => [runtime.layout, (next: typeof runtime.layout) => { runtime.layout = next }],
    useCallback: (fn: unknown) => fn,
    useLayoutEffect: (...args: Parameters<ReturnType<typeof schedule>>) => schedule(runtime.layoutEffects)(...args),
    useEffect: (...args: Parameters<ReturnType<typeof schedule>>) => schedule(runtime.effectsAfterCommit)(...args),
  } }
})
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../../../../../design', () => ({ NomiSelect: 'select', WorkbenchButton: 'button', WorkbenchIconButton: 'button' }))
vi.mock('../../DirectorEditorContext', () => ({
  useDirectorStoreApi: () => ({}),
  useDirectorStore: (select: (state: unknown) => unknown) => select({
    activeScene: () => ({ cameras: runtime.camera ? [{ id: 'camera', fov: 45, focalLengthMm: 29 }] : [] }),
    project: { exportRatio: '16:9' }, activeCameraId: 'free', previewCameraId: 'camera', selection: { cameraId: null },
    timeline: { isPlaying: false, currentTime: 0 }, recording: null,
    isCameraInCloseupAt: () => false, showCameraPreview: runtime.show,
  }),
}))
import { PipViewport } from './PipViewport'

type Element = React.ReactElement<{ children?: React.ReactNode; style?: React.CSSProperties }> & { ref?: { current: unknown } }
function attachChildren(node: React.ReactNode, screen: unknown) {
  if (Array.isArray(node)) { node.forEach((child) => attachChildren(child, screen)); return }
  if (!React.isValidElement(node)) return
  const element = node as Element
  if (element.ref) element.ref.current = screen
  attachChildren(element.props.children, screen)
}
function fixture(hostAlreadyMounted = false) {
  const box = { left: 24, top: 48, width: 280, height: 157.5 }
  const screen = { getBoundingClientRect: () => box }
  const host = { getBoundingClientRect: () => ({ left: 10, top: 20 }) }
  const hostRef = { current: hostAlreadyMounted ? host as HTMLDivElement : null }
  const rectRef = { current: null as PipRect }
  const observers: { callback: () => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = []
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn(); disconnect = vi.fn()
    constructor(public callback: () => void) { observers.push(this) }
  })
  const render = () => {
    runtime.refIndex = 0; runtime.effectIndex = 0; runtime.layoutEffects = []; runtime.effectsAfterCommit = []
    const element = PipViewport({ rectRef, canvasHostRef: hostRef })
    runtime.refs.forEach((ref) => { ref.current = null }); attachChildren(element, screen)
    // React 18 visits child layout effects before attaching the outer HostComponent ref.
    runtime.layoutEffects.forEach((effect) => effect()); hostRef.current = host as HTMLDivElement
    runtime.effectsAfterCommit.forEach((effect) => effect())
  }
  return { rectRef, observers, render, box }
}
beforeEach(() => {
  runtime.refs = []; runtime.effects = []; runtime.show = true; runtime.camera = true
  runtime.layout = { left: 14, bottom: 14, width: 280, collapsed: false }
})
afterEach(() => { runtime.effects.forEach((effect) => effect.cleanup?.()); vi.unstubAllGlobals() })

describe('PiP committed screen and rectangle lifetime', () => {
  it('measures a camera present at cold mount after the parent host ref attaches', () => {
    const view = fixture(); view.render()
    expect(view.rectRef.current).toEqual({ x: 14, y: 28, width: 280, height: 157.5 })
    expect(view.observers).toHaveLength(1); expect(view.observers[0].observe).toHaveBeenCalledTimes(2)
  })
  it('measures when the first camera is added after an empty scene', () => {
    const view = fixture(); runtime.camera = false; view.render(); expect(view.rectRef.current).toBeNull()
    runtime.camera = true; view.render(); expect(view.rectRef.current?.width).toBe(280)
  })
  it('measures an initially hidden preview when it becomes visible', () => {
    const view = fixture(); runtime.show = false; view.render(); expect(view.rectRef.current).toBeNull()
    runtime.show = true; view.render(); expect(view.rectRef.current?.width).toBe(280)
  })
  it('releases the old screen on hide and acquires the new screen on show', () => {
    const view = fixture(true); view.render(); const old = view.observers[0]
    runtime.show = false; view.render(); expect(view.rectRef.current).toBeNull(); expect(old.disconnect).toHaveBeenCalledOnce()
    view.box.width = 320; runtime.show = true; view.render()
    expect(view.rectRef.current?.width).toBe(320); expect(view.observers).toHaveLength(2)
  })
  it('tracks resize, clears collapsed screens and releases the expanded observer on unmount', () => {
    const view = fixture(true); view.render(); view.box.width = 400; view.observers[0].callback()
    expect(view.rectRef.current?.width).toBe(400)
    runtime.layout = { ...runtime.layout, collapsed: true }; view.render(); expect(view.rectRef.current).toBeNull()
    runtime.layout = { ...runtime.layout, collapsed: false }; view.render(); expect(view.rectRef.current?.width).toBe(400)
    runtime.effects.forEach((effect) => effect.cleanup?.()); runtime.effects = []
    expect(view.rectRef.current).toBeNull(); expect(view.observers[1].disconnect).toHaveBeenCalledOnce()
  })
})

// 结构门岗（2026-10-24 走查 ⑥）：精修画线时，提示条压在顶栏正中的「导演 | 精修」底下——三条提示条各写各的 top-3。
// 悬浮顶栏是 absolute 浮层、不占布局流：浮在视口之上的东西只有从 topbar/topChrome 的 DIRECTOR_TOP_CHROME_PX 取顶部留白，
// 才不会钻到顶栏底下（画中画的拖动上限也从它 derive，所以门岗住这里）。类名或样式里写死顶部位置 = 红。
describe('浮在视口之上的面板都让开悬浮顶栏', () => {
  const PANELS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const viewportFiles = fs.readdirSync(path.join(PANELS, 'viewport')).filter((name) => /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)).map((name) => `viewport/${name}`)
  // 视口叠加层全部 + 同样浮在视口之上的属性卡、资产抽屉（它们里面的列表内容不算浮层，不扫）
  const FLOATS = [...viewportFiles, 'context/ContextCard.tsx', 'side/AssetsDrawer.tsx']
  // 写死顶部位置：类名 top-N / top-px / top-[…]、非零的 inset-N / inset-y-N（inset-0 是铺满的叠加层，不是贴顶的浮层），样式里 top: 数字
  const HARDCODED_TOP = /(?<![\w-])(?:top-(?:\d+(?:\.\d+)?|px|\[[^\]\s]+\])|inset(?:-y)?-(?:[1-9]\d*(?:\.\d+)?|px|\[[^\]\s]+\]))(?![\w/.-])|\btop:\s*['"]?\d/g
  // 不贴视口顶、相对别的框定位的，逐个写明出处；多一个就红
  const INSIDE_ANOTHER_BOX: Record<string, readonly string[]> = {
    // 画幅徽标住在机位取景框里（取景框四周已留 80px 内边距），相对取景框定位
    'viewport/AspectGuide.tsx': ['top-3'],
  }
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const read = (file: string) => strip(fs.readFileSync(path.join(PANELS, file), 'utf8'))

  it.each(FLOATS)('%s：不写死顶部位置', (file) => {
    expect(read(file).match(HARDCODED_TOP) ?? []).toEqual(INSIDE_ANOTHER_BOX[file] ?? [])
  })

  it('三条模式提示条、POV 卡、属性卡、资产抽屉的顶部都取 DIRECTOR_TOP_CHROME_PX', () => {
    for (const file of ['viewport/ViewportOverlays.tsx', 'viewport/CameraPovHud.tsx', 'context/ContextCard.tsx', 'side/AssetsDrawer.tsx']) {
      expect(read(file), file).toMatch(/\btop:\s*DIRECTOR_TOP_CHROME_PX\b/)
    }
  })
})
