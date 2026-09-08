// dependency-cruiser 规则集 —— check:boundaries 门岗的唯一真源（R21）。
//
// 这份文件只声明「禁止哪些方向的依赖」。存量违规的冻结名单在
// scripts/boundaries-baseline.json，差集逻辑在 scripts/check-boundaries.mjs。
// 分工：规则=方向禁令（本文件）；基线=存量身份（json）；棘轮=差集报红（check 脚本）。
//
// 为什么规则住这里而不是内联进 check 脚本：这是 dependency-cruiser 的标准配置文件，
// 想手动 debug 时 `pnpm exec depcruise --config .dependency-cruiser.mjs src electron`
// 能直接复用同一套规则，不会和门岗漂移。
//
// 依赖方向的分层背景见 docs/architecture/module-ownership-map.md 与
// docs/audit/2026-08-31-architecture-coupling-audit.md（分析二/五）。

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    // R-B1 渲染层不得直捅主进程。
    // 存量 131 条（62 type-only + 51 value）先由 baseline 冻结、只减不增。
    // 中立契约层 electron/shared/（renderer+main 都可合法 import；实现型主进程模块仍禁止直捅）。
    {
      name: 'src-no-import-electron',
      comment:
        '渲染层（src/）不得直接 import 主进程（electron/）。走 desktop bridge 或中立契约层。存量见 boundaries-baseline.json，只减不增。',
      severity: 'error',
      // 设计实验室的 agent 通路归 R-B5 单独管（硬零，无 baseline）：它是 2026-09-06 起
      // 「UI 交付 = 实验室截图拍板 + 视觉基线绿」的那条通路，不该继承渲染层那 74 条历史欠账的豁免。
      // devlab 本身仍留在 R-B1 之外（它此前整个不在扫描范围内，见 options.exclude 的注释）——
      // 现存的 `catalogLiveness/states/01-listing.tsx -> electron/catalog/*` 三条是被这次纳扫
      // **照出来**的存量欠账，不是本 PR 新增的；把它们塞进 baseline 就是把基线抬高，所以不塞，
      // 留给「catalog 目录哪几个模块该搬进 shared」那次单独收（见 R-B5 注释末尾）。
      from: { path: '^src/', pathNot: '^src/devlab/' },
      to: { path: '^electron/', pathNot: '^electron/shared/' },
    },

    // R-B5 设计实验室只许吃中立契约层（当前 0，硬零，无 baseline）。
    //
    // 起因是一次真的白屏（#614）：`laneDrivenFixtures.ts` import 了主进程的
    // `electron/agentLane/laneProjection.mts`，而那个模块当时**运行时** import `@earendil-works/pi-ai`，
    // 于是整个 pi SDK（含它内部那条 CJS 的 `partial-json`）被拖进浏览器 bundle，实验室页面挂掉，
    // 只能靠 `vite.config.ts` 的 `optimizeDeps` 兜一层。止血贴治的是症状——一个人下次再
    // import 一个主进程实现文件，同样的白屏会以另一个包的名义回来（P2）。
    // 这条规则治的是那条边：实验室与渲染层同一条 bundle，能进浏览器的只有 `electron/shared/`。
    //
    // `import type` 不在此列：类型编译后一行不剩，devlab 直接 `import type` pi 的快照形状
    // 是它作为「新通路第一个消费者」的本分。所以规则靠 dependency-cruiser 的
    // `dependencyTypesNot: ['type-only']` 把纯类型边放掉，只拦**值导入**。
    //
    // `to` 只列 agent 那三个实现目录，不是整个 `electron/` 去掉 shared：把它纳扫的第一跑
    // 照出了三条存量欠账（`catalogLiveness/states/01-listing.tsx` 值导入 `electron/catalog/`
    // 的 apimartTexts / seedModelIdentity / modelListReconcile）。那三条要么改实验室、要么把
    // catalog 那几个模块搬进 shared，都不是本 PR 的范围；而把它们写进 baseline 等于抬高基线。
    // 所以这条规则今天先在 agent 通路上立成**硬零**，catalog 那三条另开一单收——
    // 一条今天就能守住的硬零，好过一条永远红着没人看的宽规则（R17）。
    {
      name: 'devlab-no-import-electron-impl',
      comment:
        '设计实验室（src/devlab/）只许 import src/ 与中立契约层 electron/shared/。主进程 agent 实现目录（agentLane / harness / projectAgentHost）禁止值导入——它们会把 pi SDK 等主进程依赖拖进浏览器 bundle。当前零违规，硬零。',
      severity: 'error',
      from: { path: '^src/devlab/' },
      to: {
        path: '^electron/(agentLane|harness|projectAgentHost)/',
        pathNot: '^electron/shared/',
        dependencyTypesNot: ['type-only'],
      },
    },

    // R-B2 主进程不得反向 import 渲染层（当前 0，硬零，无 baseline）。
    {
      name: 'electron-no-import-src',
      comment: '主进程（electron/）禁止反向 import 渲染层（src/）。当前零违规，硬零。',
      severity: 'error',
      from: { path: '^electron/' },
      to: { path: '^src/' },
    },

    // R-B3 UI 不得捅门岗脚本（当前 0，硬零，无 baseline）。
    {
      name: 'src-no-import-scripts',
      comment: '渲染层（src/）禁止 import 门岗脚本（scripts/）。当前零违规，硬零。',
      severity: 'error',
      from: { path: '^src/' },
      to: { path: '^scripts/' },
    },

    // R-B4 禁新增「完全静态」循环。
    // viaOnly dependencyTypesNot=[dynamic-import,type-only]：只认「每条环边都不是懒加载、
    // 也不是纯类型」的硬环——即真·加载顺序风险。软的 499 个 lazy import() 环故意不入规则，
    // 避免门岗永红被无视（R17 教训：被忽略的门岗等于不存在）。存量 37 个硬环由 baseline 冻结。
    {
      name: 'no-new-static-circular',
      comment:
        '禁止新增完全静态循环依赖（每条环边都非 dynamic-import / 非 type-only）。存量 37 个硬环见 boundaries-baseline.json，只减不增；软的懒加载环不算。',
      severity: 'error',
      from: {},
      to: {
        circular: true,
        viaOnly: { dependencyTypesNot: ['dynamic-import', 'type-only'] },
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    // 含 type-only 边（渲染层伸手拿 electron 类型也要拦）；dynamic-import 单独标记以分软硬环。
    tsPreCompilationDeps: true,
    moduleSystems: ['es6', 'cjs'],
    exclude: {
      // 只扫生产码：剔除测试 / testSupport / dev。
      // **devlab 不再剔除**（2026-09-08，阶段 4 前置 ④）：自 2026-09-06 起「UI 交付 = 设计实验室
      // 截图拍板 + 视觉基线绿」，实验室就是生产 UI 的取景台，和渲染层进同一条 bundle——
      // 把它排除在门岗之外，等于让唯一一条能把主进程依赖拖进浏览器的路没人看着（#614 白屏）。
      path: '(node_modules|\\.test\\.|\\.node-test\\.|/testSupport/|/dev/)',
    },
  },
}
