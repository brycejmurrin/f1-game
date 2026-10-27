#!/usr/bin/env bash
# @doc Resume: canonical F1 environment and plugin support.
set -euo pipefail
# The supported saved start_skill calls this on every restored instance.
# Dependency installation is deliberately separate.
root=/workspace/f1-game/tools/environment
bash "$root/boot-chat-mcp.sh"
echo 'PASS: existing F1 MCP service resumed and validated.'
