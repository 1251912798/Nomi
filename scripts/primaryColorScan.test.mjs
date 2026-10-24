import { describe, expect, it } from 'vitest'

import { countAccentWhitePrimaries, countTextWhiteInSource } from './lib/primaryColorScan.mjs'

describe('primary color scan', () => {
  it('counts text-white in production source and ignores comments', () => {
    expect(countTextWhiteInSource('className="text-white"\n// text-white\n/* text-white */\ntext-white')).toBe(2)
  })

  it('catches an accent background paired with white text', () => {
    expect(countAccentWhitePrimaries('className="bg-nomi-accent text-white"')).toBe(1)
    expect(countAccentWhitePrimaries('className="bg-nomi-ink text-nomi-paper hover:bg-nomi-accent"')).toBe(0)
    expect(countAccentWhitePrimaries('// bg-nomi-accent text-white')).toBe(0)
  })
})
