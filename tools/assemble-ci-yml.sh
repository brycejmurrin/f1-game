#!/usr/bin/env bash
# Assemble tools/ci-b64-part{1,2,3}.txt → .github/workflows/ci.yml
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
cat tools/ci-b64-part1.txt tools/ci-b64-part2.txt tools/ci-b64-part3.txt | base64 -d | gzip -d > .github/workflows/ci.yml
grep -q 'run: bash tools/ci-select-specs-step.sh' .github/workflows/ci.yml
if grep -q 'no valid comparison base for $EVENT' .github/workflows/ci.yml; then
  echo "ERROR: fail-closed string still present"
  exit 1
fi
echo "assembled and verified, $(wc -c < .github/workflows/ci.yml) bytes"
chmod +x tools/ci-resolve-before.sh tools/ci-select-specs-step.sh 2>/dev/null || true
