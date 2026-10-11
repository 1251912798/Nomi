#!/usr/bin/env node
// 门岗（结构）：性能场景登记表（tests/perf/scenarios/，一条一个文件）。规矩见 docs/engineering/perf-scenarios.md，
// 判据全在 scripts/perf-scenarios-lib.mjs：id 唯一且与文件名一致、script 存在且是现有量具、metrics / budget / baseline 齐全且是数字。
// PR 正文里的 `perf-scenario` 证据行（id 必须在登记表里）由 check:pr-judgement 判，同一份登记表。
// 环境变量（给测试用）：PERF_SCENARIOS_REPO_ROOT 覆盖仓库根。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { SCENARIO_DIR, loadScenarios, validateScenarios } from './perf-scenarios-lib.mjs'

const repoRoot = process.env.PERF_SCENARIOS_REPO_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const entries = loadScenarios(repoRoot)
const errors = validateScenarios(entries, { exists: (rel) => fs.existsSync(path.join(repoRoot, rel)) })
if (errors.length) {
  console.error(`✖ 性能场景登记表（${SCENARIO_DIR}/）有 ${errors.length} 处不合格：`)
  for (const line of errors) console.error(`  · ${line}`)
  console.error('  → 字段说明与新增流程：docs/engineering/perf-scenarios.md')
  process.exit(1)
}
console.log(`✅ 性能场景登记表：${entries.length} 个场景，结构齐全`)
