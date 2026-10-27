#!/usr/bin/env bash
# @doc Boot chat mcp: canonical F1 environment and plugin support.
set -euo pipefail
cd /workspace/f1-game
source /workspace/f1-game/tools/environment/activate.sh
export APEX_CHAT_MCP_PROFILE="${APEX_CHAT_MCP_PROFILE:-/workspace/f1-toolchain/config/tunnel-client/f1-main-gateway.yaml}"
export APEX_TUNNEL_CLIENT_BIN="${APEX_TUNNEL_CLIENT_BIN:-/workspace/f1-toolchain/tunnel-client/tunnel-client}"
bash /workspace/f1-game/tools/environment/environment/preflight.sh
# Serialize startup through readiness. Close fd 9 in the lifecycle launcher so
# the detached supervisor cannot retain the startup lock.
exec 9>/workspace/f1-toolchain/environment/startup.lock
flock -w 180 9 || { echo "FAIL: MCP startup lock timed out." >&2; exit 1; }
# Reuse the repository's PID-identity-aware lifecycle owner. Never reinstall here.
node /workspace/f1-game/tools/env/chat-mcp-service.mjs start 9>&-
ready=false
for ((attempt=0; attempt<50; attempt++)); do
  if node /workspace/f1-game/tools/env/chat-mcp-service.mjs status >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 0.2
done
if [[ "$ready" != true ]]; then
  echo 'FAIL: supervisor did not become live; inspect artifacts/run/chat-mcp/service.log.' >&2
  exit 1
fi
node /workspace/f1-game/tools/env/chat-mcp-service.mjs status
python3 /workspace/f1-game/tools/environment/check-chat-mcp-health.py
node /workspace/f1-game/tools/mcp/check-chat-contract.mjs
