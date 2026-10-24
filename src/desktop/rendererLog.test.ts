// 渲染层日志 owner：错误怎么摊平、字段怎么收、桥坏了怎么办。
// 端到端（到盘上那一行、脱敏）在 electron/logging/rendererLog.test.ts；这里钉渲染层这一半自己的判据。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { logRendererError, summarizeComponentStack, summarizeRendererError } from './rendererLog'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('错误摊平（IPC 的结构化克隆会丢掉类名与自定义字段，必须在这一侧先摊平）', () => {
  it('保留类名、码与栈', () => {
    const error = Object.assign(new Error('busy'), { name: 'WorkspaceManifestLockBusyError', code: 'workspace_manifest_busy' })
    expect(summarizeRendererError(error)).toEqual({
      name: 'WorkspaceManifestLockBusyError',
      message: 'busy',
      code: 'workspace_manifest_busy',
      stack: error.stack,
    })
  })

  it('包装错误展开一层 cause：包一层再抛的写法里，真因常在 cause 上', () => {
    const cause = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    const wrapped = new Error('save failed', { cause })
    const summary = summarizeRendererError(wrapped)
    expect(summary.message).toBe('save failed | cause: Error: EACCES: permission denied')
    expect(summary.code).toBe('EACCES')
  })

  it('非 Error 也摊得平（字符串原因、带 message/code 的普通对象、别的值）', () => {
    expect(summarizeRendererError('host refused')).toEqual({ name: 'NonError', message: 'host refused' })
    expect(summarizeRendererError({ code: 'generation_not_started', message: 'not started' }))
      .toEqual({ name: 'NonError', message: 'not started', code: 'generation_not_started' })
    expect(summarizeRendererError({ ok: false })).toEqual({ name: 'NonError', message: '{"ok":false}' })
  })

  it('普通对象的 name 是数据（项目名、素材名、供应商名），不是类名：照记 NonError', () => {
    expect(summarizeRendererError({ name: 'MyFilm', message: 'not saved' })).toEqual({ name: 'NonError', message: 'not saved' })
  })

  it('超长文本在渲染层就截断（只为给 IPC 报文封顶，落盘时主进程还会再截）', () => {
    expect(summarizeRendererError(new Error('x'.repeat(10_000))).message).toHaveLength(4000)
  })
})

describe('经 ipcRenderer.invoke 回来的失败（Electron 只送回一句话，name 恒为 Error）', () => {
  // 形状照 Electron 43：主进程回 `error.toString()`，渲染层 `throw new Error(\`Error invoking remote method '${channel}': ${error}\`)`。
  const overInvoke = (channel: string, mainToString: string) => new Error(`Error invoking remote method '${channel}': ${mainToString}`)

  it('摊成主进程那个错误：类名与消息从那句话里读回来，栈首部跟着换（帧不动）', () => {
    const received = overInvoke('nomi:projects:save-async', 'WorkspaceManifestLockBusyError: Workspace manifest is owned on another host')
    const summary = summarizeRendererError(received)
    expect(summary).toMatchObject({ name: 'WorkspaceManifestLockBusyError', message: 'Workspace manifest is owned on another host' })
    const [header, ...frames] = String(summary.stack).split('\n')
    expect(header).toBe('WorkspaceManifestLockBusyError: Workspace manifest is owned on another host')
    expect(frames).toEqual(String(received.stack).split('\n').slice(1))
  })

  it('Node 内部错误的 toString 自带码（`RangeError [ERR_OUT_OF_RANGE]: …`）：类名和码都读回来', () => {
    const summary = summarizeRendererError(overInvoke('nomi:assets:read', 'RangeError [ERR_OUT_OF_RANGE]: The value of "size" is out of range.'))
    expect(summary).toMatchObject({ name: 'RangeError', code: 'ERR_OUT_OF_RANGE', message: 'The value of "size" is out of range.' })
  })

  it('主进程抛的不是 Error（一句字符串）：只去掉外壳，类名仍是渲染层这个 Error', () => {
    expect(summarizeRendererError(overInvoke('nomi:x', 'host refused'))).toMatchObject({ name: 'Error', message: 'host refused' })
  })

  it('包一层再抛、cause 是 invoke 回来的：cause 那段同样摊成主进程那个错误', () => {
    const cause = overInvoke('nomi:projects:save-async', 'WorkspaceManifestLockBusyError: busy')
    expect(summarizeRendererError(new Error('save failed', { cause })).message).toBe('save failed | cause: WorkspaceManifestLockBusyError: busy')
  })
})

describe('发送', () => {
  it('字段去 undefined、非有限数转字符串（NaN 本身就是要记的证据，不能让整条被主进程拒收）', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const report = vi.fn()
    vi.stubGlobal('window', { nomiDesktop: { log: { report } } })
    logRendererError('canvas-viewport-non-finite', undefined, { x: Number.NaN, y: 3, zoom: Number.POSITIVE_INFINITY, extra: undefined })
    expect(report).toHaveBeenCalledExactlyOnceWith({
      level: 'error',
      event: 'canvas-viewport-non-finite',
      fields: { x: 'NaN', y: 3, zoom: 'Infinity' },
    })
  })

  it('桥坏了（send 抛）不反过来让失败处理再抛一次；DevTools 照打', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('window', { nomiDesktop: { log: { report: () => { throw new Error('ipc down') } } } })
    const error = new Error('save failed')
    expect(() => logRendererError('project-save-failed', error)).not.toThrow()
    expect(consoleError).toHaveBeenCalledExactlyOnceWith('[nomi:project-save-failed]', error)
  })
})

describe('组件栈摘要', () => {
  it('只留组件名（两种 React 栈写法都认），最多 8 个', () => {
    expect(summarizeComponentStack('\n    at CanvasNode (http://x/a.tsx:1:1)\n    in Workspace (created by App)\n    at App'))
      .toBe('CanvasNode < Workspace < App')
    const deep = Array.from({ length: 12 }, (_, i) => `    at C${i} (x)`).join('\n')
    expect(summarizeComponentStack(deep)?.split(' < ')).toHaveLength(8)
    expect(summarizeComponentStack('')).toBeUndefined()
  })
})
