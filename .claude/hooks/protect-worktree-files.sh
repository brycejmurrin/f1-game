#!/bin/bash
# PreToolUse guard: block edits to shared-contract files from inside a LINKED
# git worktree (fixer agents). The main checkout is unaffected — the main
# session owns these files. CLAUDE.md prose is advisory; this hook is the gate.
#
# Escape hatch for a deliberately assigned edit: touch .claude/allow-protected
# at the worktree root and retry (remove it when done).

INPUT=$(cat)

FILE=$(printf '%s' "$INPUT" | python3 -c "
import json,sys
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input') or {}
    print(ti.get('file_path') or ti.get('notebook_path') or '')
except Exception:
    print('')
")
[ -z "$FILE" ] && exit 0

case "$(basename "$FILE")" in
  index.html|manifest.cjs|version.json|sw.js|roster.js|gen-shell.mjs|package.json|package-lock.json|playwright.config.js) ;;
  *) exit 0 ;;
esac

DIR=$(dirname "$FILE")
[ -d "$DIR" ] || exit 0
GIT_DIR=$(git -C "$DIR" rev-parse --git-dir 2>/dev/null)
COMMON=$(git -C "$DIR" rev-parse --git-common-dir 2>/dev/null)
# Main checkout: git-dir == git-common-dir. Linked worktree: they differ.
[ -z "$GIT_DIR" ] || [ "$GIT_DIR" = "$COMMON" ] && exit 0

ROOT=$(git -C "$DIR" rev-parse --show-toplevel 2>/dev/null)
[ -n "$ROOT" ] && [ -f "$ROOT/.claude/allow-protected" ] && exit 0

echo "BLOCKED: $(basename "$FILE") is a shared-contract file (load order / cache / shell) owned by the main session — worktree agents must not edit it. Report the needed change in your summary instead. If this edit was explicitly assigned to you, run: touch $ROOT/.claude/allow-protected and retry." >&2
exit 2
