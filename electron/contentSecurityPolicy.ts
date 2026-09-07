import type { Session } from "electron";

type ContentSecurityPolicyOptions = Readonly<{
  isDev: boolean;
  lowMemoryMode: boolean;
  skipCrossOriginIsolation: boolean;
  skipCrossOriginIsolationForWindowsFrameless: boolean;
  disableCrossOriginIsolation: boolean;
}>;

/**
 * 随包第三方运行时（onnxruntime-web / MediaPipe）的 wasm 加载器是**运行时 fetch 自己的胶水 JS 的**，
 * 所以它必须在 `script-src` 里。给的是 `nomi-local://runtime` 这个**精确 host**，不是整个
 * `nomi-local:` scheme——后者同时伺服项目素材（用户导入的、供应商下载回来的文件），
 * 把它整体放进 script-src 等于说「任何一份素材都可以当脚本执行」。
 * runtime host 只解析随包目录里的白名单文件名（electron/protocol/localRuntimeAssets.ts）。
 */
const RUNTIME_ASSET_SOURCE = "nomi-local://runtime";

function buildContentSecurityPolicy(isDev: boolean): string {
  const common = [
    "default-src 'self' nomi-local:",
    "img-src 'self' nomi-local: https: data: blob:",
    "media-src 'self' nomi-local: https: data: blob:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
  ];
  if (isDev) {
    return [
      ...common,
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: ${RUNTIME_ASSET_SOURCE} http://127.0.0.1:5273`,
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' nomi-local: https: ws://127.0.0.1:5273 http://127.0.0.1:5273 blob:",
    ].join("; ");
  }
  return [
    ...common,
    `script-src 'self' 'wasm-unsafe-eval' blob: ${RUNTIME_ASSET_SOURCE}`,
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' nomi-local: https: blob:",
  ].join("; ");
}

export function installContentSecurityPolicy(targetSession: Session, options: ContentSecurityPolicyOptions): void {
  const csp = buildContentSecurityPolicy(options.isDev);
  const crossOriginIsolationDisabled =
    options.lowMemoryMode ||
    options.skipCrossOriginIsolation ||
    options.skipCrossOriginIsolationForWindowsFrameless ||
    options.disableCrossOriginIsolation;
  targetSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders: Record<string, string[]> = {
      ...details.responseHeaders,
      "Content-Security-Policy": [csp],
    };
    if (!crossOriginIsolationDisabled) {
      responseHeaders["Cross-Origin-Opener-Policy"] = ["same-origin"];
      responseHeaders["Cross-Origin-Embedder-Policy"] = ["require-corp"];
    }
    callback({ responseHeaders });
  });
}
