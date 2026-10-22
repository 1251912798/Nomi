#!/usr/bin/env tsx
/**
 * 门岗 · 指南里点名的 MCP 宿主和写入路径，必须和注册表（electron/shared/mcpClientRegistry.ts）一致。
 *
 * 治的是：注册表删了 Pi（假项），指南里「选择 Claude Code、Codex、Cursor、Pi 或 WorkBuddy，点击接入」
 * 和「Nomi 把 nomi 条目写进 ~/.config/mcp/mcp.json」还在对用户承诺一键接入——文档是纯文本，编译器看不见（2026-10-21）。
 *
 * 判据全部从注册表派生，不手抄「退役名单」：
 * 1. 宿主枚举：一行里同时点名 ≥3 个注册表宿主，就是一条宿主枚举；枚举范围内出现的每个名字都必须是注册表里的宿主。
 * 2. 覆盖：指南里每个注册表宿主至少被点名一次。
 * 3. 写入路径：指南里 `~/…` 形式的 MCP 配置文件路径，必须等于某个注册表宿主的 configPath；
 *    例外只有路径紧邻（前后 16 字内）明说「Nomi 不写」的（含「不会写 / 不写 / 不在写入范围」）。
 * 局限：只核枚举和路径；散文里单独提到某个宿主名不在判据内（那归评审）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MCP_CLIENT_REGISTRY, type McpClientPath } from '../electron/shared/mcpClientRegistry'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const GUIDE_PATH = 'docs/guide/capability-core-cli-mcp.md'

const NEGATION = /不会写|不写|不在写入范围/
const CONFIG_FILE = /(?:mcp\.json|config\.toml|\.claude\.json|claude_desktop_config\.json)$/

type Registry = Record<string, { label: string; configPath: Partial<Record<'darwin' | 'win32' | 'linux', McpClientPath>> }>

/** 注册表某个宿主的某个平台路径写成指南里的 `~/…`（appData 根的不用 ~ 表示，指南里也不这样写）。 */
function guideSpellings(registry: Registry): Set<string> {
  const spellings = new Set<string>()
  for (const spec of Object.values(registry)) {
    for (const entry of Object.values(spec.configPath)) {
      if (entry?.root === 'home') spellings.add(`~/${entry.segments.join('/')}`)
    }
  }
  return spellings
}

export function findGuideHostOffenders(markdown: string, registry: Registry = MCP_CLIENT_REGISTRY): string[] {
  const offenders: string[] = []
  const labels = Object.values(registry).map((spec) => spec.label)
  // 长名字优先，免得「Claude Code」被「Claude」之类的短名截断。
  const byLength = [...labels].sort((a, b) => b.length - a.length)
  const mentioned = new Set<string>()
  const lines = markdown.split('\n')

  lines.forEach((line, index) => {
    const at = `${GUIDE_PATH}:${index + 1}`
    const hits = byLength.flatMap((label) => {
      const found: Array<{ label: string; start: number; end: number }> = []
      let from = 0
      for (;;) {
        const start = line.indexOf(label, from)
        if (start < 0) break
        found.push({ label, start, end: start + label.length })
        from = start + label.length
      }
      return found
    })
    // 去掉被更长名字包含的命中（Claude Code 内不会再含别的注册表名，保险起见）。
    const spans = hits.filter((hit) => !hits.some((other) => other !== hit && other.start <= hit.start && other.end >= hit.end && other.label.length > hit.label.length))
    for (const hit of spans) mentioned.add(hit.label)
    if (new Set(spans.map((hit) => hit.label)).size >= 3) {
      const first = Math.min(...spans.map((hit) => hit.start))
      const last = Math.max(...spans.map((hit) => hit.end))
      const tokens = line.slice(first, last).split(/\s*(?:\/|、|，|,|或|和|以及)\s*/).map((token) => token.trim()).filter(Boolean)
      for (const token of tokens) {
        if (!labels.includes(token)) offenders.push(`${at} 宿主枚举里的「${token}」不在注册表里（注册表：${labels.join(' / ')}）`)
      }
    }
    for (const match of line.matchAll(/`(~\/[^`]+)`/g)) {
      const candidate = match[1]
      if (!CONFIG_FILE.test(candidate)) continue
      if (guideSpellings(registry).has(candidate)) continue
      const near = line.slice(Math.max(0, (match.index ?? 0) - 16), (match.index ?? 0) + candidate.length + 2 + 16)
      if (NEGATION.test(near)) continue
      offenders.push(`${at} 写入路径 ${candidate} 不是任何注册表宿主的配置文件（若是「Nomi 不会写」的路径，紧邻处要明说）`)
    }
  })

  for (const label of labels) {
    if (!mentioned.has(label)) offenders.push(`${GUIDE_PATH} 没有点名注册表里的宿主「${label}」`)
  }
  return offenders
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const offenders = findGuideHostOffenders(fs.readFileSync(path.join(repoRoot, GUIDE_PATH), 'utf8'))
  if (offenders.length > 0) {
    console.error('✖ 指南里的 MCP 宿主 / 写入路径和注册表对不上：')
    for (const offender of offenders) console.error(`  - ${offender}`)
    console.error('  注册表是唯一 owner：electron/shared/mcpClientRegistry.ts；改指南去配注册表，不改注册表去配指南。')
    process.exit(1)
  }
  console.log(`✅ 指南里点名的宿主和写入路径与注册表一致（${Object.keys(MCP_CLIENT_REGISTRY).length} 个宿主）。`)
}
