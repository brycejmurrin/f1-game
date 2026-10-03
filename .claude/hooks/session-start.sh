#!/bin/bash
# SessionStart hook: AGENTS.md §Verification 1 as a script, not a rule.
# A fresh container with no node_modules or usable Chromium fails as a
# total-red run that looks like a boot regression. Idempotent and quiet:
# one status line to stdout (which lands in context), nothing else.
#
# Skips: APEX_SKIP_SESSION_INSTALL=1 (any host), or a missing package.json.

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT" || exit 0
[ -f package.json ] || exit 0
# Every documented log path (test-bg, the waiter, `> artifacts/logs/gate.log`)
# assumes this exists; a fresh clone has no artifacts/ at all (2026-09-24).
mkdir -p artifacts/logs
[ "${APEX_SKIP_SESSION_INSTALL:-}" = "1" ] && exit 0

status=()

# node_modules is stale when the lockfile is newer than npm's own stamp.
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  if PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-audit --no-fund >artifacts/session-install.log 2>&1 \
     || { mkdir -p artifacts && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-audit --no-fund >artifacts/session-install.log 2>&1; }; then
    status+=("npm install: done")
  else
    status+=("npm install: FAILED (artifacts/session-install.log)")
  fi
else
  status+=("node_modules: fresh")
fi

# Reuse the same executable as the harness and MCP wrapper, including system
# Chromium on PATH. The installer chooses a writable cache if none is present.
CHROMIUM="$(node "$ROOT/tools/lib/chromium-path.mjs" --path 2>/dev/null || true)"
if [ -n "$CHROMIUM" ] && [ -f "$CHROMIUM" ] && [ -x "$CHROMIUM" ]; then
  status+=("Chromium: present ($CHROMIUM)")
elif [ "${APEX_SKIP_BROWSER_INSTALL:-}" = "1" ]; then
  status+=("Chromium: MISSING (install skipped)")
elif bash "$ROOT/tools/env/install-browsers.sh" >artifacts/session-browsers.log 2>&1; then
  status+=("Chromium: installed")
else
  status+=("Chromium: MISSING — run bash tools/env/install-browsers.sh (artifacts/session-browsers.log)")
fi

# ORIENTATION IN THE SAME LINE (2026-09-16): the branch, its distance from
# the deploy tip, the dirty count, the load and whether a Playwright run is
# already live — the four or five calls every session used to spend before
# its first real one. Best effort; a missing remote ref prints "?".
DEPLOY_BRANCH="claude/f1-game-project-26h3ng"
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
if git rev-parse --verify -q "origin/$DEPLOY_BRANCH" >/dev/null 2>&1; then
  ab=$(git rev-list --left-right --count "HEAD...origin/$DEPLOY_BRANCH" 2>/dev/null | tr '\t' '/')
else
  ab="?/?"
fi
dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
load=$(cut -d' ' -f1 /proc/loadavg 2>/dev/null || echo "?")
live=$(python3 "$ROOT/.claude/hooks/live-run.py" "$ROOT" 2>/dev/null)
if [ -n "$live" ]; then pw="LIVE ($live) — no js/css edits"; else pw="none"; fi
status+=("branch $branch (ahead/behind deploy tip $ab, dirty $dirty)" "loadavg $load" "playwright $pw")
# Auto memory (cloud only; see memory-sync.sh): put .claude/memory/ back where
# the CLI reads it, before the first prompt is built.
mem=$("$ROOT/.claude/hooks/memory-sync.sh" restore </dev/null 2>/dev/null)
[ -n "$mem" ] && status+=("$mem")
# The gate ladder's sizes (AGENTS.md rule 3). Measured, never committed:
# committed digits made every two test-adding PRs conflict (2026-09-30).
lad=$(timeout 10 node "$ROOT/tools/gen/gen-ladder-figures.mjs" 2>/dev/null)
[ -n "$lad" ] && status+=("$lad")

printf 'apex26 session-start:'; printf ' %s;' "${status[@]}"; printf '\n'
exit 0
