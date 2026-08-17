#!/usr/bin/env bash
# Install Playwright Chromium into /opt/pw-browsers (the path tools/harness.mjs
# and chrome-devtools-mcp.sh prefer). Idempotent: safe to re-run from
# environment install / cloud-agent bootstrap.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
export PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_PATH"

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
ensure_browsers_dir

# npm deps first (playwright package provides the installer). Skip browser
# download during npm install — we place Chromium explicitly below.
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --ignore-scripts

echo "Installing Playwright Chromium → $BROWSERS_PATH"
npx playwright install chromium

FOUND="$(find "$BROWSERS_PATH" -type f -name chrome -path '*/chrome-linux*/chrome' 2>/dev/null | head -1 || true)"
if [[ -n "$FOUND" && -x "$FOUND" ]]; then
  ln -sfn "$(dirname "$FOUND")" "$BROWSERS_PATH/chromium-current"
  ln -sfn "$FOUND" "$BROWSERS_PATH/chromium"
  echo "Linked $BROWSERS_PATH/chromium -> $FOUND"
  "$BROWSERS_PATH/chromium" --version 2>&1 | head -1 || true
else
  echo "WARN: chrome binary not found under $BROWSERS_PATH after install" >&2
  ls -la "$BROWSERS_PATH" >&2 || true
  exit 1
fi

echo "OK: Playwright Chromium ready"
