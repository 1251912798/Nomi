/**
 * 「视图 ▾」真组件：点开关再撤销，上一步编辑还在（2026-10-24 导演台走查 ②）。
 *
 * 三分线 / 骨骼与 IK 把手 / 角色头部标签三个开关和几何体显示模式都写 sceneConfig。以前它们直接调 patchSceneConfig、
 * 前面没存快照：⌘Z 恢复的是更早那张快照，开关和上一步真编辑（这里是加一盏灯）一起被撤掉。
 * 这里用 react-reconciler 测试渲染器真挂 ViewMenu、真点它渲染出来的开关（回调是真的），只把要真 DOM 的浮层换成直出：
 * 浮层原语 Popover 要 body 传送门与触发器矩形，分段控件 NomiSegmented 只记下真组件交给它的 props。
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createReactTestRenderer } from '../../../../../ai/v4/testReactRenderer'

const probe = vi.hoisted(() => ({ segmented: [] as Array<{ ariaLabel: string; onChange: (value: string) => void }> }))

// 和真的 react-i18next 一样：同一语言下 t 是同一个引用；文案断言用 key 本身。
const translation = vi.hoisted(() => ({ t: (key: string) => key, i18n: { language: 'zh-CN', resolvedLanguage: 'zh-CN' } }))
vi.mock('react-i18next', async () => ({
  ...(await vi.importActual<typeof import('react-i18next')>('react-i18next')),
  useTranslation: () => translation,
}))

vi.mock('../Popover', async () => {
  const { createElement, Fragment } = await vi.importActual<typeof import('react')>('react')
  return {
    Popover: ({ trigger, children }: { trigger: React.ReactNode; children: React.ReactNode }) => createElement(Fragment, null, trigger, children),
    PopoverItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => createElement('button', { type: 'button', onClick }, children),
  }
})

vi.mock('../../../../../../design', async () => ({
  ...(await vi.importActual<typeof import('../../../../../../design')>('../../../../../../design')),
  NomiSegmented: (props: { ariaLabel: string; onChange: (value: string) => void }) => { probe.segmented.push(props); return null },
}))

import { DirectorStoreContext } from '../../DirectorEditorContext'
import { createDirectorStore } from '../../model/directorStore'
import { ViewMenu } from './ViewMenu'

type HostNode = { type: string; props: Record<string, unknown> }

describe('「视图 ▾」真组件：点开关再撤销，上一步编辑还在', () => {
  let nodes: HostNode[]
  let renderer: ReturnType<typeof createReactTestRenderer<HostNode>>

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false)
    nodes = []
    probe.segmented.length = 0
    renderer = createReactTestRenderer<HostNode>({
      createInstance: (type, props) => {
        const node = { type, props }
        nodes.push(node)
        return node
      },
    })
  })

  afterEach(() => {
    renderer.close()
    vi.unstubAllGlobals()
  })

  function mount() {
    const store = createDirectorStore({ defaultSceneName: 'Scene 1' })
    renderer.render(
      <DirectorStoreContext.Provider value={store}>
        <ViewMenu onResetView={() => undefined} />
      </DirectorStoreContext.Provider>,
    )
    return store
  }

  const switchNamed = (label: string) => [...nodes].reverse().find((node) => node.props.role === 'switch' && node.props['aria-label'] === label)

  it.each([
    ['director.aspect.thirds', 'showRuleOfThirds'],
    ['director.bottomBar.skeleton', 'showSkeleton'],
    ['director.inspector.characterLabels', 'showCharacterLabels'],
  ] as const)('点「%s」开关再撤销：开关回去，上一步加的灯还在', (label, key) => {
    const store = mount()
    store.getState().addLight('point', 'Light')
    const afterEdit = store.getState().exportProject()
    const before = store.getState().activeScene().sceneConfig[key]
    const button = switchNamed(label)
    expect(button, `渲染出了「${label}」开关`).toBeTruthy()
    ;(button!.props.onClick as () => void)()
    expect(store.getState().activeScene().sceneConfig[key]).toBe(!before)
    store.getState().undo()
    expect(store.getState().exportProject()).toEqual(afterEdit)
  })

  it('几何体显示切到白模再撤销：回到实体，上一步加的灯还在', () => {
    const store = mount()
    store.getState().addLight('point', 'Light')
    const afterEdit = store.getState().exportProject()
    const segmented = probe.segmented.filter((props) => props.ariaLabel === 'director.displayMode.aria').at(-1)
    expect(segmented, '渲染出了显示模式分段控件').toBeTruthy()
    segmented!.onChange('clay')
    expect(store.getState().activeScene().sceneConfig.modelDisplayMode).toBe('clay')
    store.getState().undo()
    expect(store.getState().exportProject()).toEqual(afterEdit)
  })
})
