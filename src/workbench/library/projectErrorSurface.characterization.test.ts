import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { openWorkspaceProjectFromPicker } from './openWorkspaceFlow'
import type { DesktopBridge } from '../../desktop/bridge'

/**
 * 特征测试（characterization）：钉住「项目库四个报错入口把主进程原文直接送进界面」这个**现状**。
 * 这不是想要的行为——类根因复盘（docs/engineering/direction-checks/2026-10-10-library-actions-and-errors.md）
 * 拍板后的实现会让这里的断言翻转（原文只进日志，界面只给一句人话）。翻转时请改断言方向，不要删测试。
 */
const RAW = '[safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] {"count":80}'

const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (file: string): string => stripComments(readFileSync(resolve(process.cwd(), file), 'utf8'))

function bridgeWith(openFolder: () => Promise<unknown>): DesktopBridge {
  return {
    platform: 'win32',
    workspace: { selectFolder: vi.fn(async () => ({ canceled: false, rootPath: '/tmp/x' })), openFolder },
  } as unknown as DesktopBridge
}

describe('特征测试（修完会翻转）：项目库报错入口现状——主进程原文直达界面', () => {
  it('入口 1 选文件夹打开失败：showMessage 收到的就是主进程原文', async () => {
    const showMessage = vi.fn()
    await openWorkspaceProjectFromPicker({
      bridge: bridgeWith(async () => { throw new Error(RAW) }),
      confirmInitialize: vi.fn(),
      showMessage,
    })
    expect(showMessage).toHaveBeenCalledWith(RAW, 'error')
  })

  it('入口 2 确认初始化后再失败：同样把原文送进 showMessage', async () => {
    const showMessage = vi.fn()
    const openFolder = vi.fn()
      .mockRejectedValueOnce(new Error('Workspace folder is not initialized'))
      .mockRejectedValueOnce(new Error(RAW))
    await openWorkspaceProjectFromPicker({
      bridge: bridgeWith(openFolder),
      confirmInitialize: vi.fn(async () => true),
      showMessage,
    })
    expect(showMessage).toHaveBeenCalledWith(RAW, 'error')
  })

  it('入口 3 删除项目（NomiStudioApp 无可注入 harness，钉源码形状）：catch 里 error.message 优先于本地化兜底', () => {
    const source = read('src/workbench/NomiStudioApp.tsx')
    const catchBlock = source.slice(source.indexOf("logRendererError('project-delete-failed'") - 260, source.indexOf("logRendererError('project-delete-failed'") + 120)
    expect(catchBlock).toMatch(/error instanceof Error && error\.message \? error\.message : t\('studio\.projectDeleteFailed'\)/)
    expect(catchBlock).toMatch(/report\(project\.id, message\)/)
  })

  it('入口 4 打开项目文件夹（同上）：revealProjectFolder 失败同一句式，原文进 report', () => {
    const source = read('src/workbench/NomiStudioApp.tsx')
    const start = source.indexOf('revealProjectFolder({ projectId })')
    const block = source.slice(start, start + 360)
    expect(block).toMatch(/error instanceof Error && error\.message \? error\.message : t\('studio\.openFolderFailed'\)/)
    expect(block).toMatch(/report\(projectId, message\)/)
  })

  it('附：项目库加载失败（ProjectLibraryPage）把 projectsError.message 原样渲染进「原因」行', () => {
    const source = read('src/workbench/library/ProjectLibraryPage.tsx')
    expect(source).toContain("t('library.loadFailedReason', { reason: projectsError.message })")
  })
})
