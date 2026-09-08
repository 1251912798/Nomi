// 外部格式对齐门岗的判据本体（R31，2026-09-07）。守一条不变量：
// **凡是外部也读写的东西，格式先对齐官方或事实标准；对不齐的每一处偏差都要有领域约束级别的理由。**
//
// 起因（2026-09-07 用户拍板）：技能格式的官方形态（Claude Code / pi / Codex 的 Agent Skills）
// 只有「文件夹 + SKILL.md + YAML frontmatter」。我们**在它旁边另起了一个平行文件 `skill.json`**，
// 于是用户导入别人的技能进不来（2026-08-26 群里抱怨），而我们的文案还在引导用户去造这个文件。
// 标准就摆在那儿，只是没有人在动手之前去看一眼。同族：接 pi 时只接了最底层的 agent loop（R29 已治）。
//
// 判据住在 lib 里是为了能被 node-test 喂假仓库：门岗自己的测试如果只能跑真实登记表，
// 它就只测得到「今天的存量」，测不到「明天新增一个自造格式会不会红」（R17）。
//
// 判据形状（和 check:framework-boundary / check:heavy-path 同一套棘轮）：
//   登记表（docs/engineering/standard-formats.json）声明「这个格式对齐的是谁、偏差在哪、夹具是哪份」→
//   启发式扫盘找出仓库里所有「解析外部格式文件」的入口 → 没被任何登记项覆盖的入口就是红，
//   除非登记进基线（scripts/standard-formats-baseline.json）当**债**：绑方案 + 到期日，到期不清就红。

const IDENTITY_SEPARATOR = '::'
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/

/** 登记项的五种身份。前两种必须指得到规范和官方夹具；后三种各有各的必填项。 */
export const FORMAT_KINDS = Object.freeze([
  // 有正式规范文档（MCP 规范、JSON Schema、Agent Skills 官方文档），我们对齐了
  'external-standard',
  // 没有正式规范，但生态已经收敛（某个主流实现的行为就是事实标准，如 Codex 的 config.toml 布局）
  'de-facto-standard',
  // **有标准，我们却没对齐**——这一格是 R31 的起因（skill.json）。必须同时给出该对齐的 spec 和一条带到期日的收敛债。
  // 它和 nomi-defined 的区别是整条规则的要害：一个是「查过了没有」，一个是「有，但没去看」。
  'non-aligned',
  // 查过了确实没有可对齐的，只能自定义——必须写 searched 交代查过哪些
  'nomi-defined',
  // 只有我们自己读写、从不跨出本机本进程边界的内部产物；豁免夹具，但要写清凭什么说它不对外
  'internal',
])

/** 需要「规范链接」的三种身份。non-aligned 也要——不写清「本该对齐谁」，它和自定义就分不出来。 */
const NEEDS_SPEC = new Set(['external-standard', 'de-facto-standard', 'non-aligned'])
/** 需要官方夹具的两种：已经声称对齐了的，才有「读不读得过官方样例」这个问题。 */
const NEEDS_FIXTURE = new Set(['external-standard', 'de-facto-standard'])

/** 抹注释必须逐行等高（不改总行数，否则报出来的 file:line 点开是别的地方）。 */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ''))
    .replace(/^[^\S\n]*\/\/.*$/gm, '')
}

export function identityOf(formatFile, sourceFile) {
  return `${formatFile}${IDENTITY_SEPARATOR}${sourceFile}`
}

