export type SkillDeleteResult = { ok: boolean; error?: string }

export type SkillDeleteWithUndoInput = {
  directoryName: string
  label: string
  exportPackage: (directoryName: string) => Promise<unknown>
  remove: (directoryName: string) => SkillDeleteResult
  importPackage: (snapshot: unknown) => SkillDeleteResult
  report: (identity: string, message: string) => void
  showUndoToast: (input: { message: string; onUndo: () => void }) => void
  backupFailedMessage: string
  deleteFailedMessage: string
  deletedMessage: string
}

/**
 * 删除技能的共享安全边界：没有完整导出包，就没有删除动作，也没有撤销提示。
 * 撤销回调只接收已验证存在的快照，避免把「可撤销」显示成空操作。
 */
export async function deleteSkillWithUndo(input: SkillDeleteWithUndoInput): Promise<void> {
  let snapshot: unknown
  try {
    snapshot = await input.exportPackage(input.directoryName)
  } catch {
    input.report(input.directoryName, input.backupFailedMessage)
    return
  }
  if (!snapshot) {
    input.report(input.directoryName, input.backupFailedMessage)
    return
  }

  const result = input.remove(input.directoryName)
  if (!result.ok) {
    input.report(input.directoryName, result.error ?? input.deleteFailedMessage)
    return
  }

  input.showUndoToast({
    message: input.deletedMessage,
    onUndo: () => { input.importPackage(snapshot) },
  })
}
