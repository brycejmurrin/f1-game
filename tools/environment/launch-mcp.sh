#!/usr/bin/env bash
# @doc Launch mcp: canonical F1 environment and plugin support.
set -euo pipefail
cd /workspace/f1-game
source /workspace/f1-game/tools/environment/activate.sh
export npm_config_cache=/workspace/.npm-cache
export XDG_CACHE_HOME=/workspace/f1-toolchain/cache
export XDG_CONFIG_HOME=/workspace/f1-toolchain/config
mkdir -p "$XDG_CACHE_HOME" "$XDG_CONFIG_HOME"
server="${1:?MCP server name required}"
case "$server" in
 apex-tools) wrapper=apex-tools-mcp.sh; mode=serve ;;
 apex-lsp) wrapper=lsp-mcp.sh; mode=serve ;;
 js-debugger) wrapper=js-debugger-mcp.sh; mode=serve ;;
 playwright-official) wrapper=playwright-mcp.sh; mode=run ;;
 chrome-devtools) wrapper=chrome-devtools-mcp.sh; mode=run ;;
 browserstack) wrapper=browserstack-mcp.sh; mode=run ;;
 *) echo "Unknown MCP server: $server" >&2; exit 2 ;;
esac
exec bash tools/mcp/output-level-mcp.sh --server "$server" -- bash "tools/mcp/$wrapper" "$mode"
