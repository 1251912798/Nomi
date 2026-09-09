import { describe, expect, it } from 'vitest'
import { buildStoryboardPlanningMessage } from './storyboardLauncher'

describe('storyboard planner language', () => {
  it.each(['日落前的一分钟', 'One Minute Before Sunset'])('preserves the supplied title %s without forcing English', (title) => {
    const prompt = buildStoryboardPlanningMessage({ storyText: `# ${title}`, shotMode: 'video' })
    expect(prompt).toContain(`# ${title}`)
    expect(prompt).toContain('保持原文')
    expect(prompt).not.toContain('produce the entire storyboard plan in English')
  })
})
