#!/usr/bin/env bash
# usage: run-spec.sh <spec-basename> [extra playwright args]; one browser run, log -> artifacts/test-review/ui-2/spec-<name>.log
set -u
cd "$(dirname "$0")/../../../../.."
n="$1"; shift
mkdir -p artifacts/test-review/ui-2
s=$(date +%s)
npm test -- "tests/specs/$n.spec.js" "$@" > "artifacts/test-review/ui-2/spec-$n.log" 2>&1
rc=$?
echo "= run rc=$rc wall=$(( $(date +%s)-s ))s" >> "artifacts/test-review/ui-2/spec-$n.log"
