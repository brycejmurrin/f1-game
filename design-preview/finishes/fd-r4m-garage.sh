#!/bin/bash
# Round 4 matrix, garage column: the G3 "broadcast" lighting mood (GarageScene MOODS.broadcast, L21's
# cursor/design-integration-59af), default work lamp, 3 teams x 3 cameras, 1600x900 dpr 1, TLX.
# The mood is not on this branch, so run it from a LOCAL merge (never pushed):
#   git worktree add --detach scratch/wt-g3 origin/cursor/design-integration-59af && (cd scratch/wt-g3 && git merge <this branch>)
#   ln -s ../../node_modules scratch/wt-g3/node_modules
# plus two local-only patches there: garage-angles appends $APEX_GA_QUERY to the game url, and probe-page's gotoGame
# pins renderScale(1) + govHold when APEX_GA_PIN is set (not renderClock: frozen, a design switch never presents
# and CDP capture times out; the garage has no time-of-day drift to freeze).
# Garage --cam is radians: side az 1.57; graze az 2.45 el 0.10; spec = high over the car under the key lights.
# Usage: fd-r4m-garage.sh <wt dir> <finish> [finish...]   (frames land as <team>-finish-<f>-hero_az<deg>_el<deg>_d<m>.png)
WT=$1; shift
OUT=/home/user/f1-game/artifacts/finish-designs/r4m/garage-raw
CAMS=${CAMS:-"hero:1.57,0.12,4.6;hero:2.45,0.10,4.2;hero:2.2,0.75,4.4"}
cd "$WT" || exit 1
# All finishes in ONE garage-angles run (boot dominates: ~6 min for the first frame); --resume skips frames on disk.
D="[$(for f in "$@"; do printf '{"finish":"%s"},' $f; done | sed 's/,$//')]"
APEX_GA_QUERY="?garageMood=broadcast" APEX_GA_PIN=1 timeout 5400 node tools/shot/garage-angles.mjs \
  --team=williams,ferrari,haas --preset=none --sheet=0 --label=0 --viewport=1600x900 --dpr=1 --backend=three \
  --design="$D" --cam="$CAMS" --resume --out="$OUT" > "$OUT.log" 2>&1
echo "= garage $? $(ls "$OUT" | grep -c png)"
