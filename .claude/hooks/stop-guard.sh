#!/bin/bash
# Stop hook (2026-09-22; designed in docs/plans/research-2026-09-16/
# agent-ergonomics.md item 3, narrowed). AGENTS.md §Verification 4 says
# background the run and 5 says anchor on the reporter's terminal line — the
# failure this catches is the turn that ENDS with a browser group still
# running and its verdict never read. Exactly one condition, exactly one nudge:
#
#   a `playwright test` / run-playwright.mjs process is live, and this run has
#   not nudged before → exit 2 with the reason (the model gets one more turn
#   to name the running group, its log and the not-yet-read verdict, or to
#   wait on `test-bg.mjs --status`).
#
# Never twice: a stamp keyed on the live run's log name lets the second Stop
# through, `stop_hook_active` (Claude is already continuing because of a stop
# hook) lets it through, and `touch .claude/allow-stop` is the escape hatch.
# Registered in .claude/settings.json under Stop.

INPUT=$(cat)
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
[ -f "$ROOT/.claude/allow-stop" ] && exit 0
if printf '%s' "$INPUT" | python3 -c '
import json,sys
try:
    sys.exit(0 if json.load(sys.stdin).get("stop_hook_active") else 1)
except Exception:
    sys.exit(1)
'; then exit 0; fi

# `run-playwright.mjs --list` is spec SELECTION (deploy.mjs and select-specs
# run it for a second); only a run that will drive a browser counts. The first
# live firing (2026-09-22) was exactly that false positive, mid-deploy.
#
# Scoped to THIS checkout by /proc/<pid>/cwd (protect-files.sh does the same):
# another worktree's run is not this turn's unread verdict. The stamp is keyed
# on the live PID and its start time, not on the newest log's NAME — keyed by
# name, the second smoke run of a session was never nudged, and the message
# could name a finished group's log (2026-09-24).
read -r live_pid live_log < <(python3 "$ROOT/.claude/hooks/live-run.py" "$ROOT")
[ -n "$live_pid" ] || exit 0

key=$(printf '%s' "$live_pid" | md5sum | cut -c1-12)
mkdir -p "$ROOT/artifacts/.stop-guard"
stamp="$ROOT/artifacts/.stop-guard/$key"
[ -f "$stamp" ] && exit 0
: > "$stamp"
[ "$live_log" = "-" ] && live_log=""
group=$(basename "${live_log:-unknown}" .log)
echo "A browser run is still live (group: $group; log: ${live_log:-not started by test-bg — see ps}). Before ending the turn, either read its verdict (grep -E '^= (run (passed|failed|timedout|interrupted)|bg exit)' on the log, or node tools/ci/test-bg.mjs --status) or say plainly which group is running, where its log is, and that its result is NOT yet read. This nudge fires once per run; touch .claude/allow-stop to silence it." >&2
exit 2
