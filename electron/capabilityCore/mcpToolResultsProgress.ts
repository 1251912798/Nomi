import type { ResultLocale } from "./mcpToolResults";

const L = (locale: ResultLocale, zh: string, en: string): string => (locale === "en" ? en : zh);
const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** A1 · 长任务的进度起始帧（参数回显版「已受理 · kling · video」）；null = 该工具不发。 */
export function buildProgressStartMessage(
  toolName: string,
  args: Record<string, unknown>,
  locale: ResultLocale = "zh-CN",
): string | null {
  if (toolName === "nomi_run_start") {
    return [L(locale, "正在创建制作草稿", "creating production draft"), str(args.playbook) || null]
      .filter(Boolean)
      .join(" · ");
  }
  return null;
}
