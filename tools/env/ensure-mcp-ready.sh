#!/usr/bin/env bash
# @doc Post-install MCP bootstrap: Playwright chrome channel symlink + apex-tools smoke (no Chromium).
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
missing. Then runs tools/mcp/mcp-smoke.mjs (apex_status + wrapper status only).
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
  if node "$ROOT/tools/mcp/mcp-smoke.mjs" >"$ROOT/artifacts/logs/mcp-smoke.json" 2>&1; then
    echo "mcp-smoke: OK (artifacts/logs/mcp-smoke.json)"
    return 0
  fi
  echo "ERROR: mcp-smoke failed — see artifacts/logs/mcp-smoke.json" >&2
  tail -20 "$ROOT/artifacts/logs/mcp-smoke.json" >&2 || true
  return 1
}

mkdir -p "$ROOT/artifacts/logs"
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
