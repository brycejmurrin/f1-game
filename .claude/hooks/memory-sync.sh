#!/bin/bash
# memory-sync.sh restore — put the tracked auto memory (.claude/memory/) where
# the CLI reads it, once, at SessionStart (settings.json). One way: the repo
# wins. A cloud container starts empty every time, and the CLI turns auto
# memory off in remote sessions unless CLAUDE_CODE_DISABLE_AUTO_MEMORY is
# falsy (settings.json sets "0"); `autoMemoryDirectory` cannot point here from
# a checked-in settings file. The live dir is keyed on the MAIN checkout (every
# worktree shares one), non-alphanumerics replaced by '-'.
#
# No save (the three-way sync, its baseline dir and the index mark that hid the
# files from git status went with plan §4.9): a memory that should outlive the session is edited in
# .claude/memory/ with `node tools/env/apex-memory.mjs` and committed like any
# file (docs/notes/AGENT-MEMORY.md). Cloud only (CLAUDE_CODE_REMOTE=true) unless
# APEX_MEMORY_SYNC=1: a laptop's live dir already persists and holds personal
# memories that must not be overwritten. Always exits 0.
[ "${1:-restore}" = restore ] || exit 0
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || [ "${APEX_MEMORY_SYNC:-}" = "1" ] || exit 0
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
COMMON=$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
MAIN=$([ -n "$COMMON" ] && dirname "$COMMON" || echo "$ROOT")
LIVE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/$(printf '%s' "$MAIN" | sed 's/[^A-Za-z0-9]/-/g')/memory"
REPO="$MAIN/.claude/memory"
[ -d "$REPO" ] || exit 0
mkdir -p "$LIVE" 2>/dev/null || exit 0
n=0
for f in "$REPO"/*.md; do
  [ -f "$f" ] || continue
  if ! cmp -s "$f" "$LIVE/$(basename "$f")"; then cp -f "$f" "$LIVE/" 2>/dev/null && n=$((n + 1)); fi
done
echo "memory: $n in from .claude/memory/ (repo wins; edit memories there)"
exit 0
