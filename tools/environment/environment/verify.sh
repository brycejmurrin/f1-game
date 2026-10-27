#!/usr/bin/env bash
# @doc Verify: canonical F1 environment and plugin support.
set -euo pipefail
cd /workspace/f1-game
source /workspace/f1-game/tools/environment/activate.sh
shellcheck -S warning /workspace/f1-game/tools/environment/install-environment.sh /workspace/f1-game/tools/environment/setup.sh /workspace/f1-game/tools/environment/boot-chat-mcp.sh /workspace/f1-game/tools/environment/bin/f1-env /workspace/f1-game/tools/environment/environment/*.sh
python3 /workspace/f1-game/tools/environment/environment/test-environment.py
python3 /workspace/f1-game/tools/environment/environment/test-health.py
node --test /workspace/f1-game/tests/unit/free-design-tools.test.mjs
python3 /workspace/f1-game/tools/environment/test-stdio-lifecycle.py
bash /workspace/f1-game/tools/environment/environment/preflight.sh
node /workspace/f1-game/tools/env/chat-mcp-service.mjs doctor
bash tools/env/mirror-skills.sh --check
node tools/check/workflow-lint.mjs --require
node tools/check/shader-validate.mjs --require
python3 /workspace/f1-game/tools/environment/test-plugin-build.py
python3 /workspace/f1-game/tools/environment/build-plugins.py --check
