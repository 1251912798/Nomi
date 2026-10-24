import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  parseWranglerAuthToken,
  parseAccountIdFromWhoami,
  authTokenFromWrangler,
  whoamiAccountId,
} from './cloudflare.mjs'

// 占位测试向量，不是任何真实 Cloudflare 账号 id——只用来测「从 whoami 输出里挑一个
// 32 位十六进制串」这条解析逻辑，形状对了就够。只在这一处写字面量并打防误报标记，
// 其余测试都引用这个常量（模板插值），源码文本里就不会再出现第二处裸 32 位 hex，
// 门岗 `check:secrets` 的行级豁免棘轮也就不用为这一份夹具多开三个名额。
const FAKE_ACCOUNT_ID = '0123456789abcdef0123456789abcdef' // nomi-secret-scan:allow 占位测试向量，非真实账号 id，见上方注释
const PLATFORM_MATRIX = ['darwin', 'linux', 'win32']

test('平台矩阵覆盖 Wrangler 的 macOS / Linux / Windows 三平台', () => {
  assert.deepEqual(PLATFORM_MATRIX, ['darwin', 'linux', 'win32'])
})

test('parseWranglerAuthToken 只取官方 JSON 的 token 字段', () => {
  assert.equal(parseWranglerAuthToken('{"type":"oauth","token":"fixture-token-value"}'), 'fixture-token-value')
  assert.equal(parseWranglerAuthToken('{"type":"api_token","token":"fixture-api-token"}'), 'fixture-api-token')
})

test('parseWranglerAuthToken 对空、API key/email 和坏 JSON 返回空串', () => {
  assert.equal(parseWranglerAuthToken('{"type":"api_key","key":"fixture-key","email":"fixture@example.com"}'), '')
  assert.equal(parseWranglerAuthToken('not json'), '')
  assert.equal(parseWranglerAuthToken(''), '')
  assert.equal(parseWranglerAuthToken(undefined), '')
})

test('parseAccountIdFromWhoami 从表格输出里挑 32 位十六进制账号 id', () => {
  const output = [
    '⛅️ wrangler 4.0.0',
    '👋 You are logged in with an OAuth Token, associated with the email person@example.com.',
    '┌──────────────┬──────────────────────────────────┐',
    '│ Account Name │ Account ID                        │',
    '├──────────────┼──────────────────────────────────┤',
    `│ Example Team  │ ${FAKE_ACCOUNT_ID} │`,
    '└──────────────┴──────────────────────────────────┘',
  ].join('\n')
  assert.equal(parseAccountIdFromWhoami(output), FAKE_ACCOUNT_ID)
})

test('parseAccountIdFromWhoami 解不出来时返回空串（不猜、不抛）', () => {
  assert.equal(parseAccountIdFromWhoami('You are not authenticated'), '')
  assert.equal(parseAccountIdFromWhoami(''), '')
})

for (const platform of PLATFORM_MATRIX) {
  test(`authTokenFromWrangler 在 ${platform} 使用官方 auth token 命令，不读平台路径`, () => {
    const calls = []
    const token = authTokenFromWrangler({
      platform,
      execImpl: (cmd, args) => {
        calls.push([cmd, args])
        return '{"type":"oauth","token":"fixture-token"}'
      },
    })
    assert.equal(token, 'fixture-token')
    assert.deepEqual(calls, [['npx', ['wrangler', 'auth', 'token', '--json']]])
  })
}

test('authTokenFromWrangler 认证过期 / 未登录时提示 login，且不泄露 token', () => {
  const secret = 'fixture-expired-access-token'
  assert.throws(
    () => authTokenFromWrangler({ execImpl: () => { throw Object.assign(new Error(`stderr included ${secret}`), { status: 1 }) } }),
    (error) => {
      assert.match(error.message, /wrangler 登录已过期（或没登录）/)
      assert.match(error.message, /npx wrangler login/)
      assert.doesNotMatch(error.message, new RegExp(secret))
      assert.doesNotMatch(String(error.cause?.message || ''), new RegExp(secret))
      return true
    },
  )
})

test('authTokenFromWrangler 输出没有 bearer token 时按未登录失败，且不泄露 key/email', () => {
  const secret = 'fixture-api-key'
  assert.throws(
    () => authTokenFromWrangler({ execImpl: () => `{"type":"api_key","key":"${secret}","email":"fixture@example.com"}` }),
    (error) => {
      assert.match(error.message, /wrangler 登录已过期（或没登录）/)
      assert.doesNotMatch(error.message, new RegExp(secret))
      return true
    },
  )
})

test('authTokenFromWrangler 超时时明说 timeout 与下一步，不泄露底层输出', () => {
  assert.throws(
    () => authTokenFromWrangler({ execImpl: () => { throw Object.assign(new Error('secret-token timeout'), { code: 'ETIMEDOUT' }) } }),
    (error) => {
      assert.match(error.message, /auth token.*超时/)
      assert.match(error.message, /npx wrangler login/)
      assert.doesNotMatch(error.message, /secret-token/)
      assert.doesNotMatch(String(error.cause?.message || ''), /secret-token/)
      return true
    },
  )
})

test('whoamiAccountId 调用 `npx wrangler whoami` 并解析出账号 id', () => {
  const calls = []
  const accountId = whoamiAccountId({
    execImpl: (cmd, args) => {
      calls.push([cmd, args])
      return `│ Account ID │\n│ ${FAKE_ACCOUNT_ID} │\n`
    },
  })
  assert.deepEqual(calls, [['npx', ['wrangler', 'whoami']]])
  assert.equal(accountId, FAKE_ACCOUNT_ID)
})

// 2026-09-29 第一次真实运行实测：Windows 上 execFileSync('npx', …) 不带 shell:true 会
// ENOENT（npx 在 Windows 上是 .cmd 垫片）。错误面只锁住命令名和下一步，绝不回显底层 stderr。
test('whoamiAccountId 在 execImpl 启动失败时给出命令与登录下一步，不泄露底层输出', () => {
  assert.throws(
    () => whoamiAccountId({ execImpl: () => { throw new Error('spawnSync npx ENOENT secret-account-id') } }),
    (error) => {
      assert.match(error.message, /跑不动 `npx wrangler whoami`/)
      assert.match(error.message, /npx wrangler login/)
      assert.doesNotMatch(error.message, /secret-account-id|ENOENT/)
      return true
    },
  )
})

test('whoamiAccountId 输出里解不出账号 id 时给出清楚的下一步（不是裸抛）', () => {
  assert.throws(
    () => whoamiAccountId({ execImpl: () => 'You are not authenticated' }),
    /NOMI_CF_ACCOUNT_ID/,
  )
})