// ─── 启发式：哪些调用点算「解析一个外部格式文件」 ─────────────────────────────
//
// 两个条件同时成立才算：① 文件里有解析/反序列化调用；② 文件里出现了一个**别人也会写出来的文件名**。
//
// 为什么必须要第二个条件：全仓 `JSON.parse` 有几百处，绝大多数读的是我们自己的落盘产物
// （门岗基线、项目快照、导出中间态）。把它们全拦进来，基线会有一百多条，
// 而**一道有一百多条豁免的门岗等于不存在**（R17 教训）。名字才是「外部性」的机器代理：
// 一个格式要能被别人读写，它得先有个别人叫得出的名字。
//
// 三种「叫得出的名字」：
//   ① 点开头的配置文件——`.claude.json` / `.mcp.json` / `.nomiskill.json`，这形状本身就意味着「某个工具的约定」；
//   ② 全大写的 markdown——`SKILL.md` / `AGENTS.md` / `CLAUDE.md`，规范定死的文件名；
//   ③ 通用清单名——`skill.json` / `manifest.json` / `plugin.json` / `mcp.json` / `config.toml`…
//      这些名字没有任何 Nomi 特征，说明它是**一类东西的名字**，不是我们某个模块的私有产物。
//
// 它抓不到什么（诚实记分）：把外部格式解析写成一个不出现文件名的纯函数（形状从调用方传进来）
// 就会漏。所以登记表本身仍然是人写的第一性交付物，启发式只负责在有人**新加一个解析入口**时叫住他。
const PARSE_CALL =
  /\b(?:JSON\.parse|yaml\.(?:parse|load)|parseYaml|YAML\.parse|TOML\.parse|toml\.parse|matter|parseFrontmatter|frontmatterValue)\s*\(/
// 允许字面量里带路径前缀（`path.join(dir, '.claude/settings.json')`）或模板插值
// （`` `${dir}/settings.json` ``）——真实代码里文件名极少是光秃秃的一个词，
// 只认光秃秃那种会漏掉一大半（2026-09-07 写红证明时当场撞到：探针文件没被抓住）。
const FILE_NAME_LITERAL = /['"`](?:[^'"`\n]*[/}])?([\w.@-]+\.(?:json|toml|ya?ml|md))['"`]/g
const FORMAT_NAME_SHAPES = [
  /^\.[\w.-]+\.(?:json|toml|ya?ml)$/,
  /^[A-Z][A-Z0-9_]*\.md$/,
  /^(?:skill|manifest|plugin|package|config|mcp|settings|workflow|agents)\.(?:json|toml|ya?ml)$/,
]

/** 这个文件名是不是「别人也叫得出的名字」。 */
export function looksLikeFormatName(name) {
  return FORMAT_NAME_SHAPES.some((shape) => shape.test(name))
}

/**
 * 扫描。`sources` 是 Map<相对路径, 源码>，由调用方决定读哪些文件——
 * 这样测试可以喂一个三文件的假仓库，跑得比真扫描快，也不依赖真实代码长什么样。
 * 返回 Map<identity, { identity, formatFile, file, line }>。
 */
export function scanSources(sources) {
  const hits = new Map()
  for (const [file, raw] of sources) {
    const source = stripComments(raw)
    if (!PARSE_CALL.test(source)) continue
    for (const match of source.matchAll(FILE_NAME_LITERAL)) {
      const formatFile = match[1]
      if (!looksLikeFormatName(formatFile)) continue
      const identity = identityOf(formatFile, file)
      if (hits.has(identity)) continue
      hits.set(identity, {
        identity,
        formatFile,
        file,
        line: source.slice(0, match.index).split('\n').length,
      })
    }
  }
  return hits
}

// ─── 登记表校验 ──────────────────────────────────────────────────────────────

function checkDebt(label, debt, today, errors) {
  if (debt === undefined) return
  if (!debt || typeof debt !== 'object' || Array.isArray(debt)) {
    errors.push(`${label}: debt 必须是对象`)
    return
  }
  for (const field of ['what', 'why', 'plan']) {
    if (typeof debt[field] !== 'string' || !debt[field].trim()) {
      errors.push(`${label}: debt.${field} 必填（欠账没有方案和理由 = 永久豁免）`)
    }
  }
  if (typeof debt.due !== 'string' || !DATE_SHAPE.test(debt.due)) {
    errors.push(`${label}: debt.due 必须是 YYYY-MM-DD 到期日（登记是有时限的承诺，不是永久放行 · R28）`)
  } else if (debt.due < today) {
    errors.push(`${label}: 偏差债已于 ${debt.due} 到期仍未清（方案 ${debt.plan}）——要么对齐，要么带理由重定到期日`)
  }
}

/**
 * 登记表本身也要被拦。一条没有 spec 的「外部标准」等于没做过研究；
 * 一条没有 reason 的偏差等于「当时就这么写的」——而偏好不是理由（R31 第三条）。
 */
export function validateRegistry(registry, { today = '1970-01-01' } = {}) {
  const errors = []
  const formats = registry?.formats
  if (!Array.isArray(formats) || formats.length === 0) {
    return ['formats 必须是非空数组']
  }
  const seen = new Set()
  for (const format of formats) {
    const name = format?.name
    if (typeof name !== 'string' || !name.trim()) { errors.push('每个格式必须有 name'); continue }
    if (seen.has(name)) errors.push(`格式 name 重复：${name}`)
    seen.add(name)

    const kind = format.kind
    if (!FORMAT_KINDS.includes(kind)) {
      errors.push(`${name}: kind 必须是 ${FORMAT_KINDS.join(' / ')} 之一，实际 ${JSON.stringify(kind)}`)
    }
    // 线上载荷（wire）不是盘上文件，files 只能为空；反过来，盘上格式必须写出文件名，
    // 否则门岗认领不了任何解析入口——一个认领不到入口的登记项等于一段注释。
    if (!Array.isArray(format.files)) {
      errors.push(`${name}: files 必须是数组`)
    } else if (format.wire === true) {
      if (format.files.length > 0) errors.push(`${name}: wire=true 表示它是线上载荷不是盘上文件，files 必须为空`)
      if (typeof format.wireContract !== 'string' || !format.wireContract.trim()) {
        errors.push(`${name}: wire=true 必须写 wireContract —— 这份 schema 由哪条消息承载`)
      }
    } else if (format.files.length === 0) {
      errors.push(`${name}: files 必须列出这个格式在盘上的文件名（门岗按文件名认领解析入口）`)
    }
    const readers = Array.isArray(format.readers) ? format.readers : []
    const writers = Array.isArray(format.writers) ? format.writers : []
    if (readers.length + writers.length === 0) {
      errors.push(`${name}: readers / writers 至少要有一边非空（登记一个没人读也没人写的格式没有意义）`)
    }

    if (NEEDS_SPEC.has(kind)) {
      if (typeof format.spec !== 'string' || !/^https?:\/\//.test(String(format.spec))) {
        errors.push(`${name}: kind=${kind} 必须给出规范或事实标准的 URL（spec）——没有链接的「对齐」无法复核`)
      }
      if (typeof format.upstreamVersion !== 'string' || !format.upstreamVersion.trim()) {
        errors.push(`${name}: upstreamVersion 必须写下对齐时上游是哪一版（规范会改，对齐是有时效的）`)
      }
    }
    if (NEEDS_FIXTURE.has(kind)) {
      const fixtures = Array.isArray(format.fixtures) ? format.fixtures : []
      if (fixtures.length === 0 && format.debt === undefined) {
        errors.push(`${name}: 缺官方夹具（fixtures）——「我们读得过自己写的」不证明「我们读得过别人写的」。`
          + '还没抓到就登记 debt 并绑到期日，不许静默省掉')
      }
    }
    if (kind === 'non-aligned' && format.debt === undefined) {
      errors.push(`${name}: kind=non-aligned 必须绑一条带到期日的收敛债 —— `
        + '「有标准但我们没对齐」只能是**在途状态**，没有到期日它就是永久分叉')
    }
    if (kind === 'nomi-defined') {
      const searched = Array.isArray(format.searched) ? format.searched : []
      if (searched.length === 0) {
        errors.push(`${name}: kind=nomi-defined 必须写 searched —— 「查过哪些、为什么没有可对齐的」。`
          + '没有这一格，自定义和「没查就自己造」在机器眼里一模一样')
      }
      for (const entry of searched) {
        if (typeof entry?.what !== 'string' || !entry.what.trim()) errors.push(`${name}: searched 条目缺 what`)
        if (typeof entry?.verdict !== 'string' || !entry.verdict.trim()) {
          errors.push(`${name}: searched「${entry?.what ?? '?'}」缺 verdict（为什么它对不上）`)
        }
      }
    }
    if (kind === 'internal' && (typeof format.why !== 'string' || !format.why.trim())) {
      errors.push(`${name}: kind=internal 必须写 why —— 凭什么断定它不跨出我们自己的边界`)
    }

    const deviations = format.deviations
    if (deviations !== undefined && !Array.isArray(deviations)) {
      errors.push(`${name}: deviations 必须是数组`)
    }
    for (const deviation of Array.isArray(deviations) ? deviations : []) {
      if (typeof deviation?.what !== 'string' || !deviation.what.trim()) {
        errors.push(`${name}: 每条 deviation 必须写清 what（我们和标准哪里不一样）`)
        continue
      }
      if (typeof deviation.reason !== 'string' || !deviation.reason.trim()) {
        errors.push(`${name}/「${deviation.what}」: deviation 缺 reason —— 理由必须是领域约束，`
          + '「我们这样更简单」「当时就这么写的」是偏好，偏好不是理由（R31）')
      }
    }
    checkDebt(name, format.debt, today, errors)
  }
  return errors
}

// ─── 覆盖判定 ────────────────────────────────────────────────────────────────

/** 登记表能认领哪些 (格式文件名 × 源码文件) 组合。 */
export function coverageOf(registry) {
  const covered = new Set()
  for (const format of registry?.formats ?? []) {
    const touchers = [...(format.readers ?? []), ...(format.writers ?? [])]
    for (const formatFile of format.files ?? []) {
      for (const file of touchers) covered.add(identityOf(formatFile, file))
    }
  }
  return covered
}

/**
 * 夹具体检（判据 a）。两问：夹具文件在不在；有没有**测试**引用它。
 * 只有文件存在不算数——一份没有任何测试读的夹具就是一份摆设，它不会在解析器读不过它的时候红。
 *
 * `fixtureExists(path) -> boolean`；`fixtureReferencedByTest(path) -> boolean`。
 */
export function evaluateFixtures({ registry, fixtureExists, fixtureReferencedByTest }) {
  const errors = []
  for (const format of registry?.formats ?? []) {
    for (const fixture of format.fixtures ?? []) {
      if (!fixtureExists(fixture)) {
        errors.push(`${format.name}: 夹具 ${fixture} 不存在 —— 指不到的夹具等于没抓`)
        continue
      }
      if (!fixtureReferencedByTest(fixture)) {
        errors.push(`${format.name}: 夹具 ${fixture} 没有任何测试引用它 —— `
          + '夹具的全部作用就是「解析器读不过官方样例时报红」，没人读它就永远不会红')
      }
    }
  }
  return errors
}

/**
 * 棘轮比对（判据 b + d）。四种红：
 *   ① 新增一个未登记的外部格式解析入口——这就是本门岗存在的理由；
 *   ② 基线里的债已经不存在了，基线没跟着删——棘轮只减不增；
 *   ③ 债登记不全（缺 format / plan / due）；
 *   ④ 债过期。
 */
export function evaluateTouchpoints({ hits, covered, baseline, today }) {
  const errors = []
  const debt = baseline?.debt
  if (!Array.isArray(debt)) return ['基线的 debt 必须是数组']
  const byIdentity = new Map()
  for (const entry of debt) {
    const identity = entry?.identity
    if (typeof identity !== 'string' || !identity.includes(IDENTITY_SEPARATOR)) {
      errors.push(`债条目缺少合法 identity：${JSON.stringify(entry)}`)
      continue
    }
    if (byIdentity.has(identity)) errors.push(`债条目重复：${identity}`)
    if (typeof entry.plan !== 'string' || !entry.plan.trim()) {
      errors.push(`${identity}: plan 必须指向收敛方案（欠账没有方案 = 永久豁免）`)
    }
    if (typeof entry.due !== 'string' || !DATE_SHAPE.test(entry.due)) {
      errors.push(`${identity}: due 必须是 YYYY-MM-DD 到期日`)
    } else if (entry.due < today) {
      errors.push(`${identity}: 债已于 ${entry.due} 到期仍未登记（方案 ${entry.plan}）`
        + '——要么把这个格式登记进 docs/engineering/standard-formats.json，要么带理由重定到期日')
    }
    byIdentity.set(identity, entry)
  }
  for (const hit of hits.values()) {
    if (covered.has(hit.identity)) continue
    if (byIdentity.has(hit.identity)) continue
    errors.push(`未登记的外部格式解析入口：${hit.file}:${hit.line} 读写 \`${hit.formatFile}\``
      + '\n      先问「这个格式有没有官方或事实标准」（R31）：'
      + '\n        有 → 对齐它，把规范链接、官方夹具、偏差与理由登记进 docs/engineering/standard-formats.json；'
      + '\n        没有 → 也要登记，并在 searched 里写清查过哪些、为什么没有可对齐的；'
      + '\n        只有我们自己读写 → 登记成 kind=internal 并写清凭什么说它不对外。'
      + '\n      确实一时做不完就登记进 scripts/standard-formats-baseline.json 并绑方案与到期日')
  }
  for (const identity of byIdentity.keys()) {
    if (hits.has(identity) && !covered.has(identity)) continue
    errors.push(`基线里的债已不存在或已登记：${identity} —— `
      + '请从 scripts/standard-formats-baseline.json 删掉这条（棘轮只减不增）')
  }
  return errors
}
