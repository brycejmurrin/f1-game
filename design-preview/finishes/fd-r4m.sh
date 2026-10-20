#!/bin/bash
# Round 4 matrix, race-daylight column: finish x 3 teams x 3 angles, Monza day, 1600x900 dpr 1, close orbit.
# Usage: fd-r4m.sh <finish> [finish...]   (gloss = the diff baseline). One Chromium per finish (APEX_SHOT_FINISH).
# shot.mjs orbit az/el are DEGREES from the car's nose (az 90 = right side, 270 = left). Monza day sun: 65 deg left
# of the nose, 48 deg up, so the specular camera sits opposite it (az 115, el 45) and catches it off the top panels.
cd /home/user/f1-game
O=artifacts/finish-designs/r4m/day
mkdir -p $O
for F in "$@"; do
  node -e '
const [O,F]=process.argv.slice(1);const J=[];
const A=[["side",90,8,4.4],["graze",140,6,4.0],["spec",115,45,4.2]];
for(const t of ["williams","ferrari","haas"])for(const [n,az,el,d] of A)
  J.push({trackId:"monza",frac:0.03,cam:"orbit",az,el,dist:d,tod:"day",team:t,width:1600,height:900,dpr:1,out:`${O}/${F}-${t}-${n}.png`});
require("fs").writeFileSync(`${O}/${F}.jobs.json`,JSON.stringify(J));' $O $F
  APEX_SHOT_FINISH=$F timeout 900 node tools/shot/shot.mjs --batch $O/$F.jobs.json > $O/$F.log 2>&1
  echo "= $F $? $(ls $O/$F-*.png 2>/dev/null | wc -l)"
done
echo "= batch done"
