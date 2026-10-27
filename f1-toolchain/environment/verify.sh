#!/usr/bin/env bash
set -euo pipefail
cd /workspace/f1-game
source /workspace/f1-toolchain/activate.sh
shellcheck -S warning /workspace/f1-toolchain/install-environment.sh /workspace/f1-toolchain/setup.sh /workspace/f1-toolchain/boot-chat-mcp.sh /workspace/f1-toolchain/bin/f1-env /workspace/f1-toolchain/environment/*.sh
python3 /workspace/f1-toolchain/environment/test-environment.py
python3 /workspace/f1-toolchain/environment/test-health.py
node --test /workspace/f1-toolchain/runtime/runtime.test.mjs /workspace/f1-toolchain/runtime/doctor-catalog.test.mjs
python3 /workspace/f1-toolchain/runtime/test-stdio-lifecycle.py
bash /workspace/f1-toolchain/environment/preflight.sh
node /workspace/f1-toolchain/runtime/chat-mcp-service.mjs doctor
bash tools/env/mirror-skills.sh --check
node tools/check/workflow-lint.mjs --require
node tools/check/shader-validate.mjs --require
python3 /workspace/f1-toolchain/test-plugin-build.py
python3 /workspace/f1-toolchain/build-plugins.py --check
