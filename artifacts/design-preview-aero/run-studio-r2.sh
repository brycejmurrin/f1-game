#!/bin/bash
# Round-2 reshoot of the changed candidates only (bases unchanged: round-1 frames reused from r1/).
cd /home/user/f1-game
S=artifacts/design-preview-aero/studio
run() { # cat id q34(az,el,dist) look looky extra-shots
  local cat=$1 id=$2 q=$3 lk=$4 ly=$5 side=$6
  [ -f $S/$id/phone.png ] && return 0
  local extra=""; [ "$side" = side ] && extra="--shot=side,90,4,3.4"
  node tools/car/render-car.mjs --team=mclaren --$cat=$id --exp=1.35 --look=$lk --looky=$ly --shot=q34,$q $extra --out=$S/$id || echo "FAIL $id"
  node tools/car/render-car.mjs --team=mclaren --$cat=$id --exp=1.35 --look=$lk --looky=$ly --w=844 --h=390 --shot=phone,${q%,*},5.4 --out=$S/$id || echo "FAIL phone $id"
}
run aero x_wings 125,24,3.6 0 0.4 side
run aero monkey_seat 35,22,3.0 -1.8 0.35 side
run aero bridge_wing 150,18,3.0 1.8 0.1
run aero beam_twin 25,8,3.0 -1.8 0.2
run floor double_diffuser 20,5,2.8 -1.8 0.05
echo "= studio r2 done"
