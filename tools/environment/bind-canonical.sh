#!/usr/bin/env bash
# @doc Bind canonical: canonical F1 environment and plugin support.
# Point legacy prepared-image source entrypoints at the one repository owner.
set -euo pipefail
canonical=/workspace/f1-game/tools/environment
retained=/workspace/f1-toolchain
backup="$retained/source-backups/$(date -u +%Y%m%dT%H%M%S)-$$"
link_source() {
  local target="$1" destination="$2"
  test -e "$target" || { echo "Missing canonical source: $target" >&2; exit 1; }
  if [[ -L "$destination" && "$(readlink "$destination")" == "$target" ]]; then return; fi
  if [[ -e "$destination" || -L "$destination" ]]; then
    mkdir -p "$backup/$(dirname "${destination#"$retained/"}")"
    mv "$destination" "$backup/${destination#"$retained/"}"
  fi
  mkdir -p "$(dirname "$destination")"
  ln -s "$target" "$destination"
}
for file in activate.sh boot-chat-mcp.sh build-plugins.py check-chat-mcp-health.py install-environment.sh launch-mcp.sh setup.sh test-plugin-build.py ENVIRONMENT.md MCP-STARTUP-SKILL.md PLUGIN-BUILD.md bin/f1-env bin/f1-build-plugins; do
  link_source "$canonical/$file" "$retained/$file"
done
for file in "$canonical"/environment/*; do
  [[ -f "$file" ]] && link_source "$file" "$retained/environment/$(basename "$file")"
done
link_source "$canonical/plugin-sources" "$retained/plugin-sources"
link_source /workspace/f1-game/tools/env/chat-mcp-service.mjs "$retained/runtime/chat-mcp-service.mjs"
link_source /workspace/f1-game/tools/mcp/chat-gateway.mjs "$retained/runtime/chat-gateway.mjs"
link_source /workspace/f1-game/tools/mcp/check-chat-contract.mjs "$retained/runtime/check-chat-contract.mjs"
link_source /workspace/f1-game/tools/mcp/check-chat-browser.mjs "$retained/runtime/browser-smoke.mjs"
echo 'PASS: legacy source paths resolve to the canonical repository; prior files preserved outside Git.'
