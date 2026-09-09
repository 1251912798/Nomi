import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('local editing feedback ownership', () => {
  for (const file of ['WhiteboardModal.tsx', 'WhiteboardDrawingTool.tsx', '../scene3d/scene3dEnvironmentPanel.tsx']) {
    it(`${file} keeps failures in the real editor, without global toast`, () => {
      const source = read(file)
      expect(source).not.toMatch(/import .*\btoast\b.*from/)
      expect(source).toContain("level: 'inline'")
      expect(source).toContain('role="status"')
      expect(source).toContain('setFeedback(null)')
    })
  }
  it('panorama ratio warning already lives with its preview', () => {
    const source = read('../scene3d/scene3dEnvironmentPanel.tsx')
    expect(source).toContain("t('scene3d.environment.nonStandardHint'")
    expect(source).not.toContain("t('scene3d.environment.nonStandardImported'")
  })
})
