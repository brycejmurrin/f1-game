#!/usr/bin/env bash
# @doc Install dependencies: canonical F1 environment and plugin support.
set -euo pipefail
cd /workspace/f1-game
source /workspace/f1-game/tools/environment/activate.sh
# Node >=22 is required; the prepared environment has Node 24 and system Chromium.
node -e 'if (+process.versions.node.split(".")[0] < 22) throw new Error("Node >=22 required")'
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"
npm ls --depth=0 --include=dev --offline >/dev/null 2>&1 || npm ci --include=dev --no-audit --no-fund --cache /workspace/.npm-cache
bash tools/env/install-browsers.sh
npm ls --depth=0 --include=dev --offline
node tools/lib/chromium-path.mjs --path
