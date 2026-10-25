// 悬停认领（聊天里的指向元素 → 画布上那个节点亮）：认领是一摞，不是一个槽（独立验收 V-d2-pointer 建议 B，S5 的反例）。
// 画布只亮最后到的那一条认领指着的节点；谁走了都只拿掉自己那一条，别人正指着的亮不能被它清掉。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXTERNAL_FLASH_MS, nodeExternalHighlightStoreLifetime, useNodeExternalHighlightStore } from './nodeExternalHighlightStore'

const store = () => useNodeExternalHighlightStore.getState()
const lit = (): string | null => store().hoverNodeId
const reset = () => useNodeExternalHighlightStore.setState(useNodeExternalHighlightStore.getInitialState(), true)

beforeEach(reset)
afterEach(reset)

describe('nodeExternalHighlightStore · claims', () => {
  it('one pointer: claim lights the node, release puts it out', () => {
    store().claimHover('n1', 'p1')
    expect(lit()).toBe('n1')
    store().releaseHover('p1')
    expect(lit()).toBeNull()
  })

  it.each([
    ['first in, first out', ['p1', 'p2']],
    ['last in, first out', ['p2', 'p1']],
  ] as const)('two pointers on the same node, %s: it stays lit until the last one leaves', (_name, order) => {
    store().claimHover('n1', 'p1')
    store().claimHover('n1', 'p2')
    store().releaseHover(order[0])
    expect(lit()).toBe('n1')
    store().releaseHover(order[1])
    expect(lit()).toBeNull()
  })

  it('pointers on different nodes: the latest claim lights its node, and the earlier one comes back when the latest leaves', () => {
    store().claimHover('n1', 'p1')
    store().claimHover('n2', 'p2')
    expect(lit()).toBe('n2')
    store().releaseHover('p2')
    expect(lit()).toBe('n1')
    store().releaseHover('p1')
    expect(lit()).toBeNull()
  })

  it('a leaving pointer in the middle of the stack changes nothing about what is lit', () => {
    store().claimHover('n1', 'p1')
    store().claimHover('n2', 'p2')
    store().claimHover('n3', 'p3')
    store().releaseHover('p2')
    expect(lit()).toBe('n3')
    store().releaseHover('p3')
    expect(lit()).toBe('n1')
  })

  it('claiming again from the same pointer moves its one claim; it never leaves a stale one behind', () => {
    store().claimHover('n1', 'p1')
    store().claimHover('n2', 'p1')
    expect(lit()).toBe('n2')
    expect(store().claims).toEqual([{ owner: 'p1', nodeId: 'n2' }])
    store().releaseHover('p1')
    expect(lit()).toBeNull()
  })

  it('releasing a pointer that holds nothing, or claiming what is already lit by you, returns the very same state', () => {
    store().claimHover('n1', 'p1')
    const before = store()
    store().releaseHover('nobody')
    expect(store()).toBe(before)
    store().claimHover('n1', 'p1')
    expect(store()).toBe(before)
  })

  it('leaving the project clears every claim', () => {
    store().claimHover('n1', 'p1')
    store().claimHover('n2', 'p2')
    nodeExternalHighlightStoreLifetime.releaseProject?.()
    expect(lit()).toBeNull()
    expect(store().claims).toEqual([])
  })
})

// SpendCardQ1 板 card.done：卡自己关掉那一刻，交出去的那几镜一起闪一下——自己会灭，再来一批就换成新的一批。
describe('nodeExternalHighlightStore · flash', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('flashes a batch together and puts it out after the shared flash duration', () => {
    store().flashNodes(['n1', 'n2', 'n1'])
    expect(store().flashNodeIds).toEqual(['n1', 'n2'])
    vi.advanceTimersByTime(EXTERNAL_FLASH_MS - 1)
    expect(store().flashNodeIds).toEqual(['n1', 'n2'])
    vi.advanceTimersByTime(1)
    expect(store().flashNodeIds).toEqual([])
  })

  it('a new batch replaces the old one and restarts the clock; hover claims are untouched', () => {
    store().claimHover('n9', 'p1')
    store().flashNodes(['n1'])
    vi.advanceTimersByTime(EXTERNAL_FLASH_MS - 10)
    store().flashNodes(['n2'])
    vi.advanceTimersByTime(20)
    expect(store().flashNodeIds).toEqual(['n2'])
    expect(lit()).toBe('n9')
    vi.advanceTimersByTime(EXTERNAL_FLASH_MS)
    expect(store().flashNodeIds).toEqual([])
  })

  it('leaving the project puts the flash out at once', () => {
    store().flashNodes(['n1'])
    nodeExternalHighlightStoreLifetime.releaseProject?.()
    expect(store().flashNodeIds).toEqual([])
    vi.advanceTimersByTime(EXTERNAL_FLASH_MS)
    expect(store().flashNodeIds).toEqual([])
  })
})
