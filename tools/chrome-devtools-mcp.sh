#!/usr/bin/env bash
# Chrome DevTools MCP — local wrapper for Cursor / CLI use.
# Prefers npx package (reliable); scratch clone is optional for hacking.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$ROOT/scratch/chrome-devtools-mcp"
BIN="$REPO/build/src/bin/chrome-devtools-mcp.js"
PATH_FILE="$ROOT/scratch/chrome-devtools-path.env"

# Resolve Chromium: env > saved path > Playwright > Puppeteer > system Chrome.
detect_chrome() {
  if [[ -n "${CHROMIUM_PATH:-}" && -x "$CHROMIUM_PATH" ]]; then
    echo "$CHROMIUM_PATH"; return
  fi
  if [[ -f "$PATH_FILE" ]]; then
    # shellcheck disable=SC1090
    local saved
    saved="$(source "$PATH_FILE" 2>/dev/null && echo "${CHROMIUM_PATH:-}")"
    if [[ -n "$saved" && -x "$saved" ]]; then echo "$saved"; return; fi
  fi
  local candidates=(
    /opt/pw-browsers/chromium
    /home/ubuntu/.cache/ms-playwright/chromium-*/chrome-linux64/chrome
    /home/ubuntu/.cache/puppeteer/chrome/*/chrome-linux64/chrome
    /opt/google/chrome/chrome
    /usr/local/bin/google-chrome
  )
  local c glob
  for c in "${candidates[@]}"; do
    for glob in $c; do
      if [[ -x "$glob" ]]; then
        mkdir -p "$(dirname "$PATH_FILE")"
        printf 'CHROMIUM_PATH=%q\n' "$glob" >"$PATH_FILE"
        echo "$glob"; return
      fi
    done
  done
  echo "No Chromium found. Run: npx playwright install chromium" >&2
  exit 1
}

CHROME="$(detect_chrome)"
MCP_ARGS=(
  --headless
  --isolated
  --executablePath "$CHROME"
  --memoryDebugging
  --viewport "844x390"
  --chromeArg=--no-sandbox
  --chromeArg=--use-angle=swiftshader
)

run_mcp() {
  if [[ -f "$BIN" ]] && node "$BIN" --help >/dev/null 2>&1; then
    exec node "$BIN" "${MCP_ARGS[@]}" "$@"
  fi
  exec npx -y chrome-devtools-mcp@latest "${MCP_ARGS[@]}" "$@"
}

cmd_verify() {
  echo "Chromium: $CHROME"
  "$CHROME" --version 2>&1 | head -1
  local init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"verify","version":"1"}}}'
  local tools='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  local out
  out="$( (echo "$init"; sleep 3; echo "$tools") | timeout 45 bash -c 'exec "$0" run' "$0" 2>/dev/null | tail -1 )"
  local count
  count="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(len(d.get('result',{}).get('tools',[])))" "$out" 2>/dev/null || echo 0)"
  echo "MCP tools: $count"
  [[ "$count" -gt 0 ]] && echo "OK" || { echo "FAIL"; exit 1; }
}

cmd_clone() {
  if [[ -d "$REPO/.git" ]]; then echo "Already cloned: $REPO"; else
    git clone https://github.com/ChromeDevTools/chrome-devtools-mcp.git "$REPO"
  fi
  cd "$REPO"
  npm ci
  npm run sync 2>/dev/null || true
  npm run build || echo "Local build incomplete — npx fallback remains available"
}

case "${1:-run}" in
  run) shift || true; run_mcp "$@" ;;
  verify) cmd_verify ;;
  chrome-path) echo "$CHROME" ;;
  clone) cmd_clone ;;
  build)
    cd "$REPO"
    npm ci && npm run sync 2>/dev/null || true
    npm run build || true
    ;;
  *)
    echo "Usage: $0 {run|verify|chrome-path|clone|build}"
    exit 1
    ;;
esac
