#!/usr/bin/env bash
# @doc MCP bootstrap: Playwright chrome symlink, chrome-devtools clone, browser cache env, mcp-smoke (no Chromium).
# @skill check-changes
# Idempotent checks after cloud-agent-install / environment build. Exit 0 when
# the repo MCP wrappers are callable; warns (does not fail the build) on optional
# gaps so a restricted egress snapshot still passes install.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
usage: bash tools/env/ensure-mcp-ready.sh [--strict] [--help]

  --strict   exit 1 when apex-tools smoke fails (default: warn only)
  --help     this text

Playwright MCP expects the Chrome *channel* at /opt/google/chrome/chrome on
some hosts; this script symlinks there from tools/lib/chromium-path.mjs when
missing, clones chrome-devtools when egress allows, exports PLAYWRIGHT_BROWSERS_PATH,
then runs tools/mcp/mcp-smoke.mjs (apex_status, wrapper status, js-debugger and apex-lsp list-tools).
EOF
  exit 0
fi

STRICT=0
if [[ "${1:-}" == "--strict" ]]; then
  STRICT=1
elif [[ -n "${1:-}" ]]; then
  echo "Unknown argument: $1 (use --help)" >&2
  exit 2
fi

ensure_chrome_devtools_clone() {
  if [[ "${APEX_SKIP_CHROME_MCP_CLONE:-}" == "1" ]]; then
    return 0
  fi
  local bin="$ROOT/scratch/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js"
  if [[ -f "$bin" ]]; then
    echo "chrome-devtools MCP clone: present"
    return 0
  fi
  echo "chrome-devtools MCP clone: building (best-effort)…"
  if bash "$ROOT/tools/mcp/chrome-devtools-mcp.sh" clone; then
    echo "chrome-devtools MCP clone: OK"
  else
    echo "WARN: chrome-devtools clone failed; npx pin remains" >&2
  fi
}

ensure_playwright_browser_cache_env() {
  local cache=""
  cache="$(node "$ROOT/tools/lib/chromium-path.mjs" --cache-path 2>/dev/null || true)"
  if [[ -z "$cache" ]]; then
    echo "WARN: no writable Playwright browser cache discovered" >&2
    return 0
  fi
  export PLAYWRIGHT_BROWSERS_PATH="$cache"
  echo "PLAYWRIGHT_BROWSERS_PATH=$cache"
}

ensure_google_chrome_channel() {
  local exe=""
  exe="$(node "$ROOT/tools/lib/chromium-path.mjs" --path 2>/dev/null || true)"
  if [[ -z "$exe" || ! -x "$exe" ]]; then
    echo "WARN: no discovered Chromium — Playwright MCP may fail to launch" >&2
    return 0
  fi
  if [[ -x /opt/google/chrome/chrome ]]; then
    echo "Chrome channel: /opt/google/chrome/chrome already present"
    return 0
  fi
  echo "Linking Playwright chrome channel → $exe"
  if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    sudo -n mkdir -p /opt/google/chrome
    sudo -n ln -sf "$exe" /opt/google/chrome/chrome
  else
    mkdir -p /opt/google/chrome 2>/dev/null || true
    ln -sf "$exe" /opt/google/chrome/chrome 2>/dev/null || {
      echo "WARN: could not create /opt/google/chrome/chrome (need sudo or write access)" >&2
      return 0
    }
  fi
  if [[ -x /opt/google/chrome/chrome ]]; then
    echo "Chrome channel: /opt/google/chrome/chrome"
  fi
}

verify_apex_tools_cli() {
  if ! node "$ROOT/tools/mcp/apex-tools-mcp.mjs" list-tools >/dev/null 2>&1; then
    echo "ERROR: apex-tools list-tools failed" >&2
    return 1
  fi
  if ! APEX_MCP_MOCK=1 node "$ROOT/tools/mcp/apex-tools-mcp.mjs" call apex_status '{}' \
      | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); process.exit(j.ok?0:1);});"; then
    echo "ERROR: apex_status mock call failed" >&2
    return 1
  fi
  echo "apex-tools CLI: list-tools + apex_status (mock) OK"
  return 0
}

run_mcp_smoke() {
  if node "$ROOT/tools/mcp/mcp-smoke.mjs" >"$ROOT/artifacts/logs/mcp-smoke.log" 2>&1; then
    echo "mcp-smoke: OK (artifacts/logs/mcp-smoke.json)"
    return 0
  fi
  echo "ERROR: mcp-smoke failed — see artifacts/logs/mcp-smoke.log" >&2
  tail -20 "$ROOT/artifacts/logs/mcp-smoke.log" >&2 || true
  return 1
}

mkdir -p "$ROOT/artifacts/logs"
ensure_chrome_devtools_clone
ensure_playwright_browser_cache_env
ensure_google_chrome_channel

fail=0
verify_apex_tools_cli || fail=1
run_mcp_smoke || fail=1

if [[ "$fail" -ne 0 ]]; then
  if [[ "$STRICT" -eq 1 ]]; then
    exit 1
  fi
  echo "WARN: MCP bootstrap checks failed (--strict would exit 1)" >&2
fi
exit 0
