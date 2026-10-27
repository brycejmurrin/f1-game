#!/usr/bin/env bash
# @doc Plugin install: canonical F1 environment and plugin support.
set -euo pipefail
root=/workspace/f1-game/tools/environment
command -v codex >/dev/null || { echo 'FAIL: Codex CLI is required for local plugin installation.' >&2; exit 1; }
python3 "$root/build-plugins.py" --check
codex plugin marketplace add "$root/plugin-sources" --json
codex plugin add dev-6ade996f81448191a51fc4e7a33152a8@f1-workspace --json
codex plugin add f1-dev-tools@f1-workspace --json
echo 'PASS: plugins installed in the local Codex runtime. Account import and hosted attachment are separate.'
