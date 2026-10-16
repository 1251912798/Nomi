import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import AssetReference, { type AssetSlot } from './AssetReference'

vi.mock('react-i18next', async (original) => ({
  ...await original<typeof import('react-i18next')>(),
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('reference capacity rendering', () => {
  it.each([
    { max: undefined, occupied: 20, canAdd: true },
    { max: 3, occupied: 3, canAdd: false },
    { max: 3, occupied: 2, canAdd: true },
  ])('keeps unknown caps usable and respects occupied positions: $max / $occupied', ({ max, occupied, canAdd }) => {
    const slot: AssetSlot = {
      key: 'refs', label: 'References', accept: 'image', form: 'array',
      persistAsEdge: true, numbered: true, max,
    }
    const html = renderToStaticMarkup(React.createElement(AssetReference, {
      slots: [slot], valuesByKey: { refs: [] }, occupiedByKey: { refs: occupied },
      projectId: null, openSlotKey: '', uploadingSlotKey: '',
      onTogglePicker: vi.fn(), onPick: vi.fn(), onUpload: vi.fn(), onRemove: vi.fn(),
    }))
    expect(html.includes('data-asset-add-tile="true"')).toBe(canAdd)
  })
})

describe('existing slot add buttons remain the only library entrances', () => {
  const single=(key:string):AssetSlot=>({key,label:key,accept:'image',form:'single',persistAsEdge:true,numbered:false})
  const array:AssetSlot={...single('refs'),form:'array',max:3}
  it.each([
    {name:'empty image references',slots:[array],values:{refs:[]},adds:1},
    {name:'populated image references',slots:[array],values:{refs:['a.jpg']},adds:1},
    {name:'empty first and last frame',slots:[single('first'),single('last')],values:{},adds:2},
    {name:'first frame already filled',slots:[single('first'),single('last')],values:{first:'a.jpg'},adds:1},
    {name:'filled single source',slots:[single('source')],values:{source:'a.jpg'},adds:0},
  ])('$name has no duplicate header plus',({slots,values,adds})=>{
    const html=renderToStaticMarkup(React.createElement(AssetReference,{
      slots,valuesByKey:values as Record<string,string|string[]>,projectId:null,openSlotKey:'',uploadingSlotKey:'',
      onTogglePicker:vi.fn(),onPick:vi.fn(),onUpload:vi.fn(),onRemove:vi.fn(),onPickOnCanvas:vi.fn(),
    }))
    expect(html).toContain('data-reference-entry="true"')
    expect(html).not.toContain('data-reference-add=')
    expect(html.match(/data-asset-add-tile="true"/g)?.length??0).toBe(adds)
  })
})

describe('first-frame tag on the array slot', () => {
  const slot: AssetSlot = { key: 'refs', label: 'References', accept: 'image', form: 'array', persistAsEdge: false, numbered: false }
  const render = (firstFrameSlotKey?: string) => renderToStaticMarkup(React.createElement(AssetReference, {
    slots: [slot], valuesByKey: { refs: ['https://cdn/a.png', 'https://cdn/b.png'] },
    projectId: null, openSlotKey: '', uploadingSlotKey: '',
    onTogglePicker: vi.fn(), onPick: vi.fn(), onUpload: vi.fn(), onRemove: vi.fn(),
    ...(firstFrameSlotKey ? { firstFrameSlotKey } : {}),
  }))
  it('marks only the first tile of the named slot', () => {
    const html = render('refs')
    expect(html.match(/data-asset-tile-tag="firstFrame"/g)?.length).toBe(1)
    expect(html).toContain('generationCommon.parameters.firstFrame')
  })
  it('no tag when the slot is not named', () => {
    expect(render()).not.toContain('data-asset-tile-tag')
  })
})
