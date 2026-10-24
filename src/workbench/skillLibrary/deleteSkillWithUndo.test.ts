import { describe, expect, it, vi } from 'vitest'
import { deleteSkillWithUndo } from './deleteSkillWithUndo'

function input(overrides: Partial<Parameters<typeof deleteSkillWithUndo>[0]> = {}) {
  return {
    directoryName: 'my-skill',
    label: 'My skill',
    exportPackage: vi.fn().mockResolvedValue({ dirName: 'my-skill', files: [{ path: 'SKILL.md', content: '# skill' }] }),
    remove: vi.fn().mockReturnValue({ ok: true }),
    importPackage: vi.fn().mockReturnValue({ ok: true }),
    report: vi.fn(),
    showUndoToast: vi.fn(),
    backupFailedMessage: 'backup failed localized',
    deleteFailedMessage: 'Delete failed',
    deletedMessage: 'Deleted · My skill',
    ...overrides,
  }
}

describe('deleteSkillWithUndo', () => {
  it.each([
    ['empty export', vi.fn().mockResolvedValue(null)],
    ['export failure', vi.fn().mockRejectedValue(new Error('export failed'))],
  ])('does not delete or show undo when the pre-delete backup is unavailable (%s)', async (_label, exportPackage) => {
    const deps = input({ exportPackage })
    await deleteSkillWithUndo(deps)
    expect(deps.remove).not.toHaveBeenCalled()
    expect(deps.showUndoToast).not.toHaveBeenCalled()
    expect(deps.report).toHaveBeenCalledWith('my-skill', deps.backupFailedMessage)
  })

  it('deletes only after a snapshot exists and gives undo the same snapshot', async () => {
    const snapshot = { dirName: 'my-skill', files: [{ path: 'SKILL.md', content: '# skill' }] }
    const deps = input({ exportPackage: vi.fn().mockResolvedValue(snapshot) })
    await deleteSkillWithUndo(deps)
    expect(deps.remove).toHaveBeenCalledWith('my-skill')
    expect(deps.showUndoToast).toHaveBeenCalledWith(expect.objectContaining({ message: deps.deletedMessage }))
    const toast = vi.mocked(deps.showUndoToast).mock.calls[0]?.[0]
    toast?.onUndo()
    expect(deps.importPackage).toHaveBeenCalledWith(snapshot)
  })
})
