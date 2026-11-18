#!/usr/bin/env bash
# @doc Separate JavaScript debugger MCP wrapper: serve, serve-http, call, status, list-tools and parent-only smoke.
# @skill js-debugger
# .mcp.json / .cursor/mcp.json → (via output-level-mcp.sh) bash tools/mcp/js-debugger-mcp.sh serve
# Cloud without auto-loaded catalog: ./tools/mcp/js-debugger-mcp.sh call …
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
# Bounded wait for the SessionStart `npm install` (stderr only; stdout is JSON-RPC).
# The debugger graph is node:-only today, but a stray bare import still becomes
# CONNECTION_CLOSED at session start without this wait + exit line.
. "$ROOT/tools/mcp/mcp-preflight.sh"
mcp_preflight
# Not `exec`: when the node entry fails to load (missing dependency, syntax
# error) node has already printed the loader error on stderr; name the cause
# and the fix there too instead of leaving a bare CONNECTION_CLOSED.
rc=0
node "$ROOT/tools/mcp/js-debugger-cli.mjs" "$@" || rc=$?
if (( rc != 0 )); then
  echo "js-debugger-mcp: node entry exited $rc (loader error above; ERR_MODULE_NOT_FOUND means run: npm install)" >&2
fi
exit "$rc"
