#!/bin/bash
# Round 5 shoot: re-tuned heroes, join close-ups, a 12 m motion pair vs gloss, GLX parity. 23 captures.
cd /home/user/f1-game
O=artifacts/finish-designs/r5
D() { echo "[$(for f in $*; do printf '{"finish":"%s"},' $f; done | sed 's/,$//')]"; }
G="node tools/shot/garage-angles.mjs --team=ferrari --preset=none --sheet=0 --viewport=844x390"
timeout 2400 $G --backend=three --views=hero --design="$(D oilslick frozen flovis metalflop truematte jpsgold ghostpearl xirallic midnightpurple rawcarbon)" --out=$O/hero; echo "= hero $?"
timeout 1200 $G --backend=three --views=hero --dist=2.4 --el=0.10 --design="$(D flovis metalflop oilslick xirallic frozen)" --out=$O/close; echo "= close $?"
timeout 1200 $G --backend=three --views=hero --clamp=0 --dist=12 --el=0.22 --az=2.45,2.47 --design="$(D gloss xirallic jpsgold)" --out=$O/motion; echo "= motion $?"
timeout 900 $G --backend=webgl2 --views=hero --design="$(D frozen ghostpearl)" --out=$O/glx; echo "= glx $?"
echo "= all done"
