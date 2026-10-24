#!/usr/bin/env node
// 「调一次模型」单一主人门岗（2026-10-09 立，2026-10-21 随文本任务迁 pi-ai 改写）。
//
// 起因：主进程曾有两台各自实现的模型调用栈——Agent 走 pi-ai，文本任务走 ai@4（streamTextTask）。判活、超时、
// 重试、取消、错误分类各写一份，ai@4 那一份判活只数正文 token，思考型模型 30 秒就被当死连接掐掉；同一个文件
// 14 天修了 5 刀（docs/audit/2026-10-21-text-stream-first-token-gate.md）。迁移把第二台整台删掉之后，这道门守两件事：
//
// ① 第二台发动机回不来：任何文件（含 .mjs / .cjs、动态 import、require、重导出、类型位置）引用 `ai` 或 `@ai-sdk/*` 即红；
//    package.json 的依赖里出现它们也红（依赖都不在，代码就写不出来——这是比扫描更硬的一层，扫描是给它看门）。
// ② 一次模型调用只有一个主人：`.streamSimple(` / `.completeSimple(` 这类「直接对模型发一次」的调用只许出现在
//    OWNER（electron/agentLane/laneModelCall.mts）与 provider 装配的两层包装里（它们是传输，不是调用方）。
//    文本任务、编译器、lane 的一次性提问都经 OWNER；Agent 多轮由 pi-agent-core 的 AgentHarness 自己调，不在这里。
//
// 管什么 / 不管什么：管**不小心**直接用；不管**故意**绕（`import(变量)`、拼字符串），那靠评审。测试文件不算。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export const OWNER = 'electron/agentLane/laneModelCall.mts'
/** provider 装配的两层包装：把 pi 的协议实现包成带看门狗 / 鉴权 / 请求体规矩的 ProviderStreams。它们转发调用，不发起调用。 */
export const TRANSPORT_WRAPPERS = new Set(['electron/agentLane/laneModelProvider.mts', 'electron/agentLane/laneProviderGuard.mts'])
export const isBannedPackage = (name) => name === 'ai' || name.startsWith('@ai-sdk/')
const ONE_SHOT_METHODS = new Set(['streamSimple', 'completeSimple'])

const isBannedModule = (node) => Boolean(node) && ts.isStringLiteralLike(node) && isBannedPackage(node.text)

/** 一个文件里引用了被删掉的那台发动机的哪些地方。返回人话列表。 */
export function bannedImports(source, fileName = 'file.ts') {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true)
  const hits = []
  const note = (node, text) => hits.push(`${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}: ${text}`)
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && isBannedModule(node.moduleSpecifier)) {
      note(node, `${ts.isImportDeclaration(node) ? 'import' : 'export … from'} "${node.moduleSpecifier.text}"`)
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)
      && isBannedModule(node.moduleReference.expression)) {
      note(node, `import = require("${node.moduleReference.expression.text}")`)
    } else if (ts.isCallExpression(node) && node.arguments.length && isBannedModule(node.arguments[0])
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      note(node, `${node.expression.kind === ts.SyntaxKind.ImportKeyword ? 'import' : 'require'}("${node.arguments[0].text}")`)
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && isBannedModule(node.argument.literal)) {
      note(node, `import("${node.argument.literal.text}") 类型`)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return hits
}

/** 一个文件里「直接对模型发一次」的调用（`x.streamSimple(` / `x.completeSimple(` / `x["streamSimple"](`）。 */
export function oneShotCalls(source, fileName = 'file.ts') {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true)
  const hits = []
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const name = ts.isPropertyAccessExpression(callee) ? callee.name.text
        : ts.isElementAccessExpression(callee) && ts.isStringLiteralLike(callee.argumentExpression) ? callee.argumentExpression.text : null
      if (name && ONE_SHOT_METHODS.has(name)) hits.push(`${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}: .${name}(…)`)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return hits
}

/** package.json 的依赖里出现被删掉的包。 */
export function bannedDependencies(pkg) {
  return ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
    .flatMap((field) => Object.keys(pkg?.[field] ?? {}).filter(isBannedPackage).map((name) => `${field}.${name}`))
}

export function scan(root) {
  const found = []
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'dist', 'dist-electron', '.git', '.tmp', 'release'].includes(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (!/\.(tsx?|mts|cts|mjs|cjs|jsx?)$/.test(entry.name) || /\.(test|node-test)\.[cm]?[jt]sx?$/.test(entry.name)) continue
      const rel = path.relative(root, full).split(path.sep).join('/')
      const source = fs.readFileSync(full, 'utf8')
      const accesses = bannedImports(source, rel)
      if (rel !== OWNER && !TRANSPORT_WRAPPERS.has(rel) && (rel.startsWith('electron/') || rel.startsWith('src/'))) accesses.push(...oneShotCalls(source, rel))
      if (accesses.length) found.push({ file: rel, accesses })
    }
  }
  for (const dir of ['src', 'electron', 'workers', 'scripts', 'tests']) walk(path.join(root, dir))
  const pkgFile = path.join(root, 'package.json')
  if (fs.existsSync(pkgFile)) {
    const deps = bannedDependencies(JSON.parse(fs.readFileSync(pkgFile, 'utf8')))
    if (deps.length) found.push({ file: 'package.json', accesses: deps })
  }
  return found
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const hits = scan(root)
  if (hits.length) {
    console.error(`✖ ${hits.length} 处违反「调一次模型只有一个主人」（${OWNER}）：`)
    for (const hit of hits) for (const access of hit.accesses) console.error(`  ${hit.file}:${access}`)
    console.error('  → ai / @ai-sdk/* 已整体删除（2026-10-21）；要调模型一律经 callModelOnce（CJS 侧 electron/ai/modelCallBridge.ts）')
    process.exit(1)
  }
  console.log(`✅ 调一次模型单一主人：没有 ai / @ai-sdk/*，直接调模型只在 ${OWNER}`)
}
