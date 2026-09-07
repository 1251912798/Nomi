// 不受信本地内容（Agent 手写的 HTML/SVG、用户导入的素材、生成回来的文件）的**唯一**策略定义。
// 主进程按它下发响应头，渲染层按它给沙箱文档注入 meta——一份定义，两处消费，不许各写一份。
//
// 为什么产物必须自带一份比宿主更紧的策略：宿主那份放行 `https:`（模型请求、远端预览要用），
// 产物一个字节都不许出站。两个人群共用一份策略时，frame 这个开关只有两个都不对的挡位：
// 关死 → 产物白板；放开 → 产物继承宿主的出网权。

/**
 * 沙箱产物文档的策略。
 *
 * 三层保证，缺一层都不放行：
 *  1. **不给宿主能力**：窗口 `contextIsolation:true` + `nodeIntegration:false`（main.ts:309-312），
 *     iframe 不注入 preload、拿不到 `window.nomi` IPC 桥；`setWindowOpenHandler` 一律 deny 新窗口
 *     （main.ts:325-331），`will-navigate` 把任何离开渲染入口的顶层导航拦下（main.ts:336-340）。
 *  2. **不给同源**：iframe 是 `sandbox="allow-scripts"`（**无** allow-same-origin），origin 是
 *     opaque(null)——读不到宿主 DOM/storage/cookie，也没有 allow-top-navigation / allow-popups /
 *     allow-forms，脚本只能在自己的笼子里动。真机实测产物脚本自报 `window.origin === "null"`。
 *  3. **不给网络**：本策略 `default-src 'none'` 收口一切取数（connect/fetch/XHR/WebSocket、外部
 *     script、外部 style、外部字体全断），只留 `'unsafe-inline'` 的脚本与样式让手写动画能跑；
 *     `form-action 'none'` 断表单外发、`base-uri 'none'` 断 base 劫持、`frame-src 'none'` 不许再套娃。
 *     图片/媒体只认 `data:`/`blob:`（产物是自包含单文件，不该去翻项目里别的资产）。
 *     阳性对照实测：带这份策略时产物的 `<img src=https://…>` 与 `fetch(https://…)` 分别报出
 *     img-src / connect-src 违规；去掉它，同一张图就加载了——**拦住出站的正是这份策略**，
 *     不是跨源默认行为（跨源只挡得住 fetch，挡不住 `<img>` 这种 no-cors 请求）。
 *
 * 即：产物**能动**（inline script/style + 动画），但**碰不到宿主、也出不去网**。
 *
 * 注：`frame-ancestors` / `sandbox` 两条指令 meta 形式不生效，本策略刻意不依赖它们——
 * 「谁能嵌它」由宿主策略的 frame-src 管，「它有多少权限」由 iframe 的 sandbox 属性管。
 */
export const LOCAL_ARTIFACT_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "object-src 'none'",
].join("; ");

/** 该 URL 是否由 nomi-local 协议提供（→ 用产物策略，不用宿主策略）。 */
export function isLocalArtifactUrl(url: string): boolean {
  return url.toLowerCase().startsWith("nomi-local:");
}
