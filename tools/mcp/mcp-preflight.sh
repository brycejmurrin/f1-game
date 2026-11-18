#!/usr/bin/env bash
# @doc Sourced by the MCP launchers: bounded wait (<= 60 s) for the SessionStart `npm install`; stderr only.
#      As a command: `bash tools/mcp/mcp-preflight.sh --all` probes every server in .cursor/mcp.json.
# @skill mcp-probe
# mcp-preflight.sh — source this, then call `mcp_preflight [npx-package-name]`.
#
# .mcp.json / .cursor/mcp.json starts every server at session start, concurrently with the
# SessionStart hook's `npm install`. A launcher that runs before node_modules
# exists dies (ERR_MODULE_NOT_FOUND) or stalls on a cold `npx` download, and
# the client only reports CONNECTION_CLOSED. This turns that race into a
# bounded wait. stdout is the JSON-RPC pipe: EVERYTHING here writes to stderr.
#
# Ready = node_modules/.package-lock.json (npm writes it last) and node_modules/sharp.
# APEX_MCP_PREFLIGHT_SECS overrides the 60 s bound (0 disables the wait).
#
# CLI (`--all`): start each server exactly as .cursor/mcp.json does (through the
# output-level wrapper), send initialize + tools/list, print one PASS/FAIL line
# with the reason. Sets APEX_MCP_STDERR_PASS so failure reasons are not swallowed.

mcp_preflight() {
  local root="${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
  local pkg="${1:-}"
  local max="${APEX_MCP_PREFLIGHT_SECS:-60}"
  local waited=0 said=0
  [[ "$max" =~ ^[0-9]+$ ]] || max=60
  while (( waited < max )); do
    if [[ -f "$root/node_modules/.package-lock.json" && -d "$root/node_modules/sharp" ]]; then
      break
    fi
    if (( said == 0 )); then
      echo "mcp-preflight: node_modules not ready under $root; waiting up to ${max}s for npm install" >&2
      said=1
    elif (( waited % 10 == 0 )); then
      echo "mcp-preflight: still waiting for npm install (${waited}s)" >&2
    fi
    sleep 1
    waited=$((waited + 1))
  done
  if [[ ! -d "$root/node_modules/sharp" ]]; then
    echo "mcp-preflight: node_modules still incomplete after ${waited}s; continuing (run: npm install)" >&2
  elif (( said )); then
    echo "mcp-preflight: node_modules ready after ${waited}s" >&2
  fi
  if [[ -n "$pkg" ]]; then
    local base="${pkg%@*}"
    [[ -z "$base" ]] && base="$pkg"
    local cache="${npm_config_cache:-$HOME/.npm}/_npx"
    if ! compgen -G "$cache/*/node_modules/$base" >/dev/null 2>&1; then
      echo "mcp-preflight: $pkg not in the npx cache; the first start downloads it (can take a while, not a hang)" >&2
    fi
  fi
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
  cd "$ROOT"
  case "${1:-}" in
    --all)
      shift
      # Surface upstream stderr through output-level-mcp (default retain is private).
      export APEX_MCP_STDERR_PASS="${APEX_MCP_STDERR_PASS:-1}"
      # Bound the sourced wait inside each launcher if a cold box races npm install.
      export APEX_MCP_PREFLIGHT_SECS="${APEX_MCP_PREFLIGHT_SECS:-5}"
      exec node "$ROOT/tools/mcp/mcp-listing-cost.mjs" --preflight "$@"
      ;;
    -h|--help)
      cat <<'EOF'
Usage:
  . tools/mcp/mcp-preflight.sh && mcp_preflight [npx-package]
      Bounded wait for node_modules (sourced by MCP launchers; stderr only).

  bash tools/mcp/mcp-preflight.sh --all [--only=NAME] [--config=PATH] [--timeout-ms=N]
      Start each server in .cursor/mcp.json, send initialize + tools/list,
      print one PASS/FAIL line with the reason. Exit 1 if any server fails.
EOF
      exit 0
      ;;
    "")
      echo "mcp-preflight: pass --all to probe servers, or source this file and call mcp_preflight" >&2
      exit 2
      ;;
    *)
      echo "mcp-preflight: unknown arg ${1:-} (try --help)" >&2
      exit 2
      ;;
  esac
fi
