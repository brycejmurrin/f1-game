#!/bin/bash
# Garage quiet-gate A/B: base = #3382 tip (/home/user/f1-h8-boot, 3461) vs PR (/home/user/f1-h8-gp, 3462).
cd /home/user/f1-h8-boot && python3 -m http.server 3461 >/dev/null 2>&1 & A=$!
cd /home/user/f1-h8-gp && python3 -m http.server 3462 >/dev/null 2>&1 & B=$!
sleep 2; cd /home/user/f1-game
for rep in 1 2; do for target in race garage; do for at in 500 2000 5000; do for side in base:3461 pr:3462; do
  echo "## ${side%%:*} $target $at $rep loadavg $(cut -d' ' -f1 /proc/loadavg)"
  timeout 400 node scratch/h8/tap-probe.mjs "http://localhost:${side##*:}/" --target $target --at $at 2>&1 | grep -v "^$"
done; done; done; done
kill $A $B; echo "= done"
