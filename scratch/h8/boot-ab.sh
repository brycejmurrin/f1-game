#!/bin/bash
# Boot PR A/B on the phone profile: base (3461) vs PR (3462), alternating, one browser at a time.
cd /home/user/f1-h8-bootbase && python3 -m http.server 3461 >/dev/null 2>&1 & A=$!
cd /home/user/f1-h8-boot && python3 -m http.server 3462 >/dev/null 2>&1 & B=$!
sleep 2; cd /home/user/f1-game
for be in three webgl2; do for i in 1 2 3; do for side in base:3461 pr:3462; do
  echo "## $be ${side%%:*} $i loadavg $(cut -d' ' -f1 /proc/loadavg)"
  timeout 600 node scratch/h8/boot-probe.mjs "http://localhost:${side##*:}/" --cpu 4 --net fast4g --backend $be --tap 2>&1
done; done; done
kill $A $B; echo "= done"
