import React, { type JSX } from 'react'
import type { Editor } from '@tiptap/react'
import WorkbenchEditor from '../../../workbench/creation/WorkbenchEditor'
import { useWorkbenchStore } from '../../../workbench/workbenchStore'
import { createProjectSessionTestHarness } from '../../../workbench/project/projectSessionTestHarness'
import { holdDesignLabReady } from '../labReadyHold'
import { useLabLocale } from '../hostConfig/useLabLocale'

/**
 * 「选中文字 → AI 编辑 → 就地出结果」的实验室舞台。
 *
 * 舞台里的编辑器、选区浮条、AI 编辑条、文档里的新旧对比和 ✓ ✕ 都是**生产组件本体**
 * （`WorkbenchEditor`）；只有模型那一头是假的（假桌面桥：`getTextBrain` / 流式文本任务 / 技能清单都走生产代码，
 * 桥那端按剧本回话）。每一格的画面是**点真按钮、敲真输入框**走到的，不是往 store 里灌状态。
 */
export type RewriteScene = 'selected' | 'menu' | 'running' | 'result' | 'accepted' | 'discarded' | 'failed' | 'live'

type Fixture = {
  heading: string
  before: string
  target: string
  after: string
  requirement: string
  rewritten: string
  failure: string
  skillTitle: string
}

const FIXTURES: Record<'zh-CN' | 'en', Fixture> = {
  'zh-CN': {
    heading: '第 3 场 · 林薇家 · 夜',
    before: '△ 林薇回到家，没开大灯。台灯下，她撬开怀表后盖，抽出一张折成四折的纸条。',
    target: '她盯着纸条看了很久，才慢慢展开。',
    after: '△ 纸上的字被潮气洇开，只认得出一个“沉”字。',
    requirement: '更短一点，保留原意',
    rewritten: '慢慢展开纸条。',
    failure: '模型服务没有响应（HTTP 503）',
    skillTitle: '编剧 · Kasdan',
  },
  en: {
    heading: 'Scene 3 · Lin Wei’s home · Night',
    before: '△ Lin Wei gets home without turning on the main light. Under the desk lamp she pries open the pocket watch and slides out a note folded in four.',
    target: 'She stared at the note for a long time before slowly unfolding it.',
    after: '△ The ink has bled in the damp; only a single character is still legible.',
    requirement: 'Shorter, keep the meaning',
    rewritten: 'She slowly unfolded the note.',
    failure: 'The model service did not respond (HTTP 503)',
    skillTitle: 'Screenwriter · Kasdan',
  },
}

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

type FakeModel = { mode: 'reply' | 'hold' | 'fail'; reply: string; failure: string }

/** 假桌面桥：只补这一格要走的几条通道；生产代码照常调用它们。 */
function installFakeDesktop(model: FakeModel, skillTitle: string): () => void {
  const listeners = new Map<string, (event: unknown) => void>()
  const skill = {
    directoryName: 'kasdan',
    name: 'kasdan',
    label: skillTitle,
    description: null,
    author: null,
    body: '---\nname: kasdan\n---\n多用动作、少用形容词。',
    stageLabels: [],
    isPlaybook: false,
    neededProviders: ['text'],
    manifestError: null,
    origin: 'user',
    packageVersion: '1',
    contentHash: 'lab',
  }
  const desktop = {
    promptLibrary: { textBrain: async () => ({ ok: true, brain: { vendor: 'lab-vendor', modelKey: 'lab-model' } }) },
    skill: { list: async () => [skill] },
    tasks: {
      onTextEvent: (streamId: string, listener: (event: unknown) => void) => {
        listeners.set(streamId, listener)
        return () => { listeners.delete(streamId) }
      },
      cancelTextStream: async () => ({ ok: true }),
      runTextStream: async (payload: { streamId: string }) => {
        const emit = (event: unknown) => listeners.get(payload.streamId)?.(event)
        if (model.mode === 'reply') {
          window.setTimeout(() => {
            emit({ type: 'delta', delta: model.reply })
            emit({ type: 'done', result: { id: 'lab', status: 'succeeded' } })
          }, 30)
        } else if (model.mode === 'fail') {
          window.setTimeout(() => emit({ type: 'error', message: model.failure }), 30)
        }
        return { streamId: payload.streamId }
      },
    },
  }
  const holder = window as unknown as { nomiDesktop?: unknown }
  holder.nomiDesktop = desktop
  return () => { delete holder.nomiDesktop }
}

