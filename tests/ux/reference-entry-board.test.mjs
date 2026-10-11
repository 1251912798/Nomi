import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkBoardManifest, checkSourceHash, loadAssertionCorpus } from '../../scripts/check-board-parity.mjs'
import { hashBoardSource } from '../../scripts/board-source-hash.mjs'

const root=path.resolve(import.meta.dirname,'../..')
const dir=path.join(root,'docs/design/boards/2026-10-12')
const board='ReferenceEntry'
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'))

describe('reference-entry production snapshot',()=>{
  it('accounts for every visible candidate with actual walk assertions',()=>{
    const manifest=read(`${board}.board.json`)
    const doc=read(`${board}.candidates.json`)
    expect(doc.candidates.length).toBeGreaterThan(0)
    expect(checkBoardManifest({board,manifest,candidates:doc.candidates,assertionCorpus:loadAssertionCorpus(root)})).toEqual([])
    expect(checkSourceHash({board,candidatesDoc:doc,currentHash:hashBoardSource(dir,board)})).toEqual([])
  })
})
