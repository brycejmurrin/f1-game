#!/usr/bin/env bash
# @doc apex-lsp MCP wrapper: serve (stdio), or def|refs|sym|hover|diag from a shell over TypeScript 7 `tsc --lsp`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec node "$ROOT/tools/mcp/lsp-mcp.mjs" "$@"
