import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopAssetDto } from '../../desktop/bridge'

// 「所有项目的素材」那一份清单的重载：素材变了（写入 / 删文件都广播 assets.onUpdated）就作废，看清单的界面重载。
// 2026-10-24 真机走查：多选删两张 = 两次广播紧挨着到。第一次作废后界面起了一趟重载，第二次作废时这一趟还在路上——
// 旧实现里在路上的那一趟被作废后既不交结果、也不再起新的一趟，界面的「没载过就载」只在 fresh 从 true 变 false 时
// 触发一次，于是「全部素材」一直停在删除前的清单上（删掉的两张还在，一张显示加载失败）。
const disk = vi.hoisted(() => ({
  files: [] as string[],
  listeners: new Set<() => void>(),
  /** 置 true 时 assets.list 的应答先扣着（模拟主进程扫盘还没回来）；请求那一刻的盘面照实记下。 */
  hold: false,
  held: [] as Array<() => void>,
  scans: 0,
}))

function dto(relativePath: string): DesktopAssetDto {
  return {
    id: `p1:${relativePath}`,
    name: relativePath.split('/').pop() ?? relativePath,
    userId: 'local',
    projectId: 'p1',
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
    data: { relativePath, contentType: 'image/png', url: `nomi-local://asset/p1/${relativePath}` },
  }
}

vi.mock('../../desktop/bridge', () => ({
  getDesktopBridge: () => ({
    projects: { listAsync: async () => [{ id: 'p1', name: 'One' }] },
    assets: {
      list: () => {
        disk.scans += 1
        const snapshot = { items: disk.files.map(dto), cursor: null }
        if (!disk.hold) return Promise.resolve(snapshot)
        return new Promise((resolve) => { disk.held.push(() => resolve(snapshot)) })
      },
      onUpdated: (listener: () => void) => {
        disk.listeners.add(listener)
        return () => { disk.listeners.delete(listener) }
      },
    },
  }),
}))

import { loadAllProjectAssets, peekAllProjectAssets, resetAllProjectAssetsForTest } from './useAllProjectAssets'

/** 主进程删掉一个文件并广播 assets.onUpdated（workspace.delete-files 的形状）。 */
function trash(relativePath: string): void {
  disk.files = disk.files.filter((file) => file !== relativePath)
  for (const listener of [...disk.listeners]) listener()
}
const names = (): string[] | undefined => peekAllProjectAssets()?.map((asset) => asset.name).sort()

beforeEach(() => {
  resetAllProjectAssetsForTest()
  disk.files = ['assets/a.png', 'assets/b.png', 'assets/c.png']
  disk.listeners.clear()
  disk.hold = false
  disk.held = []
  disk.scans = 0
})

describe('所有项目的素材：作废时正在路上的那一趟重载', () => {
  it('连着两次作废（多选删两张）：没人再调载入，清单也会停在最新的盘面上，不停在删除前', async () => {
    await loadAllProjectAssets()
    expect(names()).toEqual(['a.png', 'b.png', 'c.png'])

    disk.hold = true
    trash('assets/a.png')
    // 看清单的界面（useAllProjectAssets）在 fresh 变 false 时起一趟重载——这是它唯一一次会起。
    void loadAllProjectAssets()
    // 这一趟已经到了主进程、扫到的是删 b 之前的盘面（b、c），应答还没回来。
    await vi.waitFor(() => expect(disk.held).toHaveLength(1))
    trash('assets/b.png')
    // 第二次作废时 fresh 已经是 false：界面不会再起第二趟。放行扣着的那一趟（它扫到的是删 b 之前的盘面）。
    disk.hold = false
    for (const release of disk.held.splice(0)) release()

    await vi.waitFor(() => expect(names()).toEqual(['c.png']))
  })

  it('等着拿清单的调用方：在路上那一趟被作废了，拿到的是最新的一份，不是作废前扫到的', async () => {
    await loadAllProjectAssets()
    disk.hold = true
    trash('assets/a.png')
    const pending = loadAllProjectAssets()
    await vi.waitFor(() => expect(disk.held).toHaveLength(1))
    trash('assets/b.png')
    disk.hold = false
    for (const release of disk.held.splice(0)) release()

    expect((await pending).map((asset) => asset.name)).toEqual(['c.png'])
  })

  it('没有新的作废：一趟重载照常交结果，只扫一次；同时来的几个调用方共用这一趟', async () => {
    await loadAllProjectAssets()
    trash('assets/a.png')
    const scansBefore = disk.scans
    const [first, second] = await Promise.all([loadAllProjectAssets(), loadAllProjectAssets()])
    expect(first.map((asset) => asset.name).sort()).toEqual(['b.png', 'c.png'])
    expect(second).toBe(first)
    expect(names()).toEqual(['b.png', 'c.png'])
    expect(disk.scans - scansBefore).toBe(1)
  })
})
