#!/usr/bin/env bash
# Sequential one-spec-at-a-time runner for the physics-2c test review (#2952).
# Usage: bash run-chain.sh [spec ...]   (twinned:<spec> runs it with APEX_WITH_TWINNED=1)
# Logs: artifacts/test-review/physics-2c/logs/<spec>.log; summary line per spec in chain.log.
set -u
cd "$(git rev-parse --show-toplevel)"
OUT=artifacts/test-review/physics-2c/logs
mkdir -p "$OUT"
for arg in "$@"; do
  tw=0; spec="$arg"
  case "$arg" in twinned:*) tw=1; spec="${arg#twinned:}";; esac
  # wait for the box to settle (AGENTS.md rule 5: no start at loadavg >= 3)
  for _ in $(seq 60); do awk '{exit !($1<3)}' /proc/loadavg && break; sleep 10; done
  log="$OUT/$(basename "$spec" .spec.js)$([ $tw = 1 ] && echo .twinned).log"
  t0=$(date +%s)
  APEX_WITH_TWINNED=$tw node tools/ci/run-playwright.mjs "tests/specs/$spec" --workers=1 >"$log" 2>&1
  rc=$?
  echo "= spec $spec twinned=$tw rc=$rc wall=$(( $(date +%s) - t0 ))s" | tee -a "$OUT/chain.log"
done
echo "= chain done" | tee -a "$OUT/chain.log"
