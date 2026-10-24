#!/usr/bin/env bash
# PreToolUse hook（命中 Bash 里的推送命令）：**push 绕口留痕**——2026-10-24 起这是它唯一的职责（R11 / PAR）。
#
# 推送前把关的是 git 自己的 pre-push 钩子（scripts/git-hook.mjs → scripts/pre-push-contracts.mjs：
# 按改动选出的快检，几分钟内跑完，没有绕过开关）；完整门岗以 CI 为准，合并只认 CI 全绿 + 合并前扫描
# + main 上的收据。2026-10-24 之前这里还要求本树有一枚本机门岗戳（本机 `pnpm run gates` 全过才盖）
# 才放行有代码改动的推送；用户拍板「改成 CI 把关：推分支前本机只跑快检，完整门岗交给 CI，合并照旧只认
# CI 全绿和 main 上的收据」，戳的判定、签发方与所有读方同一个提交删除（P1）。
# 设计卡：docs/plan/2026-10-24-push-gate-ci.md。
#
# 规则：
#  · 命令里没有推送 → 放行。引号里的词组不算（`echo "git push --no-verify"` 不是推送）。
#  · 普通推送，不管写成 `git -C <树> push`、`cd A && cd B && git push` 还是 `git -c k=v push` → 放行：
#    快检由 git 在推送那一刻自己跑，这里不再判第二次「过没过」，也不读任何本机凭据。
#  · 跳过 git 钩子的推送写法（`--no-verify`、`-c core.hooksPath=…` 及其环境变量形式）→ 照常放行，
#    但在**每一棵被推的树**的 `.claude/push-bypass.log` 记一条，交 `check:push-bypass` 审计。
#    快检每次推送都跑 check:push-bypass，所以没确认的绕口会拦下这棵树的下一次正常推送，直到有人看过并 `--accept`。
#    为什么留痕而不拒绝：推送阶段跳过快检的代价至多是多一轮 CI（CI 全绿才合并，进不了 main），
#    而快检自己坏了 / 本机环境不对时，推上去交给 CI 判是合法出路；提交阶段那边没有合法场景，所以是拒绝
#    （docs/lessons/commit-bypass-must-be-blocked-not-audited.md）。
#  · 不带新内容的推送（HEAD 的提交都已在某个远端跟踪分支上：打 tag、推远端已有的提交）不记：
#    没有新东西上远端，跳过快检也漏不掉任何检查（判据 `--not --remotes`，2026-09-27 发版 tag 那份合同立的）。
#  · fail-closed 只剩一种：**有绕口写法、却归因不了**推的是哪棵树（命令理解层缺失 / 引号不配对 /
#    `--git-dir` `--work-tree`）→ exit 2。记不下来的绕口不放行；没有绕口写法的一律放行。
#
# 「推不推、推哪棵树」不用正则猜（2026-09-02 实测四个方向全漏：`git -C` / `git -c` / 多个 cd /
# 引号里的词组），交给两个 Bash 闸门共用的词法层 _bash-command-analysis.sh（shlex）。
set +e

INPUT="$(cat)"

# 原始命令只用来判「有没有绕口写法」，不用来归因：目标树一律取词法层解析出的 TARGETS。
_raw_cmd="$(printf '%s' "$INPUT" | python3 -c '
import sys,json
try: print(json.load(sys.stdin).get("tool_input",{}).get("command",""))
except: print("")
' 2>/dev/null)"

has_bypass() {
  printf '%s' "$_raw_cmd" | grep -qE 'core\.hooksPath|--no-verify'
}

# 读不懂命令时的兜底：直接在原始载荷上找（python3 都起不来时 _raw_cmd 是空的，载荷还在）。
smells_like_bypass_push() {
  printf '%s' "$INPUT" | grep -q 'push' && printf '%s' "$INPUT" | grep -qE 'core\.hooksPath|--no-verify'
}

