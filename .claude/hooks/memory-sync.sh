#!/bin/bash
# memory-sync.sh restore — put the tracked auto memory (.claude/memory/) where the CLI reads it, at the START of a
# session (SessionStart). One way: the repo copy fills the live dir. A cloud container starts empty every time, and
# the CLI turns auto memory off in remote sessions unless CLAUDE_CODE_DISABLE_AUTO_MEMORY is falsy (settings.json
# sets "0"); `autoMemoryDirectory` cannot point here from a checked-in settings file. The live dir is keyed on the
# MAIN checkout (every worktree shares one), non-alphanumerics replaced by '-'.
#
# Only on a new session: the hook input's `source` (https://code.claude.com/docs/en/hooks §SessionStart: startup,
# resume, clear, compact, fork) must be "startup" when it is given, so a resume or a compaction never rewrites a
# memory written mid-session. And a live file changed AFTER the last restore (newer than $LIVE/.restored) is kept,
# not overwritten; the line names it, so a memory worth keeping is copied into .claude/memory/ and committed
# (`node tools/env/apex-memory.mjs`, docs/notes/AGENT-MEMORY.md). No save back. Cloud only
# (CLAUDE_CODE_REMOTE=true) unless APEX_MEMORY_SYNC=1: a laptop's live dir already persists and holds personal
# memories that must not be overwritten. Always exits 0.
[ "${1:-restore}" = restore ] || exit 0
INPUT=""
[ -t 0 ] || INPUT=$(timeout 2 cat 2>/dev/null)
SOURCE=$(printf '%s' "$INPUT" | python3 -c 'import json,sys
try: print(str(json.load(sys.stdin).get("source") or ""))
except Exception: print("")' 2>/dev/null)
[ -z "$SOURCE" ] || [ "$SOURCE" = startup ] || exit 0
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || [ "${APEX_MEMORY_SYNC:-}" = "1" ] || exit 0
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
COMMON=$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
MAIN=$([ -n "$COMMON" ] && dirname "$COMMON" || echo "$ROOT")
LIVE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/$(printf '%s' "$MAIN" | sed 's/[^A-Za-z0-9]/-/g')/memory"
REPO="$MAIN/.claude/memory"
[ -d "$REPO" ] || exit 0
mkdir -p "$LIVE" 2>/dev/null || exit 0
STAMP="$LIVE/.restored"
n=0; kept=()
for f in "$REPO"/*.md; do
  [ -f "$f" ] || continue
  live="$LIVE/$(basename "$f")"
  cmp -s "$f" "$live" && continue
  if [ -f "$live" ] && [ -f "$STAMP" ] && [ "$live" -nt "$STAMP" ]; then kept+=("$(basename "$f")"); continue; fi
  cp -f "$f" "$LIVE/" 2>/dev/null && n=$((n + 1))
done
touch "$STAMP" 2>/dev/null
msg="memory: $n in from .claude/memory/ (repo fills the live dir; edit memories there)"
[ ${#kept[@]} -gt 0 ] && msg="$msg; KEPT live edits newer than the last restore, differing from the repo: ${kept[*]} (copy into .claude/memory/ and commit to keep them)"
echo "$msg"
exit 0
