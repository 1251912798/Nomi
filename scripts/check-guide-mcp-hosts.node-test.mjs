// check:guide-mcp-hosts 的尺子测试：门岗在今天的指南上是绿的；把已删除的宿主或错的写入路径放回去，门岗必须红在具名的那一行。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { GUIDE_PATH, findGuideHostOffenders } from './check-guide-mcp-hosts.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const guide = fs.readFileSync(path.join(repoRoot, GUIDE_PATH), 'utf8')

test('今天的指南与注册表一致', () => {
  assert.deepEqual(findGuideHostOffenders(guide), [])
})

test('进了 gates:contracts，不是没人跑的脚本', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  assert.match(pkg.scripts['gates:contracts'], /\bcheck:guide-mcp-hosts\b/)
})

test('把已删除的宿主放回一键接入枚举 → 红，点名那一行', () => {
  const mutated = guide.replace('选择 Claude Code、Claude Desktop、Codex、Cursor 或 WorkBuddy', '选择 Claude Code、Codex、Cursor、Pi 或 WorkBuddy')
  assert.notEqual(mutated, guide)
  const offenders = findGuideHostOffenders(mutated)
  assert.ok(offenders.some((line) => line.includes('「Pi」')), offenders.join('\n'))
})

test('承诺写入一个注册表里没有的配置路径 → 红', () => {
  const mutated = `${guide}\nNomi 把 \`nomi\` 条目写进 \`~/.config/mcp/mcp.json\`。\n`
  const offenders = findGuideHostOffenders(mutated)
  assert.ok(offenders.some((line) => line.includes('~/.config/mcp/mcp.json')), offenders.join('\n'))
})

test('明说「Nomi 不会写」的路径可以出现', () => {
  const ok = `${guide}\nNomi 不会写 \`~/.config/mcp/mcp.json\`。\n`
  assert.deepEqual(findGuideHostOffenders(ok), [])
})

test('注册表里的宿主在指南里一次都没被点名 → 红', () => {
  const offenders = findGuideHostOffenders(guide.replaceAll('WorkBuddy', 'Wxxxx'))
  assert.ok(offenders.some((line) => line.includes('WorkBuddy')), offenders.join('\n'))
})