block() {
  cat >&2 <<EOF
⛔ push 绕口留痕（R11 / PAR）：$1

  这条推送跳过了 git 的 pre-push 快检（--no-verify / core.hooksPath），可是认不出推的是哪棵树，
  绕口记不进那棵树的 .claude/push-bypass.log——记不下来的绕口不放行。
  正确做法：去掉跳过钩子的写法正常推（快检自动跑，几分钟）。确实要绕，就在目标树里直接推
  （cd <那棵树> && git push --no-verify …），留痕记进那棵树，它下一次推送前 check:push-bypass 会要求确认。
EOF
  exit 2
}

ANALYSIS_LIB="$(dirname "$0")/_bash-command-analysis.sh"
# 共用层缺失 = 失去理解命令的能力（它随仓库走，缺了说明工作树不完整）。有绕口写法就拦，否则放行。
if [ ! -f "$ANALYSIS_LIB" ]; then
  smells_like_bypass_push && block "命令理解层 $ANALYSIS_LIB 缺失，读不懂这条命令推的是哪棵树。"
  exit 0
fi
# shellcheck source=/dev/null
. "$ANALYSIS_LIB"

PARSED="$(printf '%s' "$INPUT" | analyse_bash_command)"
STATUS="$(printf '%s\n' "$PARSED" | sed -n '1p')"
# 只取 push 那些行的目录列（第 2 列）。
TARGETS="$(printf '%s\n' "$PARSED" | sed -n '3,$p' | awk -F'\t' '$1=="push"{print $2}' | sed '/^$/d')"

# 词法分析失败（引号不配对等）= 读不懂。有绕口写法就拦，否则放行。
if [ "$STATUS" != "ok" ]; then
  smells_like_bypass_push && block "这条命令无法可靠解析（引号不配对？）。"
  exit 0
fi

[ -n "$TARGETS" ] || exit 0   # 没有推送
has_bypass || exit 0          # 普通推送：git 的 pre-push 快检会自己跑

# 先确认每个目标都能归因，再落笔——不留「记了一半」的现场。
while IFS= read -r _target; do
  [ "$_target" = "?" ] && block "命令用 --git-dir/--work-tree 指定了推送目标，无法可靠还原是哪棵树。"
done <<EOF
$TARGETS
EOF

_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date +%Y-%m-%dT%H:%M:%SZ)"
_cmd_short="$(printf '%s' "$_raw_cmd" | head -c 200)"
while IFS= read -r _target; do
  [ -n "$_target" ] || continue
  _target_root="$(git -C "$_target" rev-parse --show-toplevel 2>/dev/null || echo '')"
  [ -n "$_target_root" ] || continue   # 不在 git 仓库里：这次推送本身就会失败，没有可记的树
  # 不带新内容：HEAD 上没有一个提交是「所有远端跟踪分支都还不认识」的。没有远端跟踪分支时不算（照记）。
  if [ -z "$(git -C "$_target_root" rev-list --max-count=1 HEAD --not --remotes 2>/dev/null)" ] &&
    git -C "$_target_root" for-each-ref --count=1 refs/remotes 2>/dev/null | grep -q .; then
    continue
  fi
  _br="$(git -C "$_target_root" branch --show-current 2>/dev/null || echo '')"
  _sha="$(git -C "$_target_root" rev-parse HEAD 2>/dev/null || echo '')"
  _bypass_log="$_target_root/.claude/push-bypass.log"
  mkdir -p "$_target_root/.claude"
  printf '%s|bypass|branch=%s|sha=%s|worktree=%s|cmd=%s|confirmed=no\n' \
    "$_ts" "$_br" "$_sha" "$_target_root" "$_cmd_short" >> "$_bypass_log"
  printf '⚠️  push 绕口已记录（%s）：这次推送跳过了 git 的 pre-push 快检，照常执行；这棵树下一次正常推送时，快检里的 check:push-bypass 会拦下，看过之后用 `node ./scripts/check-push-bypass.mjs --accept <sha>` 确认。\n' \
    "$_bypass_log" >&2
done <<EOF
$TARGETS
EOF

exit 0
