import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function loadNightlyExclusions(root = repoRoot) {
  const source = JSON.parse(fs.readFileSync(path.join(root, 'tests/ux/nightly-ci-exclusions.json'), 'utf8'))
  return new Map(source.exclusions.map((entry) => [entry.path, entry]))
}

export function selectNightlyWalks(files, { root = repoRoot } = {}) {
  const exclusions = loadNightlyExclusions(root)
  return [...files]
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => file.endsWith('.walk.mjs') && !file.endsWith('.paid.mjs'))
    .filter((file) => !exclusions.has(file))
    .sort()
}

function listWalks(directory, root = repoRoot) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.posix.join(path.relative(root, directory).replaceAll('\\', '/'), entry.name))
}

/** 夜跑真正会跑的那份清单（工作流调本文件 CLI 拿的就是它）：目录顶层的走查，去掉登记的排除项。 */
export function nightlyWalkInventory({ root = repoRoot, directory = 'tests/ux' } = {}) {
  return selectNightlyWalks(listWalks(path.resolve(root, directory), root), { root })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const file of nightlyWalkInventory({ directory: process.argv[2] ?? 'tests/ux' })) console.log(file)
}
