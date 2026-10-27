#!/usr/bin/env bash
set -euo pipefail
cd /workspace/f1-game
source /workspace/f1-toolchain/activate.sh
node -e 'if (+process.versions.node.split(".")[0] < 22) throw new Error("Node >=22 required")'
if ! npm ls --depth=0 --include=dev --offline >/dev/null 2>&1; then
  echo 'FAIL: dependency tree is missing or invalid. Run bash /workspace/f1-toolchain/install-environment.sh explicitly.' >&2
  exit 1
fi
runtime_dir="${F1_GATEWAY_RUNTIME_DIR:-/workspace/f1-toolchain/runtime}"
# Runtime belongs to the retained toolchain, independently of the game branch.
for file in chat-mcp-service.mjs chat-gateway.mjs doctor-catalog.mjs check-chat-contract.mjs package.json package-lock.json; do
  test -r "$runtime_dir/$file" || {
    echo "FAIL: retained gateway source missing: $file. Restore f1-toolchain/runtime from the prepared snapshot." >&2
    exit 1
  }
done
node --input-type=module -e 'import {createRequire} from "node:module"; const r=createRequire(process.argv[1]); r.resolve("@modelcontextprotocol/sdk/client/index.js");' "$runtime_dir/package.json" || {
  echo 'FAIL: gateway SDK missing. Run f1-env install.' >&2; exit 1;
}
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
