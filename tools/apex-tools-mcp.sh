#!/usr/bin/env bash
# apex-tools-mcp.sh — Cursor / Cloud entry for the week-1 apex_* tools MCP.
# .mcp.json → command tools/apex-tools-mcp.sh args ["serve"]
# Cloud without auto-loaded .mcp.json: ./tools/apex-tools-mcp.sh call …
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/tools/apex-tools-mcp.mjs" "$@"
