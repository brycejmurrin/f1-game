#!/bin/bash
# Reference for Bryce's ~/.claude/stop-hook-git-check.sh H1 patch (#2662).
# The harness loads the user-home script, not this file — unit tests invoke it
# with CLAUDE_PROJECT_DIR set to a throwaway repo.
set -euo pipefail
ROOT="${CLAUDE_PROJECT_DIR:-${1:-}}"
[ -n "$ROOT" ] || { echo "stop-hook-git-check: need CLAUDE_PROJECT_DIR" >&2; exit 2; }
cd "$ROOT"

# H1a — memory-sync's tracked copy is not the agent's commit surface.
if [ -n "$(git status --porcelain -- . ':(exclude).claude/memory' ':(exclude).claude/push-hold')" ]; then
  echo "stop-hook-git-check: uncommitted changes outside .claude/memory" >&2
  exit 2
fi

# H1b — a push held for live CI on the pushed tip (AGENTS.md rule 4).
if [ -f "$ROOT/.claude/push-hold" ]; then
  exit 0
fi

# Simplified tail of the real hook: unpushed commits on the current branch.
if [ -n "${STOP_HOOK_UPSTREAM:-}" ]; then UPSTREAM="$STOP_HOOK_UPSTREAM"; else UPSTREAM='@{u}'; fi
if git rev-parse --verify "$UPSTREAM" >/dev/null 2>&1 \
   || git rev-parse --verify "refs/remotes/origin/HEAD" >/dev/null 2>&1 \
   || git rev-parse --verify "refs/remotes/origin/main" >/dev/null 2>&1; then
  if [ "$UPSTREAM" = '@{u}' ]; then
    UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo origin/main)"
  fi
  if [ -n "$(git log --oneline "$UPSTREAM..HEAD" 2>/dev/null)" ]; then
    echo "stop-hook-git-check: unpushed commits" >&2
    exit 2
  fi
fi
exit 0
