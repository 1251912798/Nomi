import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDesktopBridge } from '../../desktop/bridge'
import { setAssistantModelPref } from '../ai/assistantModelPref'
import { deleteUserPromptWithSnapshot, getTextBrain, fetchPromptLibrary, fetchUserPrompts, filterPrompts, matchesPromptQuery, restoreUserPrompt, type LibraryPrompt } from './promptLibraryApi'

vi.mock('../../desktop/bridge', () => ({ getDesktopBridge: vi.fn() }))

const mockedBridge = vi.mocked(getDesktopBridge)

function mountBridge() {
  const list = vi.fn()
  const userList = vi.fn()
  mockedBridge.mockReturnValue({ promptLibrary: { list, userList } } as never)
  return { list, userList }
}

describe('promptLibraryApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('asks the text brain with the model the Agent panel picked, so 「跟随 Agent」 follows it', async () => {
    const textBrain = vi.fn().mockResolvedValue({ ok: true, brain: { vendor: 'b', modelKey: 'chat-b' }, status: 'ok' })
    mockedBridge.mockReturnValue({ promptLibrary: { textBrain } } as never)
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) })
    vi.stubGlobal('window', { dispatchEvent: () => true })
    setAssistantModelPref({ vendorKey: 'b', modelKey: 'chat-b' })
    await expect(getTextBrain()).resolves.toEqual({ vendor: 'b', modelKey: 'chat-b' })
    expect(textBrain).toHaveBeenLastCalledWith({ vendorKey: 'b', modelKey: 'chat-b' })
    setAssistantModelPref(null)
    await getTextBrain()
    expect(textBrain).toHaveBeenLastCalledWith(undefined)
    vi.unstubAllGlobals()
  })

  it('strict: throws a settings-pointing error when the chosen model is unavailable; non-strict falls back', async () => {
    const textBrain = vi.fn().mockResolvedValue({ ok: false, brain: null, status: 'missing', preferredUnavailable: true })
    mockedBridge.mockReturnValue({ promptLibrary: { textBrain } } as never)
    const store = new Map<string, string>([['nomi.assistantModel', JSON.stringify({ vendorKey: 'b', modelKey: 'gone' })]])
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null })
    await expect(getTextBrain({ strict: true })).rejects.toThrow(/no usable text model.*Settings → Models/i)
    expect(textBrain).toHaveBeenLastCalledWith({ vendorKey: 'b', modelKey: 'gone', strict: true })
    textBrain.mockResolvedValue({ ok: true, brain: { vendor: 'a', modelKey: 'chat' }, status: 'ok' })
    await expect(getTextBrain()).resolves.toEqual({ vendor: 'a', modelKey: 'chat' })
    expect(textBrain).toHaveBeenLastCalledWith({ vendorKey: 'b', modelKey: 'gone' })
    vi.unstubAllGlobals()
  })

  it('maps valid public and user rows while dropping malformed payloads', async () => {
    const { list, userList } = mountBridge()
    list.mockResolvedValue({
      ok: true,
      prompts: [
        { id: 'public-1', prompt: 'keep the subject identity', title: 'Identity', mediaType: 'video', promptType: 'video', source: 'Nomi', tags: ['identity'] },
        { id: 'missing-prompt', prompt: '' },
        null,
      ],
    })
    userList.mockResolvedValue({
      ok: true,
      prompts: [{ id: 'mine-1', prompt: 'my prompt', origin: 'user', promptType: 'image' }],
    })

    await expect(fetchPromptLibrary()).resolves.toEqual([
      expect.objectContaining({ id: 'public-1', prompt: 'keep the subject identity', promptType: 'video', origin: 'public' }),
    ])
    await expect(fetchUserPrompts()).resolves.toEqual([
      expect.objectContaining({ id: 'mine-1', prompt: 'my prompt', promptType: 'image', origin: 'user' }),
    ])
  })

  it('rejects failed or malformed reads instead of disguising failure as an empty library', async () => {
    const { list, userList } = mountBridge()
    list.mockResolvedValueOnce({ ok: false, prompts: [], error: 'offline' }).mockResolvedValueOnce({ ok: true })
    userList.mockResolvedValue({ ok: false, prompts: [], error: 'offline' })

    await expect(fetchPromptLibrary()).rejects.toThrow('offline')
    await expect(fetchPromptLibrary()).rejects.toThrow()
    await expect(fetchUserPrompts()).rejects.toThrow('offline')
  })

  it('keeps the complete delete snapshot across the renderer mapping and restores it through the same bridge', async () => {
    const deleted = {
      id: 'mine-1',
      prompt: 'full prompt',
      origin: 'user',
      title: 'Full',
      promptType: 'image',
      mediaType: 'image',
      mediaUrl: 'nomi-local://asset/p/ref.png',
      tags: ['tag'],
      referenceImages: [{ url: 'nomi-local://asset/p/ref.png', title: 'Ref' }],
      updatedAt: '2026-01-01T00:00:00.000Z',
      futureField: { keep: true },
    }
    const userDelete = vi.fn().mockResolvedValue({ ok: true, prompts: [], deleted })
    const userRestore = vi.fn().mockResolvedValue({ ok: true, prompts: [deleted] })
    mockedBridge.mockReturnValue({ promptLibrary: { userDelete, userRestore } } as never)

    const result = await deleteUserPromptWithSnapshot('mine-1')
    expect(result.items).toEqual([])
    expect(result.deleted).toMatchObject({ id: 'mine-1', tags: ['tag'], referenceImages: deleted.referenceImages, futureField: { keep: true } })
    await expect(restoreUserPrompt(result.deleted!)).resolves.toMatchObject([{ id: 'mine-1', futureField: { keep: true } }])
    expect(userRestore).toHaveBeenCalledWith(expect.objectContaining({ id: 'mine-1', futureField: { keep: true } }))
  })

  it('filters by prompt type and searchable title/body/source without another data owner', () => {
    const prompts: LibraryPrompt[] = [
      { id: 'image', title: 'Portrait', prompt: 'soft light', source: 'Nomi', promptType: 'image', mediaType: 'image', tags: [], mediaUrl: '', sourceId: '', sourceUrl: '', origin: 'public' },
      { id: 'video', title: 'Night alley', prompt: 'slow dolly', source: 'Sora', promptType: 'video', mediaType: 'video', tags: [], mediaUrl: '', sourceId: '', sourceUrl: '', origin: 'public' },
    ]

    expect(filterPrompts(prompts, 'video', 'alley').map((prompt) => prompt.id)).toEqual(['video'])
    expect(filterPrompts(prompts, 'all', 'sora').map((prompt) => prompt.id)).toEqual(['video'])
    expect(filterPrompts(prompts, 'image', 'dolly')).toEqual([])
  })
})

