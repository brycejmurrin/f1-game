#!/bin/bash
# SessionStart hook: AGENTS.md §Verification 1 as a script, not a rule.
# A fresh container with no node_modules or no headless shell fails as a
# total-red run that looks like a boot regression. Idempotent and quiet:
# one status line to stdout (which lands in context), nothing else.
#
# Skips: APEX_SKIP_SESSION_INSTALL=1 (any host), or a missing package.json.

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT" || exit 0
[ -f package.json ] || exit 0
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

# The headless shell lives wherever Playwright looks; PLAYWRIGHT_BROWSERS_PATH
# wins, else the default cache. Only download when it is genuinely absent.
BROWSERS="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
if ls -d "$BROWSERS"/chromium_headless_shell-* >/dev/null 2>&1; then
  status+=("chromium-headless-shell: present")
elif [ "${APEX_SKIP_BROWSER_INSTALL:-}" = "1" ]; then
  status+=("chromium-headless-shell: MISSING (install skipped)")
elif npx playwright install chromium-headless-shell >artifacts/session-browsers.log 2>&1; then
  status+=("chromium-headless-shell: installed")
else
  status+=("chromium-headless-shell: MISSING — run bash tools/env/cloud-agent-install.sh")
fi

printf 'apex26 session-start:'; printf ' %s;' "${status[@]}"; printf '\n'
exit 0
