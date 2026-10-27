# @doc Activate: canonical F1 environment and plugin support.
# shellcheck shell=bash
# Source this file in each shell. Repeated activation must not grow PATH.
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/workspace/pw-browsers}"
export npm_config_cache="${npm_config_cache:-/workspace/.npm-cache}"
case ":$PATH:" in
  *:/workspace/f1-toolchain/bin:*) ;;
  *) export PATH="/workspace/f1-toolchain/bin:$PATH" ;;
esac

# The pinned npm DevTools distribution is supported; the source clone is optional.
export APEX_SKIP_CHROME_MCP_CLONE="${APEX_SKIP_CHROME_MCP_CLONE:-1}"

case ":$PATH:" in
  *:/workspace/f1-game/tools/environment/bin:*) ;;
  *) export PATH="/workspace/f1-game/tools/environment/bin:$PATH" ;;
esac
