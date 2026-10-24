// 主进程「正忙」探针（经 launchNomiApp 的 mainRequire 在主入口前加载）：给 playwright-main-evaluate.e2e.mjs 用。
//
// 它要造的条件只有一个：主进程 JS 正在跑一段长的同步代码时，Playwright 的主进程 evaluate 到达。
// Node 调试器此时用中断插队执行这条 evaluate，回包要等这段同步代码跑完；这期间一次 GC 就能把
// V8 弱持有的结果 promise 收掉（"Promise was collected"，Playwright 改写成「Execution context was destroyed」）。
// 真实场景是打包 App 启动后主进程最忙的那一两秒；这里把它做成确定性的：开关打开后主进程几乎一直忙、一直分配。
let timer = null

globalThis.__nomiBusyMainProbe = {
  start(sliceMs = 250) {
    if (timer) return true
    timer = setInterval(() => {
      const end = Date.now() + sliceMs
      let keep = null
      while (Date.now() < end) keep = new Array(4096).fill(0)
      return keep
    }, 5)
    return true
  },
  stop() {
    if (timer) clearInterval(timer)
    timer = null
    return true
  },
}
