#!/bin/bash
# B·H15: road-split A/B matrix — before (deploy tip), after (this branch), before2 (control: base again).
cd /home/user/f1-game
for cfg in "monza day" "monaco day" "spa day" "suzuka night" "monza night"; do
  set -- $cfg
  node scratch/h10-split-ab.mjs ../h10-base before $1 $2
  node scratch/h10-split-ab.mjs . after $1 $2
  node scratch/h10-split-ab.mjs ../h10-base before2 $1 $2
done
echo "= matrix done"
