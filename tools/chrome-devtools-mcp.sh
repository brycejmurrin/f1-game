#!/usr/bin/env bash
# Local chrome-devtools-mcp — uses scratch clone when built, else npx.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$ROOT/scratch/chrome-devtools-mcp"
CHROMIUM="${CHROMIUM_PATH:-/opt/pw-browsers/chromium}"
BIN="$REPO/build/src/bin/chrome-devtools-mcp.js"

run_local() {
  exec node "$BIN" \
    --headless \
    --isolated \
    --executablePath "$CHROMIUM" \
    --viewport "844x390" \
    --chromeArg=--no-sandbox \
    --chromeArg=--use-angle=swiftshader \
    "$@"
}

run_npx() {
  exec npx -y chrome-devtools-mcp@latest \
    --headless \
    --isolated \
    --executablePath "$CHROMIUM" \
    --viewport "844x390" \
    --chromeArg=--no-sandbox \
    --chromeArg=--use-angle=swiftshader \
    "$@"
}

case "${1:-run}" in
  run)
    shift || true
    if [[ -f "$BIN" ]]; then run_local "$@"; else run_npx "$@"; fi
    ;;
  build)
    cd "$REPO"
    npm ci
    npm run build || true
    [[ -f "$BIN" ]] && echo "Built: $BIN" || echo "Build incomplete — npx fallback still works"
    ;;
  clone)
    git clone https://github.com/ChromeDevTools/chrome-devtools-mcp.git "$REPO"
    "$0" build
    ;;
  path)
    if [[ -f "$BIN" ]]; then echo "$BIN"; else echo "npx:chrome-devtools-mcp@latest"; fi
    ;;
  *)
    echo "Usage: $0 {run|build|clone|path} [mcp-args...]"
    exit 1
    ;;
esac
