import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mutate } from 'swr'

// 项目列表读面的特征测试（P-library，2026-10-21）：钉住「增删发布后列表缓存怎么变」。
// 只经桌面桥的列表读口取数，不钉它是同步还是异步（fake 桥两种都给，实现换口后同样要过）。
import { createLocalProject, deleteLocalProject } from './localProjectStore'

const LOCAL_PROJECTS_SWR_KEY = 'nomi:local-projects:v1'

type Summary = { id: string; name: string; createdAt: number; updatedAt: number; revision: number; savedAt: number }
const summary = (id: string, updatedAt: number): Summary => ({ id, name: id, createdAt: 1, updatedAt, revision: 1, savedAt: updatedAt })

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => { data.delete(key) },
    setItem: (key: string, value: string) => { data.set(key, value) },
  }
}

// deleted：主进程删除口回什么（delete-files 真把文件夹移进回收站才是 true；只摘登记、没有东西进回收站是 false）。
function installBridge(initial: Summary[], options: { deleted?: boolean } = {}) {
  const rows = [...initial]
  const bridge = {
    projects: {
      list: vi.fn(() => rows.map((row) => ({ ...row }))),
      listAsync: vi.fn(async () => rows.map((row) => ({ ...row }))),
      create: vi.fn((record: Summary) => { rows.unshift({ ...record }); return record }),
      delete: vi.fn((id: string) => { rows.splice(rows.findIndex((row) => row.id === id), 1); return { id, deleted: options.deleted ?? true } }),
    },
  }
  vi.stubGlobal('window', { nomiDesktop: bridge, localStorage: memoryStorage(), dispatchEvent: () => true, addEventListener: () => undefined, removeEventListener: () => undefined })
  return bridge
}

const cached = async (): Promise<Summary[] | undefined> => mutate<Summary[]>(LOCAL_PROJECTS_SWR_KEY, (current) => current, { revalidate: false })

describe('项目列表缓存：增删发布', () => {
  beforeEach(async () => { await mutate(LOCAL_PROJECTS_SWR_KEY, undefined, { revalidate: false }) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('缓存是冷的时候新建：先从桥读一次现有列表，再把新项目排到最前', async () => {
    const bridge = installBridge([summary('old', 10)])
    const record = createLocalProject('新的')
    // 冷缓存时发布是异步的（先读一遍现有列表）；先让它落定再读，读本身是一次 mutate，会顶掉还没落定的那次。
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect((await cached())?.map((item) => item.id)).toEqual([record.id, 'old'])
    expect(bridge.projects.create).toHaveBeenCalledTimes(1)
  })

  it('删除后列表缓存立刻摘掉这个项目，别的项目原样', async () => {
    installBridge([summary('a', 20), summary('b', 10)])
    await mutate(LOCAL_PROJECTS_SWR_KEY, [summary('a', 20), summary('b', 10)], { revalidate: false })
    await deleteLocalProject('a', 'delete-files')
    expect((await cached())?.map((item) => item.id)).toEqual(['b'])
  })

  // V-library-trash 建议 2：删除口曾把主进程返回的 {deleted} 丢掉，调用方没法区分「真进了回收站」和「只摘了登记」，
  // 于是按「用户点了删除」弹成功提示。结果必须原样带回来。
  it.each([true, false])('删除把主进程说的 deleted 带回给调用方（deleted=%s）：界面据此决定提示说什么，列表缓存照样摘掉', async (deleted) => {
    const bridge = installBridge([summary('a', 20), summary('b', 10)], { deleted })
    await mutate(LOCAL_PROJECTS_SWR_KEY, [summary('a', 20), summary('b', 10)], { revalidate: false })
    const result = await deleteLocalProject('a', 'delete-files')
    expect(bridge.projects.delete).toHaveBeenCalledWith('a', 'delete-files')
    expect(result).toEqual({ id: 'a', deleted })
    expect((await cached())?.map((item) => item.id)).toEqual(['b'])
  })

  it('缓存是热的时候紧挨着发布两次：两条都在（同步改，不被 SWR 的「只认最后一次修改」吞掉）', async () => {
    installBridge([summary('old', 10)])
    await mutate(LOCAL_PROJECTS_SWR_KEY, [summary('old', 10)], { revalidate: false })
    const first = createLocalProject('甲')
    const second = createLocalProject('乙')
    expect(new Set((await cached())?.map((item) => item.id))).toEqual(new Set([first.id, second.id, 'old']))
  })
})
