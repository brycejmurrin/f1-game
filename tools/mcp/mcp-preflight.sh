#!/usr/bin/env bash
# @doc Sourced by the MCP launchers: bounded wait (<= 60 s) for the SessionStart `npm install`; stderr only.
# @skill mcp-probe
# mcp-preflight.sh — source this, then call `mcp_preflight [npx-package-name]`.
#
# .mcp.json starts every server at session start, concurrently with the
# SessionStart hook's `npm install`. A launcher that runs before node_modules
# exists dies (ERR_MODULE_NOT_FOUND) or stalls on a cold `npx` download, and
# the client only reports CONNECTION_CLOSED. This turns that race into a
# bounded wait. stdout is the JSON-RPC pipe: EVERYTHING here writes to stderr.
#
# Ready = node_modules/.package-lock.json (npm writes it last) and node_modules/sharp.
# APEX_MCP_PREFLIGHT_SECS overrides the 60 s bound (0 disables the wait).

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
