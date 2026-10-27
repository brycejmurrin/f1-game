#!/usr/bin/env bash
# @doc Setup: canonical F1 environment and plugin support.
# Compatibility entry point; one canonical installation path.
set -euo pipefail
exec bash /workspace/f1-game/tools/environment/install-environment.sh "$@"
