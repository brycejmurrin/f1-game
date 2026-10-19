#!/bin/bash
# Round 3 full shoot @ 808403be: all 31 preview finishes (ids 60-90), current shader versions.
cd /home/user/f1-game
O=artifacts/finish-designs/r3
ALL="oilslick frozen fluoro burnt holo alubare rawcarbon flovis carbonfade silverfade metalflop truematte pearlwhite raceworn jpsgold testcamo goldfoil anodblue cerabronze engineturn magchrom ghostpearl xirallic mystichrome midnightpurple ultrablack rainsoak stealth primer heatrear sunfaded"
D="[$(for f in $ALL; do printf '{"finish":"%s"},' $f; done | sed 's/,$//')]"
G="node tools/shot/garage-angles.mjs --team=ferrari --preset=none --sheet=0"
timeout 3600 $G --backend=three --views=hero --design="$D" --out=$O/hero; echo "= hero $?"
timeout 3600 $G --backend=three --views=hero --dist=3.2 --el=0.22 --design="$D" --out=$O/close; echo "= close $?"
timeout 1500 $G --backend=webgl2 --views=hero --design='[{"finish":"oilslick"},{"finish":"burnt"},{"finish":"holo"},{"finish":"flovis"},{"finish":"silverfade"},{"finish":"goldfoil"},{"finish":"mystichrome"},{"finish":"stealth"}]' --out=$O/glx; echo "= glx $?"
pair() { timeout 900 node tools/shot/garage-angles.mjs --backend=three --preset=none --sheet=0 --team=$1 --views=$3 --design="$2" --out=$O/pairs; echo "= pair $1 $?"; }
pair mercedes    '[{"finish":"silverfade"},{"finish":"alubare"}]' side
pair williams    '[{"finish":"carbonfade"}]' side
pair mclaren     '[{"finish":"flovis"},{"finish":"fluoro"}]' side
pair redbull     '[{"finish":"stealth"},{"finish":"truematte"}]' side
pair astonmartin '[{"finish":"metalflop"}]' front
for f in $ALL; do
  APEX_SHOT_FINISH=$f timeout 420 node tools/shot/shot.mjs monza 0.12 orbit $O/race/$f-day.png --az -0.5 --el 0.2 --dist 7 --tod day --team ferrari --wait 40 2>&1 | grep -E "shot failed" | head -1
  echo "= race $f $(test -f $O/race/$f-day.png && echo ok || echo MISSING)"
done
echo "= all done"
