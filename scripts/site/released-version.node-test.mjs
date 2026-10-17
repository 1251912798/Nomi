import assert from 'node:assert/strict'
import test from 'node:test'
import { isReleasedForSite, latestStableVersion, resolveReleasedVersion } from './released-version.mjs'

test('版本没到的技能不导出', () => {
  assert.equal(isReleasedForSite('0.24.0', '0.23.1'), false)
})

test('版本到了（含超过）就导出', () => {
  assert.equal(isReleasedForSite('0.24.0', '0.24.0'), true)
  assert.equal(isReleasedForSite('0.24.0', '0.25.2'), true)
  assert.equal(isReleasedForSite('0.9.0', '0.23.1'), true)
})

test('没声明的技能照旧展示，哪怕拿不到已发布版本', () => {
  assert.equal(isReleasedForSite(undefined, '0.23.1'), true)
  assert.equal(isReleasedForSite(undefined, null), true)
})

test('拿不到已发布版本时，声明了版本的技能不展示且不报错', () => {
  assert.equal(isReleasedForSite('0.24.0', null), false)
})

test('最新已发布版本按数值比较并忽略预发布标签', () => {
  assert.equal(latestStableVersion(['v0.9.6', 'v0.23.1', 'v0.23.0', 'v0.24.0-rc.1', 'junk']), '0.23.1')
  assert.equal(latestStableVersion([]), null)
})

test('取版本可注入：环境变量与标签列表，失败返回 null', () => {
  assert.equal(resolveReleasedVersion({ env: { NOMI_SITE_RELEASED_VERSION: '0.24.0' } }), '0.24.0')
  assert.equal(resolveReleasedVersion({ env: {}, listTags: () => ['v0.23.1', 'v0.23.0'] }), '0.23.1')
  assert.equal(resolveReleasedVersion({ env: {}, listTags: () => { throw new Error('no git') } }), null)
})

// 真路径：跑官网导出脚本本身（只列名字、不写文件），用环境变量注入「最新已发布版本」。
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
function exportedSkillNames(releasedVersion) {
  const env = { ...process.env, NOMI_SITE_RELEASED_VERSION: releasedVersion }
  const out = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/site/export-site-data.mts', '--names'], { cwd: root, env, encoding: 'utf8' })
  return JSON.parse(out.trim().split(/\r?\n/).at(-1))
}

test('导出脚本：director-3dbox 标了 0.24.0 起，0.23.1 时不导出，0.24.0 时导出，其余技能不受影响', () => {
  const before = exportedSkillNames('0.23.1')
  const after = exportedSkillNames('0.24.0')
  assert.equal(before.includes('director-3dbox'), false)
  assert.equal(after.includes('director-3dbox'), true)
  assert.deepEqual(after.filter((name) => name !== 'director-3dbox'), before)
})
