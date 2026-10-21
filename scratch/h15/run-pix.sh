#!/bin/bash
cd /home/user/f1-game
for cfg in "monza day" "monaco day" "spa day" "suzuka night" "monza night"; do node scratch/h15/split-pix.mjs $cfg; done
echo "= pix done"
