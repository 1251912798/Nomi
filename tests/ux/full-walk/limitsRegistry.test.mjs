// 监视器 / 剧本读的每一个上限 `limits.<名字>` 都在 invariants.mjs 的 loadLimits 里登记了。
// 原场景（2026-10-07 起，2026-10-25 才发现）：删「已保存到项目」回执时 loadLimits 连带删掉了 generationPhaseDeadline
// 和回执窗口两条，监视器和 pb01 还在读——跑到节点转圈那一步才「reading 'value'」，全功能走查带病跑了两周多。
// 读法是静态扫源码：不用等哪一条剧本恰好走到那一步才炸。这道防线放在走查自己的单测里，不往门岗脚本族里再加一道。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { loadLimits } from './invariants.mjs'

const walkDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(walkDir, '..', '..', '..')

/** 全功能走查的全部源码（监视器、动作、剧本……；报告目录不算）。 */
function walkSources() {
  const files = []
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { if (entry.name !== 'reports') visit(full) } else if (entry.name.endsWith('.mjs')) files.push(full)
    }
  }
  visit(walkDir)
  return files.map((file) => ({ file: path.relative(repoRoot, file).split(path.sep).join('/'), text: fs.readFileSync(file, 'utf8') }))
}

/**
 * 源码里读了、却没登记的上限（`limits.X` 与 `monitor.limits.X` 都算）。只剥整行注释：行尾注释里写错的名字一样会误导人，照样报。
 * 本文件自己的反例字符串不在扫描范围里（它们写在下面的测试数据里，扫到了就是这一条自己红）——所以真源码那一条排除本文件。
 */
function unregisteredLimitReads(limits, sources) {
  const known = new Set(Object.keys(limits))
  const problems = new Set()
  for (const { file, text } of sources) {
    for (const match of String(text).replace(/^\s*\/\/.*$/gm, '').matchAll(/\blimits\.([A-Za-z_$][\w$]*)/g)) {
      if (!known.has(match[1])) problems.add(`${file}：读了没登记的上限 limits.${match[1]}（登记处 tests/ux/full-walk/invariants.mjs 的 loadLimits）`)
    }
  }
  return [...problems]
}

describe('全功能走查读的上限都登记了', () => {
  it('监视器、动作、剧本里读的每一个 limits.<名字> 都是 loadLimits 的键', () => {
    const self = path.relative(repoRoot, fileURLToPath(import.meta.url)).split(path.sep).join('/')
    expect(unregisteredLimitReads(loadLimits(), walkSources().filter((source) => source.file !== self))).toEqual([])
  })

  it('反例：读了没登记的上限会被认出来，整行注释里的不算（原场景那两处）', () => {
    const sources = [{
      file: 'tests/ux/full-walk/monitor.mjs',
      text: 'if (lingering > limits.savedFeedbackWindowMs.value) {}\nawait wait(monitor.limits.agentIdleMs.value)\n// limits.oldNameInAComment\nconst d = limits.generationPhaseDeadline.value[phase]',
    }]
    expect(unregisteredLimitReads({ agentIdleMs: {} }, sources)).toEqual([
      'tests/ux/full-walk/monitor.mjs：读了没登记的上限 limits.savedFeedbackWindowMs（登记处 tests/ux/full-walk/invariants.mjs 的 loadLimits）',
      'tests/ux/full-walk/monitor.mjs：读了没登记的上限 limits.generationPhaseDeadline（登记处 tests/ux/full-walk/invariants.mjs 的 loadLimits）',
    ])
  })

  it('每一条登记都带出处（上限从哪个产品常量来，能顺着找回去）', () => {
    for (const [name, limit] of Object.entries(loadLimits())) {
      expect(typeof limit?.source === 'string' && limit.source.length > 0, `${name} 没写出处`).toBe(true)
      expect(limit && 'value' in limit, `${name} 没有 value`).toBe(true)
    }
  })
})
