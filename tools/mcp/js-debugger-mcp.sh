#!/usr/bin/env bash
# @doc Separate JavaScript debugger MCP wrapper: serve, serve-http, call, status, list-tools and parent-only smoke.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec node "$ROOT/tools/mcp/js-debugger-cli.mjs" "$@"
