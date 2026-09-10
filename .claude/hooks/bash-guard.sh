#!/bin/bash
# PreToolUse guard for Bash. Two AGENTS.md rules made deterministic:
#
#  §Verification 3 — `git commit` runs `npm run test:guards` first (11 s) and
#    a red result blocks the commit. Prefix the command with APEX_SKIP_GUARDS=1
#    only when the guards themselves are what you are fixing.
#  §Verification 6/7 — a test-bg run is stopped with `test-bg.mjs --stop`,
#    never by PID; `pkill -f` / `killall` against chrome, node or playwright
#    matches your own shell and orphans browsers. Kill orphan Chrome by a
#    listed PID (`ps -eo pid,comm | awk '$2=="chrome"{print $1}'`) instead.
#
# Exit 2 blocks with the reason on stderr; exit 0 lets the normal permission
# flow decide.

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | python3 -c '
import json,sys
try:
    print((json.load(sys.stdin).get("tool_input") or {}).get("command") or "")
except Exception:
    print("")
')
[ -z "$CMD" ] && exit 0
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

# --- pkill -f / killall on the browser or test tree ---------------------------
# Command position only (start of line or after ; & | ( ), so a commit message
# or echo that merely MENTIONS the words is not blocked.
if printf '%s' "$CMD" | grep -Eq '(^|[;&|(][[:space:]]*)(pkill[[:space:]]+(-[a-zA-Z]*f[a-zA-Z]*|--full)|killall)[[:space:]]' \
   && printf '%s' "$CMD" | grep -Eiq 'chrom|playwright|node|test-bg|npm'; then
  echo "BLOCKED: pkill -f / killall matches your own shell (its command line contains the pattern) and orphans Playwright's browsers. Stop a run with 'node tools/ci/test-bg.mjs --stop'; kill orphan Chrome by PID from a listed set: ps -eo pid,comm | awk '\$2==\"chrome\"{print \$1}'" >&2
  exit 2
fi

# --- kill <pid> of a test-bg supervisor / runner --------------------------------
if printf '%s' "$CMD" | grep -Eq '(^|[;&|(][[:space:]]*)kill([[:space:]]+-[A-Za-z0-9]+)*[[:space:]]+[0-9]'; then
  for pid in $(printf '%s' "$CMD" | grep -Eo '(^|[[:space:]])[0-9]+' | tr -d ' '); do
    [ -r "/proc/$pid/cmdline" ] || continue
    line=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)
    case "$line" in
      *test-bg.mjs*|*run-playwright*|*"npm run test:"*|*"playwright test"*)
        echo "BLOCKED: pid $pid is part of a test-bg run ($line). A bare kill orphans its browsers. Use 'node tools/ci/test-bg.mjs --stop' (or '--stop --sweep' when the supervisor is already dead)." >&2
        exit 2 ;;
    esac
  done
fi

# --- guards before git commit ---------------------------------------------------
if printf '%s' "$CMD" | grep -Eq '(^|[;&|(][[:space:]]*)git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+commit([[:space:]]|$)' \
   && ! printf '%s' "$CMD" | grep -Eq -- '--dry-run|APEX_SKIP_GUARDS=1'; then
  if [ ! -d "$ROOT/node_modules" ]; then
    echo "BLOCKED: node_modules is missing, so 'npm run test:guards' cannot run before this commit. Run the SessionStart install (bash tools/env/cloud-agent-install.sh) first." >&2
    exit 2
  fi
  mkdir -p "$ROOT/artifacts"
  LOG="$ROOT/artifacts/pre-commit-guards.log"
  if ! (cd "$ROOT" && npm run --silent test:guards >"$LOG" 2>&1); then
    echo "BLOCKED: npm run test:guards is red — AGENTS.md §Verification 3 forbids committing on a red guard. Last lines of $LOG:" >&2
    grep -E 'not ok|Error|expected|actual|✖' "$LOG" | tail -20 >&2
    echo "Fix the guard (or prefix with APEX_SKIP_GUARDS=1 when the guards themselves are the change under test)." >&2
    exit 2
  fi
fi
exit 0
