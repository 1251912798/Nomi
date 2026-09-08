#!/usr/bin/env bash
# Best-effort local cue: missing audio devices/players must never block the assistant.
cue_dir="$(cd -- "${BASH_SOURCE[0]%/*}/attention-cue" && pwd)" || exit 0
candidate=b # Selected four-note, falling wooden cue.
reason='请看一下，有个决定需要你。'
while [ "$#" -gt 0 ]; do
  case "$1" in
    --reason) [ "$#" -ge 2 ] || exit 0; reason="$2"; shift 2 ;;
    --candidate) [ "$#" -ge 2 ] || exit 0; candidate="$2"; shift 2 ;;
    *) exit 0 ;;
  esac
done
case "$candidate" in a|b|c) ;; *) exit 0 ;; esac
cue_file="$cue_dir/candidates/$candidate.wav"
[ "$candidate" != b ] || cue_file="$cue_dir/../../assets/sound/nomi-attention.wav"
[ -f "$cue_file" ] || exit 0
case "$(uname -s 2>/dev/null)" in
  Darwin)
    # Pass user text as data, never splice it into AppleScript source.
    if command -v osascript >/dev/null 2>&1; then
      osascript -e 'on run argv' -e 'display notification (item 1 of argv) with title "Nomi 需要你"' -e 'end run' "$reason" >/dev/null 2>&1 &
      notification_pid=$!
    fi
    if command -v afplay >/dev/null 2>&1; then afplay "$cue_file" >/dev/null 2>&1 || :; fi
    if [ -n "${notification_pid:-}" ]; then wait "$notification_pid" 2>/dev/null || :; fi
    ;;
  Linux)
    if command -v paplay >/dev/null 2>&1; then paplay "$cue_file" >/dev/null 2>&1 || :
    elif command -v aplay >/dev/null 2>&1; then aplay "$cue_file" >/dev/null 2>&1 || :; fi
    ;;
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    if command -v cygpath >/dev/null 2>&1; then cue_file="$(cygpath -w "$cue_file")"; fi
    if command -v powershell.exe >/dev/null 2>&1; then
      NOMI_CUE_FILE="$cue_file" powershell.exe -NoProfile -NonInteractive -Command \
        '$player = New-Object System.Media.SoundPlayer; $player.SoundLocation = $env:NOMI_CUE_FILE; $player.PlaySync(); $player.Dispose()' >/dev/null 2>&1 || :
    fi
    ;;
esac
exit 0
