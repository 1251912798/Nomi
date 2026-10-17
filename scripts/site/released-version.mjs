// 官网只展示「最新已发布版本」里就有的技能。判据与取版本都在这里，导出脚本只调用。
// 技能在 SKILL.md 的 metadata.nomi 里写 available-since: x.y.z（没写 = 照旧展示）。
// 「最新已发布版本」= 最高的正式版 git 标签 vX.Y.Z（标签只在 Desktop Release 正式发布时创建）；
// 拿不到（浅克隆没标签、不是 git 仓库）返回 null，此时带 available-since 的技能一律不展示，不报错。
import { execFileSync } from 'node:child_process'

const STABLE = /^v?(\d+)\.(\d+)\.(\d+)$/

/** 只认 x.y.z（带不带 v 都行）；预发布后缀一律不算已发布。 */
export function parseStableVersion(value) {
  const match = STABLE.exec(String(value ?? '').trim())
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

export function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1
  }
  return 0
}

/** 从标签列表里挑最高的正式版，返回 "x.y.z"；一个都没有返回 null。 */
export function latestStableVersion(tags) {
  let best = null
  for (const tag of tags) {
    const parsed = parseStableVersion(tag)
    if (parsed && (!best || compareVersions(parsed, best) > 0)) best = parsed
  }
  return best ? best.join('.') : null
}

/** 取最新已发布版本：环境变量 NOMI_SITE_RELEASED_VERSION 优先（测试 / 手动覆盖），否则读 git 标签。失败返回 null。 */
export function resolveReleasedVersion({ env = process.env, cwd = process.cwd(), listTags } = {}) {
  const override = env.NOMI_SITE_RELEASED_VERSION
  if (override !== undefined && override !== '') return parseStableVersion(override)?.join('.') ?? null
  try {
    const tags = listTags
      ? listTags()
      : execFileSync('git', ['tag', '--list', 'v*'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/)
    return latestStableVersion(tags)
  } catch {
    return null
  }
}

/** 这个技能该不该上官网。没声明 availableSince 照旧展示；声明了但版本没到或版本拿不到，不展示。 */
export function isReleasedForSite(availableSince, releasedVersion) {
  if (availableSince === undefined || availableSince === null || availableSince === '') return true
  const since = parseStableVersion(availableSince)
  const released = parseStableVersion(releasedVersion)
  if (!since || !released) return false
  return compareVersions(released, since) >= 0
}
