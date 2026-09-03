#!/usr/bin/env bash
# @doc Cursor / Cloud stdio entry for the `apex_*` MCP (`.mcp.json` → `run`); `help`/`call`/`smoke` from a shell.
# @skill check-changes
# apex-tools-mcp.sh — Cursor / Cloud entry for the apex_* tools MCP.
# .mcp.json → command tools/mcp/apex-tools-mcp.sh args ["serve"]
# Cloud without auto-loaded .mcp.json: ./tools/mcp/apex-tools-mcp.sh call …
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec node "$ROOT/tools/mcp/apex-tools-mcp.mjs" "$@"
