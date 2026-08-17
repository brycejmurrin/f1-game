#!/usr/bin/env bash
# Install Playwright Chromium into /opt/pw-browsers (the path tools/harness.mjs
# and chrome-devtools-mcp.sh prefer). Idempotent: safe to re-run from
# environment install / cloud-agent bootstrap.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
export PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_PATH"

mkdir -p "$BROWSERS_PATH"

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
