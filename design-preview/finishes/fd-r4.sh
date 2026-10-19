#!/bin/bash
# Round 4 shoot: the 18 reserved finishes (TLX phone hero), join close-ups, GLX parity. <= 25 captures.
cd /home/user/f1-game
O=artifacts/finish-designs/r4
SHIP="oilslick frozen fluoro burnt alubare rawcarbon flovis carbonfade silverfade metalflop truematte pearlwhite jpsgold ghostpearl xirallic mystichrome midnightpurple ultrablack"
D() { echo "[$(for f in $*; do printf '{"finish":"%s"},' $f; done | sed 's/,$//')]"; }
G="node tools/shot/garage-angles.mjs --team=ferrari --preset=none --sheet=0 --viewport=844x390 --dpr=2"
timeout 3000 $G --backend=three --views=hero --design="$(D $SHIP)" --out=$O/hero; echo "= hero $?"
timeout 1200 $G --backend=three --views=hero --dist=2.4 --el=0.10 --design="$(D silverfade flovis metalflop oilslick)" --out=$O/close; echo "= close $?"
timeout 900 $G --backend=webgl2 --views=hero --design="$(D silverfade jpsgold)" --out=$O/glx; echo "= glx $?"
echo "= all done"
