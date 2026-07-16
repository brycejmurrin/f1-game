#!/usr/bin/env bash
# Run several Playwright test GROUPS concurrently, each with its own static
# server (APEX_PORT), its own worker pool, and its own line-reporter log —
# so a long suite runs in a fraction of the wall time and a stall is visible
# in (and attributable to) one group's log instead of a silent foreground run.
#
# Usage:
#   tools/test-shards.sh smoke api collision          # npm test:<group> names
#   WORKERS=2 tools/test-shards.sh circuit barriers   # workers per group
#   LOGDIR=/tmp/logs BASEPORT=3470 tools/test-shards.sh smoke parts
#
# Notes:
#   - Groups come from package.json's test:<group> scripts.
#   - Total browser processes = groups x WORKERS; this box has few cores and
#     renders via SwiftShader (CPU), so 2-3 groups x 2 workers is the sweet
#     spot — more just thrashes.
#   - Logs: $LOGDIR/<group>.log (tail -f to watch). Reports/artifacts land in
#     playwright-report-<port>/ and test-results-<port>/ per group.
#   - Exit code is non-zero if ANY group fails; a per-group summary prints
#     at the end.
set -u
IN=("$@")
[ ${#IN[@]} -gt 0 ] || { echo "usage: $0 <group> [group...]   (runs npm test:<group> concurrently)"; exit 2; }
WORKERS="${WORKERS:-2}"
LOGDIR="${LOGDIR:-test-logs}"
BASEPORT="${BASEPORT:-3461}"
mkdir -p "$LOGDIR"

pids=(); names=()
i=0
for g in "${IN[@]}"; do
  port=$((BASEPORT + i)); log="$LOGDIR/$g.log"
  echo "> test:$g  port=$port  workers=$WORKERS  log=$log"
  APEX_PORT=$port npm run --silent "test:$g" -- --reporter=line --workers="$WORKERS" >"$log" 2>&1 &
  pids+=($!); names+=("$g"); i=$((i + 1))
done

fail=0
for j in "${!pids[@]}"; do
  wait "${pids[$j]}"; code=$?
  # last "N passed/failed" style line, with the line-reporter's \r progress
  # unrolled so grep sees real lines
  summary=$(tr '\r' '\n' < "$LOGDIR/${names[$j]}.log" | grep -aE '[0-9]+ (passed|failed|flaky|skipped)' | tail -2 | tr '\n' ' ')
  printf '%-12s exit=%-3s %s\n' "${names[$j]}" "$code" "${summary:-<no summary — check log>}"
  [ "$code" -ne 0 ] && fail=1
done
exit $fail
