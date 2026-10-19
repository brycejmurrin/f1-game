#!/bin/bash
# Sequential solo spec runner: one Playwright process at a time, log per spec.
# usage: run-specs.sh <cap-seconds> <spec-file> [<spec-file>...]  (extra playwright args after --)
cap=$1; shift
out=artifacts/test-review/tracks-2
for s in "$@"; do
  n=$(basename "$s" .spec.js)
  start=$(date +%s)
  timeout "$cap" npm test -- "tests/specs/$n.spec.js" --retries=0 --reporter=list >"$out/$n.log" 2>&1
  rc=$?
  echo "= $n rc=$rc wall=$(( $(date +%s)-start ))s" | tee -a "$out/summary.txt"
done
