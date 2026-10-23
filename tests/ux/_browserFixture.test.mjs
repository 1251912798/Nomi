// useBrowserFixture 的结构合同（2026-10-24）：夹具不替测试起浏览器，起浏览器的信号留在测试文件里。
//
// 推送前的相关单测（scripts/pre-push-related-tests.mjs 的 startsBrowser）靠「测试文件自己 import playwright」认出起浏览器的
// 测试、只交给 CI——冷启动 vite + chromium 在推送前和 typecheck 并发会撞超时（2026-10-11）。夹具第一版自己 import playwright，
// 信号被它带走，10 个夹具测试被当快测试划进推送前（本机 gates 的 check:claude-hooks 两条必红）。所以：
//   · 浏览器类型由调用方传入，browserType 必填、缺了当场抛错；夹具源码里没有 playwright 的运行时 import；
//   · 普查：每个调用 useBrowserFixture( 的测试文件，startsBrowser 都必须认出它起浏览器——迁错一个就红。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { gitPaths } from '../../scripts/lib/gitPaths.mjs'
import { startsBrowser } from '../../scripts/pre-push-related-tests.mjs'
import { useBrowserFixture } from './_browserFixture.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (file) => fs.readFileSync(path.join(repoRoot, file), 'utf8')
const SELF = 'tests/ux/_browserFixture.test.mjs'

describe('useBrowserFixture：浏览器由调用方传入，起浏览器的信号留在测试文件里', () => {
  it('夹具自己不起浏览器：源码里没有 playwright 的运行时 import', () => {
    expect(startsBrowser(read('tests/ux/_browserFixture.mjs'))).toBe(false)
  })

  it('不传 browserType（或传的不是 playwright 的浏览器类型）当场抛错，并写明怎么改', () => {
    const entries = ['tests/ux/fixtures/text-document-generation-ownership.html']
    expect(() => useBrowserFixture({ entries })).toThrow(/browserType 必填.*import \{ chromium \} from 'playwright'.*browserType: chromium/)
    expect(() => useBrowserFixture({ entries, browserType: {} })).toThrow(/browserType 必填/)
  })

  it('普查：每个调用 useBrowserFixture 的测试文件，推送前的识别都认出它起浏览器', () => {
    const callers = gitPaths(['grep', '-l', 'useBrowserFixture(', '--', 'tests/*.test.*'], { cwd: repoRoot }).filter((file) => file !== SELF)
    expect(callers.length).toBeGreaterThanOrEqual(10)
    // 迁错一个就红：列出来的文件要么自己 import playwright，要么别经夹具起服
    expect(callers.filter((file) => !startsBrowser(read(file)))).toEqual([])
  })
})