const prompt = (overrides: Partial<LibraryPrompt>): LibraryPrompt => ({
  id: 'p',
  title: 'Untitled',
  prompt: 'A cinematic shot',
  mediaUrl: '',
  mediaType: 'image',
  promptType: 'image',
  tags: [],
  source: 'Nomi',
  sourceId: 'nomi',
  sourceUrl: '',
  origin: 'public',
  ...overrides,
})
describe('filterPrompts', () => {
  it('uses existing tags as searchable fields without changing type filtering', () => {
    const items = [
      prompt({ id: 'portrait', title: 'Portrait', tags: ['character', 'close-up'] }),
      prompt({ id: 'motion', title: 'Motion', promptType: 'video', mediaType: 'video', tags: ['camera'] }),
    ]
    expect(filterPrompts(items, 'all', 'close-up').map((item) => item.id)).toEqual(['portrait'])
    expect(filterPrompts(items, 'image', 'camera')).toEqual([])
    expect(filterPrompts(items, 'video', 'camera').map((item) => item.id)).toEqual(['motion'])
  })

  // 来源标签那一长排（P-03）并进了提示词库的分类列：来源不再单独筛，但搜来源名仍能搜到。
  it('still finds prompts by their source name through the shared query matcher', () => {
    const items = [
      prompt({ id: 'a', source: 'GPT Image 2' }),
      prompt({ id: 'b', source: 'Sora 2', promptType: 'video', mediaType: 'video' }),
    ]
    expect(items.filter((item) => matchesPromptQuery(item, 'sora')).map((item) => item.id)).toEqual(['b'])
    expect(filterPrompts(items, 'all', '').map((item) => item.id)).toEqual(['a', 'b'])
    expect(filterPrompts(items, 'image', 'sora')).toEqual([])
  })
})
