// 「测试 / 门岗自检往真实仓库路径写文件」的语法树扫描（2026-10-10）。
//
// 起因：gate-mutation-harness 的 withMutation 原地改真实工作区里的生产文件，被杀时留下变异后的生产代码
// （同一天两次）。类根因是「测试对真实仓库路径有写权」；还原机制（finally / 信号 / 恢复档）兜不住 Windows 被杀与并发。
// 这里把它变成机器判据：测试文件里，写 / 删 / 建目录 / 拷贝目标 / 改名这类调用，目标路径一旦由 repoRoot（或 process.cwd()）
// 拼出来、又不在 `.tmp` 下，就算违规——要写就写 makeTempDir 给的临时目录。
//
// 判据（只认这一族）：
//   · 目标参数：writeFileSync / appendFileSync / rmSync / rmdirSync / unlinkSync / mkdirSync / truncateSync / mkdtempSync /
//     writeFile / appendFile / rm / unlink / mkdir / createWriteStream 取第 1 个参数；copyFileSync / cpSync / copyFile / cp 取第 2 个；
//     renameSync / rename 两个都算；
//   · 参数表达式里出现标识符 repoRoot / REPO_ROOT / repositoryRoot 或 process.cwd()；
//   · 且表达式里没有以 `.tmp` 开头的字符串字面量（仓库约定的 gitignore 草稿区）。
// 已知限制：变量别名只跟踪同文件内由仓库根拼出的变量；跨函数传递的路径看不到；这是语法层的拦截，不是沙箱。真正的隔离靠 gate-mutation-harness 的临时副本。
import ts from 'typescript'

const ROOT_NAMES = new Set(['repoRoot', 'REPO_ROOT', 'repositoryRoot'])
const FIRST_ARG = new Set(['writeFileSync', 'appendFileSync', 'rmSync', 'rmdirSync', 'unlinkSync', 'mkdirSync', 'truncateSync', 'mkdtempSync', 'writeFile', 'appendFile', 'rm', 'unlink', 'mkdir', 'createWriteStream', 'mkdtemp'])
const SECOND_ARG = new Set(['copyFileSync', 'cpSync', 'copyFile', 'cp'])
const BOTH_ARGS = new Set(['renameSync', 'rename'])

function calleeName(call) {
  const callee = call.expression
  if (ts.isIdentifier(callee)) return callee.text
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text
  return ''
}

function isProcessCwd(node) {
  return ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'cwd'
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === 'process'
}

/** 表达式里引用了仓库根（直接，或经 aliases 里记过的变量）。 */
function mentionsRepo(node, isAliasAt) {
  let found = false
  const visit = (child) => {
    if (found) return
    if (ts.isIdentifier(child) && (ROOT_NAMES.has(child.text) || isAliasAt(child.text, child))) found = true
    else if (isProcessCwd(child)) found = true
    else ts.forEachChild(child, visit)
  }
  visit(node)
  return found
}

function underTmp(node) {
  let found = false
  const visit = (child) => {
    if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child) || ts.isTemplateHead(child)) {
      // .tmp* 是 gitignore 草稿区；node_modules 同样不入库（check-i18n 门岗自测把临时语料放在 node_modules/.cache）
      if (/^(?:\.tmp(?:[\\/]|$|-)|node_modules(?:[\\/]|$))/u.test(child.text)) found = true
    }
    ts.forEachChild(child, visit)
  }
  visit(node)
  return found
}

const PATH_CALLS = new Set(['join', 'resolve', 'normalize', 'dirname'])
/** 只认「拼路径」的表达式（path.join / resolve / 模板串 / 拼接 / 变量），其它函数调用的返回值不当路径别名，否则 sites = scan(repoRoot) 之类都会被牵连。 */
function isPathExpression(node) {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return isPathExpression(node.expression)
  if (ts.isIdentifier(node) || ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node)) return true
  if (ts.isBinaryExpression(node)) return true
  if (ts.isCallExpression(node)) return PATH_CALLS.has(calleeName(node))
  return false
}

/** @returns {{ line: number, call: string }[]} */
export function repoWriteViolations(file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, /\.(?:ts|mts|cts)$/u.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS)
  // 变量别名：`const target = path.join(process.cwd(), 'electron', 'main.ts')` 之后 `writeFileSync(target, …)` 同样算写真仓库
  // （2026-10-11 check-ipc-sender-binding.test 就是这么改写 electron/main.ts 的）。只认初始化表达式引用了仓库根、且不在 .tmp 下的变量；
  // 按名字全文件通配，同名的临时目录变量被误伤时，改个变量名即可。
  // 作用域：别名只在声明它的函数（或模块顶层）内有效，别处同名的临时目录变量不受牵连。
  const aliasScopes = new Map()
  const scopeOf = (node) => { let n = node.parent; while (n && !ts.isFunctionLike(n) && !ts.isSourceFile(n)) n = n.parent; return n }
  const isAliasAt = (name, at) => { const scopes = aliasScopes.get(name); if (!scopes) return false; for (let n = scopeOf(at); n; n = scopeOf(n)) if (scopes.has(n)) return true; return false }
  let aliasGrew = true
  const collect = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && !isAliasAt(node.name.text, node) && isPathExpression(node.initializer) && mentionsRepo(node.initializer, isAliasAt) && !underTmp(node.initializer)) {
      const scopes = aliasScopes.get(node.name.text) ?? new Set()
      scopes.add(scopeOf(node))
      aliasScopes.set(node.name.text, scopes)
      aliasGrew = true
    }
    ts.forEachChild(node, collect)
  }
  while (aliasGrew) { aliasGrew = false; collect(ast) }
  const hits = []
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node)
      const targets = FIRST_ARG.has(name) ? [node.arguments[0]]
        : SECOND_ARG.has(name) ? [node.arguments[1]]
          : BOTH_ARGS.has(name) ? [node.arguments[0], node.arguments[1]] : []
      for (const target of targets) {
        if (target && mentionsRepo(target, isAliasAt) && !underTmp(target)) {
          hits.push({ line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, call: name })
          break
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return hits
}
