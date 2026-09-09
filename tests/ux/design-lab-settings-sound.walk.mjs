import { walkDesignLabScreen } from './design-lab/walkScreen.mjs'
const expected = { 'sound-01-on': 'on', 'sound-02-off': 'off', 'sound-03-custom': 'custom', 'sound-04-playing': 'playing' }
await walkDesignLabScreen({ screen: 'settings-sound', title: '提醒与声音', role: 'walk-settings-sound', cellWidth: 564, columns: 2,
  assertState: async (page, state, record) => {
    const actual = await page.locator('[data-settings-section="attention-sound"]').getAttribute('data-sound-state')
    if (actual !== expected[state.id]) record(`${state.id}: expected ${expected[state.id]}, got ${actual}`)
  },
})
