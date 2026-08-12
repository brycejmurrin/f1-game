#!/usr/bin/env bash
# Chrome DevTools MCP — local clone at scratch/chrome-devtools-mcp (gitignored).
# Cursor: .mcp.json invokes this script with "run" (stdio MCP).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$ROOT/scratch/chrome-devtools-mcp"
BIN="$REPO/build/src/bin/chrome-devtools-mcp.js"
PATH_FILE="$ROOT/scratch/chrome-devtools-path.env"
REPO_URL="https://github.com/ChromeDevTools/chrome-devtools-mcp.git"

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
    /opt/pw-browsers/chromium-*/chrome-linux64/chrome
    "$HOME/.cache/ms-playwright/chromium-*/chrome-linux64/chrome"
    "$HOME/.cache/puppeteer/chrome/*/chrome-linux64/chrome"
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

local_ok() {
  [[ -f "$BIN" ]] && node "$BIN" --help >/dev/null 2>&1
}

run_mcp() {
  if local_ok; then
    exec node "$BIN" "${MCP_ARGS[@]}" "$@"
  fi
  echo "Local clone missing or broken — run: $0 clone && $0 build" >&2
  echo "Falling back to npx chrome-devtools-mcp@latest" >&2
  exec npx -y chrome-devtools-mcp@latest "${MCP_ARGS[@]}" "$@"
}

cmd_build() {
  if [[ ! -d "$REPO/.git" ]]; then
    echo "Clone first: $0 clone" >&2; exit 1
  fi
  cd "$REPO"
  echo "Installing npm deps (ignore prepare hook — run manually)…"
  npm ci --ignore-scripts
  # Shallow, NON-recursive: prepare.ts only needs devtools-frontend/mcp/mcp.ts.
  # --recursive pulls Chromium nested deps (llvm-project etc.) and can hang for
  # hours on googlesource — never what we want for the MCP binary.
  echo "Syncing devtools-frontend submodule (shallow, no nested deps)…"
  git submodule update --init --depth 1
  echo "Running prepare…"
  npx tsx scripts/prepare.ts
  echo "Compiling…"
  npx tsc
  npx tsx scripts/post-build.ts
  chmod +x build/src/bin/chrome-devtools-mcp.js 2>/dev/null || true
  if local_ok; then
    echo "Built OK: $BIN"
    node "$BIN" --help >/dev/null && echo "Bin help OK"
    node "$BIN" --version 2>/dev/null || true
  else
    echo "Build finished but bin not runnable" >&2; exit 1
  fi
}

cmd_clone() {
  if [[ -d "$REPO/.git" ]]; then
    echo "Already cloned: $REPO"
    cd "$REPO" && git pull --ff-only 2>/dev/null || true
  else
    mkdir -p "$(dirname "$REPO")"
    git clone "$REPO_URL" "$REPO"
  fi
  cmd_build
}

cmd_status() {
  echo "Repo:  $REPO"
  if [[ -d "$REPO/.git" ]]; then
    echo "Commit: $(git -C "$REPO" log -1 --oneline 2>/dev/null || echo '?')"
  else
    echo "Commit: (not cloned — run: $0 clone)"
  fi
  echo "Bin:   $BIN"
  if local_ok; then echo "Bin:   OK (local clone)"; else echo "Bin:   missing — run: $0 clone"; fi
  echo "Chrome: $CHROME"
  echo "MCP config: $ROOT/.mcp.json → $0 run"
}

cmd_verify() {
  cmd_status
  echo "---"
  "$CHROME" --version 2>&1 | head -1
  local init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"verify","version":"1"}}}'
  local tools='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  local out backend="npx"
  if local_ok; then backend="local"; fi
  out="$( (echo "$init"; sleep 3; echo "$tools") | timeout 45 bash -c 'exec "$0" run' "$0" 2>/dev/null | tail -1 )"
  local count
  count="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(len(d.get('result',{}).get('tools',[])))" "$out" 2>/dev/null || echo 0)"
  echo "Backend: $backend"
  echo "MCP tools: $count"
  [[ "$count" -gt 0 ]] && echo "OK" || { echo "FAIL"; exit 1; }
}

case "${1:-run}" in
  run) shift || true; run_mcp "$@" ;;
  verify) cmd_verify ;;
  status) cmd_status ;;
  chrome-path) echo "$CHROME" ;;
  clone) cmd_clone ;;
  build) cmd_build ;;
  *)
    cat <<EOF
Chrome DevTools MCP — local clone helper

  $0 clone     Clone $REPO_URL → scratch/chrome-devtools-mcp and build
  $0 build     Rebuild existing clone
  $0 run       Start MCP server on stdio (used by .mcp.json)
  $0 verify    Check Chromium + list tools
  $0 status    Show paths and clone state
  $0 chrome-path

Requires Chromium: npx playwright install chromium
EOF
    exit 1
    ;;
esac
