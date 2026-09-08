#!/usr/bin/env bash
# Notification input is untrusted JSON, never shell/AppleScript source.
command -v node >/dev/null 2>&1 || exit 0
hook_dir="$(cd -- "${BASH_SOURCE[0]%/*}" && pwd)" || exit 0
node -e '
  const fs = require("node:fs")
  const { spawnSync } = require("node:child_process")
  try {
    const input = JSON.parse(fs.readFileSync(0, "utf8"))
    if (input.hook_event_name !== "Notification") process.exit(0)
    if (!/^(permission_prompt|idle_prompt|elicitation_dialog|elicitation_url_dialog|agent_needs_input)$/.test(input.notification_type)) process.exit(0)
    const args = [process.argv[1]]
    if (typeof input.message === "string" && input.message.trim()) args.push("--reason", input.message)
    spawnSync("bash", args, { stdio: "ignore", timeout: 8000 })
  } catch { /* An optional cue never blocks the session. */ }
' "$hook_dir/../play-attention-cue.sh" 2>/dev/null
exit 0
