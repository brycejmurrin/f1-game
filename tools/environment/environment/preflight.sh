#!/usr/bin/env bash
# @doc Preflight: canonical F1 environment and plugin support.
set -euo pipefail
cd /workspace/f1-game
source /workspace/f1-game/tools/environment/activate.sh
node -e 'if (+process.versions.node.split(".")[0] < 22) throw new Error("Node >=22 required")'
if ! npm ls --depth=0 --include=dev --offline >/dev/null 2>&1; then
  echo 'FAIL: dependency tree is missing or invalid. Run bash /workspace/f1-game/tools/environment/install-environment.sh explicitly.' >&2
  exit 1
fi
# Resolve the canonical gateway and its checkout lockfile, never a retained copy.
for file in tools/env/chat-mcp-service.mjs tools/mcp/chat-gateway.mjs tools/mcp/doctor-catalog.mjs tools/mcp/check-chat-contract.mjs package.json package-lock.json; do
  test -r "/workspace/f1-game/$file" || { echo "FAIL: canonical gateway source missing: $file" >&2; exit 1; }
done
node --input-type=module -e 'import {createRequire} from "node:module"; createRequire(process.cwd()+"/package.json").resolve("@modelcontextprotocol/sdk/client/index.js");'
node tools/lib/chromium-path.mjs --path
test -r "${APEX_CHAT_MCP_PROFILE:-/workspace/f1-toolchain/config/tunnel-client/f1-main-gateway.yaml}" || {
  echo 'FAIL: restore the existing private tunnel profile from the environment snapshot.' >&2; exit 1;
}
test -x "${APEX_TUNNEL_CLIENT_BIN:-/workspace/f1-toolchain/tunnel-client/tunnel-client}" || {
  echo 'FAIL: restore the retained tunnel client executable.' >&2; exit 1;
}
if [[ -z "${CONTROL_PLANE_API_KEY:-}" ]]; then
  echo 'FAIL: CONTROL_PLANE_API_KEY binding is absent; check environment settings.' >&2
  exit 1
fi
