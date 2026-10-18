# Track debug sweeps and one-off recipes

Load this when comparing circuits, auditing street half-widths, or capturing
orbit PNGs. The hook tables and corner-name rules are in track-geometry.md.

## One-off queries

```sh
# official turn count vs curvature peaks:
node tools/shot/apex-eval.mjs spa "({official:a.info().turns, peaks:a.corners().length})"
node tools/shot/apex-eval.mjs spa "a.trackInfo({what:'corners'})" --raw   # curated FIA list

node tools/shot/apex-eval.mjs monza "a.wallStats()"
node tools/shot/apex-eval.mjs monaco "a.groundY(0.18, 10)"          # gap finder at a corner
node tools/shot/apex-eval.mjs suzuka "a.trackProfile(40)" --raw     # full elevation profile
```

## Street circuits (`street: true`)

Street layouts are track defs with `street: true` — continuous barrier envelope,
no terrain ribbon. Currently: **monaco**, **singapore**, **vegas**, **baku**,
**jeddah** (verify with `grep 'street: true' js/circuits/*.js` if the roster
changes). `wallStats().street` mirrors the flag; `trackProfile().hw` is still the
**road** half-width — compare the two, not either alone.

### Half-width vs barrier (one-liner)

```sh
for id in monaco singapore vegas baku jeddah; do
  node tools/shot/apex-eval.mjs "$id" "(({id:'$id', hw:a.trackProfile(80).map(p=>p.hw), w:a.wallStats()}))" --raw
done
```

Compute min/max/mean of `hw` from the profile array; compare against `w.minOverHw`.

## Parallel multi-track sweep (compare all circuits fast)

Use `createGame({track})` from `tools/lib/game-vm.cjs` for numeric profiles,
close each game in `finally`, and process tracks sequentially. Browser fallbacks
are parent-owned and serialized; geometry alone needs no Chromium. Recompute elevation each time (`max y - min y` over `trackProfile(1000)`); do not quote old figures.
Does terrain clip a section? Sweep `groundY` over a frac window and lateral offsets, print the worst `overRoad`:
see [terrain-sweep](#terrain-over-road-sweep-vm) below.

`lightState().numLights` is a quick night/floodlit tell (>0 = dark session with
floodlights built; 0 = bright day).

## Validate visually

```sh
node tools/shot/apex-capture.mjs tracks scratch/captures/apex-capture/tracks            # one orbit PNG per circuit
node tools/shot/apex-capture.mjs tracks scratch/captures/apex-capture/tracks spa monza  # just these two
```
The manifest flags any `blank:true` render. For geometry regressions the full
suite's `terrain-over-road.spec.js` and `tracks-walls.spec.js` are the assertions;
these hooks are how you investigate a failure. After any `js/circuits/*` edit, run
`node tools/track/verify-track.cjs <id>` first (see the **new-track** skill).

## Terrain-over-road sweep (VM)

A whole-lap scan for any id is `track-geometry.md` §Whole-lap recipe; this is the narrow version,
for one known window (the spa id and the 0.13-0.18 frac range below are an example: change both).
Script under `scratch/`; `f` is the RACING frac (`s = f * total`, already past `_sceneryShift`), `lat` is metres, +right.
```js
const {createGame}=require("../tools/lib/game-vm.cjs");
(async()=>{const g=await createGame({track:"spa"}),a=g.apex;let w={overRoad:-9};
for(let f=0.13;f<=0.18;f+=0.0025)for(const lat of [-12,-6,0,6,12]){const r=a.groundY(f,lat);
if(r&&r.overRoad!=null&&r.overRoad>w.overRoad)w={f,lat,overRoad:r.overRoad};}
console.log(w);process.exit(0);})();
```
`overRoad > 0` is terrain above the banked surface (a defect). Pick lat values inside the half-width (`trackProfile(n)[i].hw`).
