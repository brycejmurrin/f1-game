#!/usr/bin/env bash
# @doc Install local plugins: canonical F1 environment and plugin support.
set -euo pipefail
exec bash /workspace/f1-game/tools/environment/environment/plugin-install.sh "$@"
