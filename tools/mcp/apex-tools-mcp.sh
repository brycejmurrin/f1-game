#!/usr/bin/env bash
# @doc Cursor / Cloud stdio entry for the `apex_*` MCP (`.mcp.json` → `serve`); `help`/`call`/`smoke` from a shell.
# @skill check-changes
# apex-tools-mcp.sh — Cursor / Cloud entry for the apex_* tools MCP.
# .mcp.json → command tools/mcp/apex-tools-mcp.sh args ["serve"]
# Cloud without auto-loaded .mcp.json: ./tools/mcp/apex-tools-mcp.sh call …
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# Bounded wait for the SessionStart `npm install` (stderr only; stdout is JSON-RPC).
. "$ROOT/tools/mcp/mcp-preflight.sh"
mcp_preflight
# Not `exec`: when the node entry fails to load (missing dependency, syntax
# error) node has already printed the loader error on stderr; name the cause
# and the fix there too instead of leaving a bare CONNECTION_CLOSED.
rc=0
node "$ROOT/tools/mcp/apex-tools-mcp.mjs" "$@" || rc=$?
if (( rc != 0 )); then
  echo "apex-tools-mcp: node entry exited $rc (loader error above; ERR_MODULE_NOT_FOUND means run: npm install)" >&2
fi
exit "$rc"
