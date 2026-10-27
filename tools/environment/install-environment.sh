#!/usr/bin/env bash
# @doc Install environment: canonical F1 environment and plugin support.
# Canonical sources are retained in the environment snapshot, never generated here.
set -euo pipefail
root=/workspace/f1-game/tools/environment
if [[ $# -ne 0 ]]; then echo 'Installation takes no arguments.' >&2; exit 2; fi
source "$root/activate.sh"
mkdir -p /workspace/f1-toolchain/environment
# Serialize npm ci and package extraction; a second installer must not race them.
exec 9>"/workspace/f1-toolchain/environment/install.lock"
flock -n 9 || { echo 'FAIL: another environment installation holds the lock.' >&2; exit 1; }
# Fail before downloads or installation if required retained sources are missing.
for file in bind-canonical.sh environment/plugin-install.sh plugin-sources/.agents/plugins/marketplace.json environment/resume.sh environment/test-health.py environment/test-environment.py environment/install-dependencies.sh environment/install-tools.sh environment/verify.sh environment/preflight.sh boot-chat-mcp.sh check-chat-mcp-health.py build-plugins.py test-plugin-build.py launch-mcp.sh MCP-STARTUP-SKILL.md bin/f1-env bin/f1-build-plugins; do
  test -r "$root/$file" || { echo "FAIL: canonical environment source missing: $file" >&2; exit 1; }
done
for file in tools/env/chat-mcp-service.mjs tools/mcp/chat-gateway.mjs tools/mcp/doctor-catalog.mjs tools/mcp/check-chat-contract.mjs package.json package-lock.json; do
  test -r "/workspace/f1-game/$file" || { echo "FAIL: canonical checkout source missing: $file" >&2; exit 1; }
done
for package in f1-cloud-mcp f1-dev-tools; do
  test -d "$root/plugin-sources/$package" || { echo "FAIL: retained plugin source missing: $package" >&2; exit 1; }
done
bash "$root/bind-canonical.sh"
bash "$root/environment/install-dependencies.sh"
bash "$root/environment/install-tools.sh"
python3 "$root/build-plugins.py"
bash "$root/environment/verify.sh"
echo 'PASS: installation and developer checks complete. Start services separately with f1-env resume.'
