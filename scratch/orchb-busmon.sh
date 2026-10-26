#!/bin/bash
# OrchB bus monitor: emit lines to B/*/me, or any INCIDENT/GAME-SLOT/DONE; drop own.
cd /home/user/f1-game
ME=session_013JaBx1DysyB8dLCgGryvWL
cur=${1:-0890072}
while true; do
  out=$(node tools/ci/fleet-bus.mjs read --since "$cur" 2>/dev/null)
  n=$(printf '%s\n' "$out" | sed -n 's/.*cursor \([0-9a-f]*\).*/\1/p' | tail -1)
  [ -n "$n" ] && cur=$n
  printf '%s\n' "$out" | grep -v '^= ' | grep -v "from:claude:$ME" \
    | grep -E "to:(B[^ ]*|\*|claude:$ME)| INCIDENT | GAME-SLOT | DONE " | cut -c1-260
  sleep 60
done
