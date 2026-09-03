#!/usr/bin/env bash
# @doc Idempotent Playwright Chromium install into `/opt/pw-browsers`; skips `npm install` when node_modules is usable.
# Install Playwright Chromium into /opt/pw-browsers (the path tools/harness.mjs
# and chrome-devtools-mcp.sh prefer). Idempotent: safe to re-run from
# environment install / cloud-agent bootstrap.
#
# Not `set -e`: npm 10 can crash with "Exit handler never called!" after
# registry ECONNRESET (measured 2026-08-17, bld-20260817-e70b375f) even when
# node_modules is already usable. Fail only when deps are actually missing.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
export PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_PATH"
# Skip Playwright's postinstall download during npm install — we place
# Chromium explicitly below (or leave the snapshot's copy in place).
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Fresh environment builds run install as ubuntu without an existing
# /opt/pw-browsers — mkdir there needs passwordless sudo (CONFIG_CHANGE
# build 2026-08-17 failed with Permission denied otherwise).
ensure_browsers_dir() {
  if [[ -d "$BROWSERS_PATH" ]]; then
    return 0
  fi
  if mkdir -p "$BROWSERS_PATH" 2>/dev/null; then
    return 0
  fi
  if command -v sudo >/dev/null 2>&1 && sudo -n mkdir -p "$BROWSERS_PATH" \
      && sudo -n chown "$(id -u):$(id -g)" "$BROWSERS_PATH"; then
    return 0
  fi
  echo "WARN: cannot create $BROWSERS_PATH (need write or passwordless sudo)" >&2
  return 1
}

npm_ready() {
  # Directories alone are not enough: the failed-build snapshot left hollow
  # node_modules/<pkg> folders with no package.json (measured 2026-08-17).
  [[ -f node_modules/playwright/package.json \
    && -f node_modules/sharp/package.json \
    && -f node_modules/@playwright/test/package.json ]]
}

npm_install_once() {
  local extra=()
  if [[ "${1:-}" == "prefer-offline" ]]; then
    extra+=(--prefer-offline)
  fi
  npm install --ignore-scripts --no-audit \
    --fetch-retries=5 --fetch-retry-mintimeout=2000 --fetch-retry-maxtimeout=15000 \
    "${extra[@]}"
}

ensure_npm() {
  if npm_ready; then
    echo "node_modules already present, skipping npm install"
    return 0
  fi
  local attempt
  for attempt in 1 2 3; do
    echo "npm install --ignore-scripts --no-audit (attempt $attempt)"
    if npm_install_once prefer-offline && npm_ready; then
      return 0
    fi
    echo "WARN: npm install attempt $attempt failed"
    sleep $((attempt * 3))
  done
  echo "npm install --ignore-scripts --no-audit (final, no --prefer-offline)"
  if npm_install_once && npm_ready; then
    return 0
  fi
  if npm_ready; then
    echo "WARN: npm reported failure but node_modules is usable"
    return 0
  fi
  echo "ERROR: npm install failed and node_modules is incomplete" >&2
  return 1
}

link_chromium() {
  local found
  found="$(find "$BROWSERS_PATH" -type f -name chrome -path '*/chrome-linux*/chrome' 2>/dev/null | head -1 || true)"
  if [[ -n "$found" && -x "$found" ]]; then
    ln -sfn "$(dirname "$found")" "$BROWSERS_PATH/chromium-current"
    ln -sfn "$found" "$BROWSERS_PATH/chromium"
    echo "Linked $BROWSERS_PATH/chromium -> $found"
    "$BROWSERS_PATH/chromium" --version 2>&1 | head -1 || true
    return 0
  fi
  return 1
}

ensure_browsers_dir || true
ensure_npm || exit 1

if [[ -x "$BROWSERS_PATH/chromium" ]] || link_chromium; then
  echo "Playwright Chromium already at $BROWSERS_PATH/chromium"
  echo "OK: Playwright Chromium ready"
  exit 0
fi

echo "Installing Playwright Chromium → $BROWSERS_PATH"
# Prefer the local CLI — `npx playwright` re-hits registry.npmjs.org even when
# node_modules/playwright is already installed (ECONNRESET on this egress).
PW_CLI="$ROOT/node_modules/playwright/cli.js"
if [[ ! -f "$PW_CLI" ]]; then
  PW_CLI="$ROOT/node_modules/@playwright/test/cli.js"
fi
if [[ -f "$PW_CLI" ]] && node "$PW_CLI" install chromium && link_chromium; then
  echo "OK: Playwright Chromium ready"
  exit 0
fi

echo "WARN: chrome binary not found under $BROWSERS_PATH after install" >&2
ls -la "$BROWSERS_PATH" >&2 || true
exit 1
