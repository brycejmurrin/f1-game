#!/usr/bin/env bash
# @doc Cursor Cloud dashboard `install`: best-effort mesa/vulkan/xvfb, then `install-browsers.sh`, then the MCP clones.
# @skill check-changes
# Dashboard / environment-build install for Apex 26 Cloud Agents.
# Idempotent. Exit 0 when the snapshot already has usable deps even if apt
# or the npm registry is unreachable (restricted egress).
#
# Not `set -e`: apt-get update 404s on archive.ubuntu.com and npm can crash
# with "Exit handler never called!" after registry ECONNRESET
# (measured 2026-08-17, bld-20260817-e70b375f).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
usage: bash tools/env/cloud-agent-install.sh [--help]

Cursor Cloud dashboard install: best-effort mesa/vulkan/xvfb, then
install-browsers.sh, then the chrome-devtools / tinyfish MCP clones.
Idempotent. Exit 0 when the snapshot already has usable deps.
EOF
  exit 0
fi

need_pkg() {
  dpkg -s "$1" >/dev/null 2>&1
}

ensure_apt_pkgs() {
  local missing=()
  local p
  for p in mesa-vulkan-drivers vulkan-tools xvfb tmux; do
    if need_pkg "$p"; then
      continue
    fi
    missing+=("$p")
  done
  if [[ ${#missing[@]} -eq 0 ]]; then
    echo "apt packages already present: mesa-vulkan-drivers vulkan-tools xvfb tmux"
    return 0
  fi
  echo "apt missing: ${missing[*]} — attempting install"
  if ! sudo DEBIAN_FRONTEND=noninteractive apt-get update -y; then
    echo "WARN: apt-get update failed (Ubuntu mirrors often blocked on restricted egress)" >&2
  fi
  if sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "${missing[@]}"; then
    return 0
  fi
  echo "WARN: apt-get install failed for ${missing[*]}" >&2
  return 1
}

ensure_apt_pkgs || true

# MCP clones live under gitignored scratch/. A live clone dies on cold boot
# unless the environment snapshot is Saved. Do this BEFORE any early exit
# so deferred Playwright browsers do not skip chrome-devtools / TinyFish.
ensure_mcp_clones() {
  if [[ "${APEX_SKIP_CHROME_MCP_CLONE:-}" != "1" ]]; then
    if [[ -f "$ROOT/scratch/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js" ]]; then
      echo "chrome-devtools MCP clone already built"
    else
      echo "Cloning chrome-devtools MCP (best-effort; npx pin remains if this fails)…"
      if ! bash "$ROOT/tools/mcp/chrome-devtools-mcp.sh" clone; then
        echo "WARN: chrome-devtools clone failed; verify uses npx chrome-devtools-mcp@1.7.0" >&2
      fi
    fi
  fi

  if [[ "${APEX_SKIP_TINYFISH_SETUP:-}" != "1" ]]; then
    if [[ -f "$ROOT/scratch/tinyfish-mcp-server/dist/index.js" ]]; then
      echo "tinyfish MCP clone already built"
    else
      echo "Cloning tinyfish MCP (best-effort; deploy-check needs setup)…"
      if ! bash "$ROOT/tools/mcp/tinyfish-mcp.sh" setup; then
        echo "WARN: tinyfish setup failed — run tools/mcp/tinyfish-mcp.sh setup" >&2
      fi
    fi
  fi

  # Dashboard secret / .env override the tracked fallback in tinyfish-mcp.sh.
  # This script never embeds a key. Custom key: https://agent.tinyfish.ai/home
  if [[ -z "${TINYFISH_API_KEY:-}" && ! -f "$ROOT/scratch/tinyfish-mcp-server/.env" ]]; then
    echo "NOTE: TINYFISH_API_KEY unset — tinyfish-mcp.sh uses its tracked fallback. Custom key: https://agent.tinyfish.ai/home"
  fi
}

if ! bash "$ROOT/tools/env/install-browsers.sh"; then
  system_browser="$(node "$ROOT/tools/lib/chromium-path.mjs" --path || true)"
  if [[ -n "$system_browser" && -x "$system_browser" ]]; then
    echo "WARN: Playwright browser install failed; installed Chrome is present at $system_browser"
    if [[ -f node_modules/playwright/package.json && -f node_modules/sharp/package.json ]]; then
      ensure_mcp_clones
      echo "OK: cloud-agent install complete (npm ready, browsers deferred)"
      exit 0
    fi
  fi
  echo "ERROR: cloud-agent install failed" >&2
  exit 1
fi

ensure_mcp_clones

# Verify repo MCP wrappers (symlink Playwright chrome channel + mcp-smoke).
# Non-strict: a partial snapshot still passes install; session-start / agents
# use `./tools/mcp/apex-tools-mcp.sh call` when the host catalog is empty.
bash "$ROOT/tools/env/ensure-mcp-ready.sh" || true

echo "OK: cloud-agent install complete"
