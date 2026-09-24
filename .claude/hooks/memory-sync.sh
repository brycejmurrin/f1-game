#!/bin/bash
# memory-sync.sh restore|save — make Claude Code's AUTO MEMORY survive a cloud
# container (2026-09-24; research in docs/notes/AGENT-MEMORY.md).
#
# Auto memory lives at <config>/projects/<sanitized repo root>/memory/ — a
# MEMORY.md index plus one topic file per memory — and is machine-local. A cloud
# session's container is reclaimed afterwards, so it started empty every time;
# the CLI also turns auto memory OFF in remote sessions unless
# CLAUDE_CODE_DISABLE_AUTO_MEMORY is falsy (.claude/settings.json sets "0").
# `autoMemoryDirectory` cannot fix the location from here: the CLI ignores it in
# the checked-in settings and requires an absolute path. So the tracked copy is
# .claude/memory/ and this hook moves files between the two:
#
#   restore (SessionStart, from session-start.sh): repo → live dir, never
#           overwriting a live file; records what it restored.
#   save    (PostToolUse on Write|Edit, and Stop): live dir → repo, so the
#           memories ride the session's next commit; a file restored at start
#           and since deleted by Claude is deleted from the repo too.
#
# Cloud only (CLAUDE_CODE_REMOTE=true) unless APEX_MEMORY_SYNC=1: on a laptop the
# live dir already persists and holds personal memories that must not be copied
# into a shared repo. Always exits 0 — a memory hiccup never blocks a turn.

MODE="${1:-save}"
INPUT=$(cat 2>/dev/null || true)
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || [ "${APEX_MEMORY_SYNC:-}" = "1" ] || exit 0

# The live dir is keyed on the MAIN checkout (every worktree of a repo shares
# one), with every non-alphanumeric character replaced by '-'.
COMMON=$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
MAIN=$([ -n "$COMMON" ] && dirname "$COMMON" || echo "$ROOT")
LIVE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/$(printf '%s' "$MAIN" | sed 's/[^A-Za-z0-9]/-/g')/memory"
REPO="$MAIN/.claude/memory"
MANIFEST="$MAIN/artifacts/.memory-restored"

case "$MODE" in
  restore)
    [ -d "$REPO" ] || exit 0
    mkdir -p "$LIVE" "$(dirname "$MANIFEST")"
    : > "$MANIFEST"
    n=0
    for f in "$REPO"/*.md; do
      [ -e "$f" ] || continue
      b=$(basename "$f"); echo "$b" >> "$MANIFEST"
      [ -e "$LIVE/$b" ] || { cp "$f" "$LIVE/$b"; n=$((n + 1)); }
    done
    echo "memory: restored $n file(s) from .claude/memory/"
    ;;
  save)
    # PostToolUse: act only when the edited file is inside the live dir.
    if [ -n "$INPUT" ]; then
      FILE=$(printf '%s' "$INPUT" | python3 -c 'import json,sys
try: print((json.load(sys.stdin).get("tool_input") or {}).get("file_path") or "")
except Exception: print("")' 2>/dev/null)
      if [ -n "$FILE" ]; then case "$FILE" in "$LIVE"/*) ;; *) exit 0 ;; esac; fi
    fi
    [ -d "$LIVE" ] || exit 0
    mkdir -p "$REPO"
    for f in "$LIVE"/*.md; do
      [ -e "$f" ] || continue
      cmp -s "$f" "$REPO/$(basename "$f")" || cp "$f" "$REPO/"
      # Track it, so a memory made AND deleted this session leaves the repo too.
      mkdir -p "$(dirname "$MANIFEST")"
      grep -qxF "$(basename "$f")" "$MANIFEST" 2>/dev/null || basename "$f" >> "$MANIFEST"
    done
    if [ -f "$MANIFEST" ]; then
      while IFS= read -r b; do
        [ -n "$b" ] && [ ! -e "$LIVE/$b" ] && [ -e "$REPO/$b" ] && rm -f "$REPO/$b"
      done < "$MANIFEST"
    fi
    ;;
esac
exit 0
