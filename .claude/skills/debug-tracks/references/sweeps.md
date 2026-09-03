# Track debug sweeps and one-off recipes

Load this when comparing circuits, auditing street half-widths, or capturing
orbit PNGs. The SKILL.md index is the hook tables and corner-name rules.

## One-off queries

```sh
# official turn count vs curvature peaks:
node tools/apex-eval.mjs spa "({official:a.info().turns, peaks:a.corners().length})"
node tools/apex-eval.mjs spa "a.trackInfo({what:'corners'})" --raw   # curated FIA list

node tools/apex-eval.mjs monza "a.wallStats()"
node tools/apex-eval.mjs monaco "a.groundY(0.18, 10)"          # gap finder at a corner
node tools/apex-eval.mjs suzuka "a.trackProfile(40)" --raw     # full elevation profile
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
  node tools/apex-eval.mjs "$id" "(({id:'$id', hw:a.trackProfile(80).map(p=>p.hw), w:a.wallStats()}))" --raw
done
```

Compute min/max/mean of `hw` from the profile array; compare against `w.minOverHw`.

## Parallel multi-track sweep (compare all circuits fast)

Validated pattern — 4 tracks profiled concurrently in ~10 s using parallel
Chromium workers (see the **playwright-probe** skill for the harness). Example output of a
profile sweep:

```
suzuka  18 official / 37 peaks  elev 12.0 m   maxk 0.042
monaco  19 official / 29 peaks  elev 27.5 m   maxk 0.060
spa     20 official / 42 peaks  elev 23.4 m   maxk 0.044
vegas   17 official / 27 peaks  elev  4.0 m   maxk 0.030   (night-default → numLights 32)
```

`lightState().numLights` is a quick night/floodlit tell (>0 = dark session with
floodlights built; 0 = bright day).

## Validate visually

```sh
node tools/capture/apex-capture.mjs tracks scratch/captures/apex-capture/tracks            # one orbit PNG per circuit
node tools/capture/apex-capture.mjs tracks scratch/captures/apex-capture/tracks spa monza  # just these two
```
The manifest flags any `blank:true` render. For geometry regressions the full
suite's `terrain-over-road.spec.js` and `tracks-walls.spec.js` are the assertions;
these hooks are how you investigate a failure. After any `js/circuits/*` edit, run
`node tools/track/verify-track.cjs <id>` first (see the **new-track** skill).