const frame = (): Promise<void> =>
  new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())))

async function until<T>(read: () => T | null | undefined | false, what: string): Promise<T> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const value = read()
    if (value) return value
    await frame()
  }
  throw new Error(`实验室舞台等不到：${what}`)
}

function setInputValue(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function pressEnter(input: HTMLInputElement): void {
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
}

export function CreationAiRewriteStage({ scene, locale }: { scene: RewriteScene; locale: 'zh-CN' | 'en' }): JSX.Element {
  const ready = useLabLocale(locale, `creation-ai-rewrite:${scene}`)
  const fixture = FIXTURES[locale]
  const seeded = React.useRef(false)
  if (!seeded.current) {
    seeded.current = true
    const current = useWorkbenchStore.getState()
    const first = current.workbenchDocuments[0]
    useWorkbenchStore.setState({
      workbenchDocuments: [{
        ...first,
        id: 'rewrite-draft',
        title: fixture.heading,
        updatedAt: 0,
        contentJson: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: fixture.heading }] },
            paragraph(fixture.before),
            paragraph(fixture.target),
            paragraph(fixture.after),
          ],
        },
      }],
      activeDocumentId: 'rewrite-draft',
      activeStoryboardId: null,
      storyboardDesignsByDocumentId: {},
      creationAiModeId: 'general',
    })
  }

  React.useEffect(() => {
    if (!ready) return undefined
    const release = holdDesignLabReady(`creation-ai-rewrite:${scene}`)
    const model: FakeModel = {
      mode: scene === 'running' ? 'hold' : scene === 'failed' ? 'fail' : 'reply',
      reply: fixture.rewritten,
      failure: fixture.failure,
    }
    const uninstall = installFakeDesktop(model, fixture.skillTitle)
    const harness = createProjectSessionTestHarness()
    const click = async (find: () => Element | null | undefined, what: string): Promise<void> => {
      const target = await until(find, what)
      ;(target as HTMLElement).click()
      await frame()
    }
    const drive = async (): Promise<void> => {
      await harness.open('lab-project')
      if (scene === 'live') return
      const content = await until(() => document.querySelector('.workbench-editor__content') as (HTMLElement & { editor?: Editor }) | null, '编辑器')
      const editor = await until(() => content.editor, 'editor 实例')
      let from = 0
      let to = 0
      editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.text === fixture.target) {
          from = pos
          to = pos + node.nodeSize
        }
      })
      editor.commands.setTextSelection({ from, to })
      await until(() => document.querySelector('.workbench-selection-popover'), '选区浮条')
      if (scene === 'selected') return
      await click(() => document.querySelector('.workbench-selection-popover__tool--ai'), 'AI 编辑按钮')
      await until(() => document.querySelector('.workbench-ai-rewrite-bar'), 'AI 编辑条')
      if (scene === 'menu') return
      const input = await until(() => document.querySelector<HTMLInputElement>('.workbench-ai-rewrite-bar input'), '输入框')
      setInputValue(input, fixture.requirement)
      await frame()
      pressEnter(input)
      if (scene === 'running') {
        await until(() => document.querySelector('[data-rewrite-status="running"]'), '进行中')
        return
      }
      if (scene === 'failed') {
        await until(() => document.querySelector('[data-rewrite-status="failed"]'), '失败态')
        return
      }
      await until(() => document.querySelector('[data-rewrite-status="result"]'), '结果态')
      await frame()
      if (scene === 'result') return
      await click(() => document.querySelector(scene === 'accepted' ? '[data-rewrite-action="accept"]' : '[data-rewrite-action="discard"]'), '✓ / ✕')
      await until(() => !document.querySelector('.workbench-ai-rewrite-bar'), '会话关闭')
    }
    drive()
      .catch((error: unknown) => { console.error(error) })
      .finally(release)
    return () => {
      release()
      uninstall()
      harness.dispose()
    }
  }, [ready, scene, fixture])

  return (
    <div data-creation-ai-rewrite={scene} style={{ width: 760, height: 460, position: 'relative' }}>
      <WorkbenchEditor />
    </div>
  )
}
