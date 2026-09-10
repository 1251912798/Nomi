# Attention cue fixture race

📎 交接/日志

Scope: test fixture and assertions only; leave scripts/play-attention-cue.sh unchanged. Roll back the scoped test commit to revert.

Evidence supplied in task brief: PR #664, Linux Contracts run 34291607136, check:claude-hooks failed at attention-cue.node-test.mjs:60. The shared log interleaved `osascript\nafplay\n-e\n/…/nomi-attention.wav\non run argv\n-e\n…`. Main was 8/8 green: scheduling changes expose this recurring fixture race.

Invariant owner: fixture writer/reader. Each invocation owns one file (PID), containing command and NUL-delimited arguments; calls() reads invocation arrays after child completion. No shared append stream or ordering assumption remains. Product notifications stay concurrent with audio.

Same-class scan: afplay and osascript share fixture(); paplay/aplay/powershell.exe use it too and receive the same fix. scripts/pre-push-check.node-test.mjs reads pipe-delimited bypass records; scripts/check-push-bypass.node-test.mjs writes and reads sequential bypass log fixtures and is not affected by this background multi-argument writer. Dependency lifecycle: not applicable, no dependency or production change. No production root-cause contract is introduced for this test-only repair.

Validation: try 30 baseline runs; if no natural failure, temporarily delay old afplay argument writes and osascript startup to expose interleaving, then restore the fixture. Record red output and exact injection below. After repair run 30 repetitions including concurrent same-command calls with multiline/empty arguments, then complete pnpm gates. Linux CI verifies the original platform boundary after PR creation.

Reproduction details: after exploratory repetitions, the isolated 1s/3s probe failed exactly at the old afplay regex (red log). The green probe uses the same delays and split writes to private files and passes, followed by 30 repetitions of the final test. Neither injected delay is retained in the test.
