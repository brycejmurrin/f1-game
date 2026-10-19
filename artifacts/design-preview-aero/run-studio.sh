#!/bin/bash
# B·D3 studio captures: candidate + its clone base at identical framing, camera aimed at the part.
cd /home/user/f1-game
S=artifacts/design-preview-aero/studio
run() { # cat id q34(az,el,dist) look looky — skips an id already captured (resume)
  local cat=$1 id=$2 q=$3 lk=$4 ly=$5
  [ -f $S/$id/phone.png ] && return 0
  node tools/car/render-car.mjs --team=mclaren --$cat=$id --exp=1.35 --look=$lk --looky=$ly --shot=q34,$q --shot=side,90,4,3.4 --shot=top,0,80,3.6 --out=$S/$id || echo "FAIL $id"
  node tools/car/render-car.mjs --team=mclaren --$cat=$id --exp=1.35 --look=$lk --looky=$ly --w=844 --h=390 --shot=phone,${q%,*},5.4 --out=$S/$id || echo "FAIL phone $id"
}
for row in "aero spoon_wing low 35,20,3.0 -1.8 0.45" "aero beam_twin high 25,8,3.0 -1.8 0.2" "aero monkey_seat extreme 35,22,3.0 -1.8 0.35" \
           "aero bridge_wing medium 150,18,3.0 1.8 0.1" "aero x_wings rake_setup 125,24,3.6 0 0.4" "floor double_diffuser gurney_edge 20,5,2.8 -1.8 0.05"; do
  set -- $row
  run $1 $2 $4 $5 $6; run $1 $3 $4 $5 $6
done
echo "= studio done"
