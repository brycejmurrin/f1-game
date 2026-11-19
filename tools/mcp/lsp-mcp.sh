#!/usr/bin/env bash
# @doc apex-lsp MCP wrapper: serve (stdio), or def|refs|sym|hover|diag from a shell over TypeScript 7 `tsc --lsp`.
set -euo pipefail
# Resolve through symlinks so a Cursor Cloud /agent/tools/mcp shim still finds the repo root.
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  case "$SOURCE" in
    /*) ;;
    *) SOURCE="$DIR/$SOURCE" ;;
  esac
done
ROOT="$(cd "$(dirname "$SOURCE")/../.." && pwd)"
exec node "$ROOT/tools/mcp/lsp-mcp.mjs" "$@"
