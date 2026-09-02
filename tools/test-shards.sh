#!/usr/bin/env bash
# @doc Runs npm test groups concurrently, one port + log per group; `SPLIT=N` fans a group across N `--shard=k/N` runs.
# @section runner
# Run several Playwright test GROUPS concurrently, each with its own static
# server (APEX_PORT), its own worker pool, and its own line-reporter log —
# so a long suite runs in a fraction of the wall time and a stall is visible
# in (and attributable to) one group's log instead of a silent foreground run.
#
# Usage:
#   tools/test-shards.sh smoke api collision          # npm test:<group> names
#   WORKERS=2 tools/test-shards.sh circuit barriers   # workers per group
#   LOGDIR=artifacts/logs BASEPORT=3470 tools/test-shards.sh smoke parts
#
# Notes:
#   - Groups come from package.json's test:<group> scripts.
#   - Total browser processes = groups x WORKERS; this box has few cores and
#     renders via SwiftShader (CPU), so 2-3 groups x 2 workers is the sweet
#     spot — more just thrashes.
#   - Logs: $LOGDIR/<group>.log (tail -f to watch). Reports/artifacts land in
#     artifacts/report-<port>/ and artifacts/test-results-<port>/ per group.
#   - Exit code is non-zero if ANY group fails; a per-group summary prints
#     at the end.
set -u
IN=("$@")
[ ${#IN[@]} -gt 0 ] || { echo "usage: $0 <group> [group...]   (runs npm test:<group> concurrently)"; exit 2; }
WORKERS="${WORKERS:-2}"
LOGDIR="${LOGDIR:-artifacts/logs}"
BASEPORT="${BASEPORT:-3461}"
mkdir -p "$LOGDIR"

# SPLIT=N additionally fans EACH group out over N Playwright shards
# (--shard=k/N), each shard on its own port with its own log — so one big
# group like `circuit` can occupy N servers instead of one. Total browser
# processes = groups x SPLIT x WORKERS; size to your core count.
SPLIT="${SPLIT:-1}"

pids=(); names=()
i=0
for g in "${IN[@]}"; do
  # --workers/--shard are Playwright flags; a `node --test` group rejects them,
  # so only forward them to groups that actually run through run-playwright.
  script=$(node -e "process.stdout.write((require('./package.json').scripts['test:$g'])||'')")
  [ -n "$script" ] || { echo "unknown group: test:$g"; exit 2; }
  pw=0; case "$script" in *run-playwright*) pw=1;; esac
  for ((k = 1; k <= SPLIT; k++)); do
    port=$((BASEPORT + i))
    name="$g"; extra=()
    if [ "$pw" -eq 1 ]; then
      extra=(--workers="$WORKERS")
      if [ "$SPLIT" -gt 1 ]; then name="$g.$k-of-$SPLIT"; extra+=(--shard="$k/$SPLIT"); fi
    fi
    log="$LOGDIR/$name.log"
    echo "> test:$g ${extra[*]:-}  port=$port  log=$log"
    APEX_PORT=$port npm run --silent "test:$g" ${extra:+--} "${extra[@]}" >"$log" 2>&1 &
    pids+=($!); names+=("$name"); i=$((i + 1))
    # a node --test group ignores SPLIT (no sharding support): run it once
    [ "$pw" -eq 0 ] && break
  done
done

fail=0
for j in "${!pids[@]}"; do
  wait "${pids[$j]}"; code=$?
  # The reporter's terminal "= run <status>" line (and any "x FAIL") — these
  # are real newline-terminated lines, unlike the \r-rewritten progress counter
  # in between, which is why the pattern anchors on them and nothing looser.
  summary=$(grep -aE '= run (passed|failed|timedout|interrupted)|x FAIL' "$LOGDIR/${names[$j]}.log" | tail -3 | tr '\n' ' ')
  printf '%-12s exit=%-3s %s\n' "${names[$j]}" "$code" "${summary:-<no summary — check log>}"
  [ "$code" -ne 0 ] && fail=1
done
exit $fail
