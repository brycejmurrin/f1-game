#!/bin/bash
# Car-build slice A/B: base = #3386 @0a8e3803 (/home/user/f1-h16-base:3461) vs slice @af58a7bd (this checkout:3462).
cd /home/user/f1-h16-base && python3 -m http.server 3461 >/dev/null 2>&1 & A=$!
cd /home/user/f1-game && python3 -m http.server 3462 >/dev/null 2>&1 & B=$!
sleep 2; cd /home/user/f1-game
for rep in 1 2; do for spec in race:5000 garage:5000 race:2000; do for side in base:3461 pr:3462; do
  target=${spec%%:*}; at=${spec##*:}
  echo "## ${side%%:*} $target $at $rep loadavg $(cut -d' ' -f1 /proc/loadavg)"
  timeout 400 node scratch/h16/tap-probe.mjs "http://localhost:${side##*:}/" --target $target --at $at 2>&1 | grep -v "^$"
done; done; done
kill $A $B; echo "= done"
