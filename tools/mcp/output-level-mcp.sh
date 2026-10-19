#!/usr/bin/env bash
# @doc Agent MCP entrypoint: compact by default; outputLevel diagnostic/full and saved-result retrieval for every tool.
# @skill check-changes
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
exec node "$ROOT/tools/mcp/output-level-mcp.mjs" "$@"
