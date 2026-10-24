import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseBoardArgs } from './board-extract.mjs'

describe('board-extract 通用板目录参数', () => {
  it('接受任意日期目录的拼页板', () => {
    assert.deepEqual(parseBoardArgs(['--dir', 'docs/design/boards/2026-10-18', '--board', 'IconsF1', '--check']), {
      dir: 'docs/design/boards/2026-10-18', board: 'IconsF1', check: true,
    })
  })

  it('没有 --dir 时保留默认板目录', () => {
    assert.deepEqual(parseBoardArgs(['--board', 'ComposerB3']), { dir: null, board: 'ComposerB3', check: false })
  })

  it('--dir 不带 --board 直接报错，避免误抽整套默认板', () => {
    assert.throws(() => parseBoardArgs(['--dir', 'docs/design/boards/2026-10-18']), /必须和 --board 一起使用/)
  })
})
