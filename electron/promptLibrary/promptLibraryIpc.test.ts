import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  assertTrustedSender: vi.fn(),
  restoreUserPrompt: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => fixture.handlers.set(channel, handler),
  },
}))
vi.mock('../ipcSenderGuard', () => ({ assertTrustedSender: fixture.assertTrustedSender }))
vi.mock('./promptLibraryStore', () => ({ getPromptLibrary: vi.fn() }))
vi.mock('./userPromptStore', () => ({
  addUserPrompt: vi.fn(),
  deleteUserPrompt: vi.fn(),
  listUserPrompts: vi.fn(() => []),
  restoreUserPrompt: fixture.restoreUserPrompt,
  updateUserPrompt: vi.fn(),
}))

import { registerPromptLibraryIpc } from './promptLibraryIpc'

beforeEach(() => {
  fixture.handlers.clear()
  fixture.assertTrustedSender.mockReset()
  fixture.restoreUserPrompt.mockReset()
})

describe('prompt library restore IPC', () => {
  it('registers an independent restore channel and keeps user-add free of restoreSnapshot', () => {
    registerPromptLibraryIpc()
    expect(fixture.handlers.has('nomi:prompt-library:user-restore')).toBe(true)
    expect(fixture.handlers.has('nomi:prompt-library:user-add')).toBe(true)
    const source = String(registerPromptLibraryIpc)
    expect(source).not.toContain('restoreSnapshot')
  })

  it('passes the complete snapshot, including unknown fields, through the trusted restore handler', async () => {
    const snapshot = {
      id: 'mine-1',
      title: 'Full',
      prompt: 'full prompt',
      mediaUrl: 'nomi-local://asset/p/ref.png',
      mediaType: 'image',
      promptType: 'image',
      tags: ['tag'],
      referenceImages: [{ url: 'nomi-local://asset/p/ref.png', title: 'Ref' }],
      source: '',
      sourceId: 'user',
      sourceUrl: '',
      origin: 'user',
      updatedAt: '2026-01-01T00:00:00.000Z',
      futureField: { keep: true },
    }
    fixture.restoreUserPrompt.mockReturnValue([snapshot])
    registerPromptLibraryIpc()
    const result = await fixture.handlers.get('nomi:prompt-library:user-restore')!({}, snapshot)
    expect(result).toEqual({ ok: true, prompts: [snapshot] })
    expect(fixture.assertTrustedSender).toHaveBeenCalled()
    expect(fixture.restoreUserPrompt).toHaveBeenCalledWith(snapshot)
  })
})
