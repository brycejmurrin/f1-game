#!/bin/bash
# UserPromptSubmit hook (advisory, retro 2026-10-17 finding 3, H3): a UI fixer sat 7 h and $100
# on an uncommitted diff "until the screenshots look right". AGENTS.md rule 12 says commit WIP
# to the topic branch at every checkpoint. On a cursor/* branch with a dirty tree (the synced
# .claude/memory files and artifacts/ excluded) whose last commit is over an hour old, print
# one reminder (stdout reaches the model); at most once per 30 minutes. Never blocks: exit 0.
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cat >/dev/null 2>&1 || true
BR=$(git -C "$ROOT" branch --show-current 2>/dev/null)
case "$BR" in cursor/*) ;; *) exit 0 ;; esac
[ -n "$(git -C "$ROOT" diff --stat HEAD -- . ':(exclude).claude/memory' ':(exclude)artifacts' 2>/dev/null)" ] || exit 0
NOW=$(date +%s)
LAST=$(git -C "$ROOT" log -1 --format=%ct 2>/dev/null || echo "$NOW")
AGE=$(( NOW - ${LAST:-$NOW} ))
LIMIT="${APEX_UI_FIXER_AGE:-3600}"
[ "$AGE" -gt "$LIMIT" ] || exit 0
STAMP="$ROOT/artifacts/.ui-fixer-uncommitted"
if [ -f "$STAMP" ] && [ $(( NOW - $(stat -c %Y "$STAMP" 2>/dev/null || echo 0) )) -lt 1800 ]; then exit 0; fi
mkdir -p "$ROOT/artifacts" 2>/dev/null && : > "$STAMP"
echo "uncommitted diff on $BR and the last commit is $(( AGE / 60 )) min old: commit WIP to the topic branch now and push at the next verified checkpoint (AGENTS.md rule 12). A reclaimed container loses it."
exit 0
