#!/bin/bash
# PostToolUse check after a Write/Edit/MultiEdit (2026-09-22; designed in
# docs/plans/research-2026-09-16/agent-ergonomics.md item 9). The guard suite
# runs at `git commit`, minutes after the edit that broke it; the two cheapest
# checks run here, right after the edit, and report FAILURES ONLY:
#
#   js/**/*.js                  → node --check <file>          (< 0.2 s)
#   js/circuits/<id>.js and
#   js/circuits/scenery/<id>.js → node tools/track/verify-track.cjs <id>  (~2 s,
#                                 the documented circuit gate)
#
# Exit 2 puts stderr in front of the model (the edit has already landed; this
# is the next thing it reads). Silent on pass. Skipped while a Playwright run
# is live (the edit hook already refuses those edits) and for every path this
# does not name. Registered in .claude/settings.json under PostToolUse.

INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | python3 -c '
import json,sys
try:
    ti=json.load(sys.stdin).get("tool_input") or {}
    print(ti.get("file_path") or ti.get("notebook_path") or "")
except Exception:
    print("")
')
[ -n "$FILE" ] || exit 0
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
case "$FILE" in
  "$ROOT"/js/*.js) ;;
  *) exit 0 ;;
esac
[ -f "$FILE" ] || exit 0
REL="${FILE#"$ROOT"/}"

if ps -eo args 2>/dev/null | grep -Eq 'playwright(\.js)?\s+test\b|run-playwright\.mjs'; then exit 0; fi

if ! out=$(cd "$ROOT" && node --check "$FILE" 2>&1); then
  printf 'post-edit-check: %s does not parse:\n%s\n' "$REL" "$(printf '%s' "$out" | head -8)" >&2
  exit 2
fi

id=""
case "$REL" in
  js/circuits/scenery/*.js) id=$(basename "$REL" .js) ;;
  js/circuits/*.js)         id=$(basename "$REL" .js) ;;
esac
if [ -n "$id" ] && [ -f "$ROOT/tools/track/verify-track.cjs" ]; then
  if ! out=$(cd "$ROOT" && timeout 25 node tools/track/verify-track.cjs "$id" 2>&1); then
    printf 'post-edit-check: verify-track %s is red after this edit:\n%s\n' "$id" "$(printf '%s' "$out" | grep -Ev '^\s*$' | tail -12)" >&2
    exit 2
  fi
fi
exit 0
