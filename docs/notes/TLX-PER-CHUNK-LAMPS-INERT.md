# TLX per-chunk lamps are inert — one grid, many chunked records

Measured 2026-09-15. `apex26.gfxBackend=three`, singapore (night by default —
`__apex.race()` resolves `timeOfDay || "default"` and the circuit carries
`night: true`).

## The finding

Toggling `perChunkLights` changes the three.js frame by AT OR BELOW the noise
floor, everywhere:

| region        | off->on | noise (off->off2) |
|---------------|---------|-------------------|
| scenery left  |  0.03%  | 0.04% |
| scenery right |  0.00%  | 0.01% |
| scenery upper |  0.48%  | 0.50% |
| far road      |  0.02%  | 0.04% |

(% of pixels differing by >8/255, 1280x720.) The grid bakes correctly the
whole time: `{on:true, lamps:249, chunks:122, idx:1192, gw:22, gh:14, cell:72}`.

## Why

The bake runs inside the per-record draw loop in `tlx.js`:

    for (let i = 0; i < drawList.length; i++) {
      const rec = drawList[i];
      if (rec.chunked) { ... buildGrid(table, chs); lit.setLampGrid({...}); }
    }

`_lgKey` / `_lgSrc` / `_lgChunks` / `_lampGridState` are SINGLETONS and
`setLampGrid` installs ONE grid into the shared material. Several chunked
records means each iteration overwrites the last one's grid: the final record
wins and every other record's fragments look up a grid built for chunks that
are not theirs. They land outside its extent, or on a count-0 cell, and take
the fallback that `tsl-lit.js` documents — "a miss degrades to today's
picture, never to darkness". Silent, and pixel-identical.

`chunkState()` reports **567** chunks drawn. The grid covers **122**.

## The fix

The lamp set for a cell is a property of WORLD POSITION, not of which record's
geometry sits there, so the grid should be built ONCE over the union of every
chunked record's chunks rather than per record. Two records covering the same
cell want the same lamps; merging is more correct, not just cheaper.

## What this cost, and the traps

Seven measurement faults before the real one surfaced. Recorded because each
would mislead the next person the same way:

1. `--ls apex26.perChunkLights=1` sets a key NOTHING reads. Lighting knobs live
   in one JSON blob at `apex26.lightTune` (`profiles.js` `store.get("lightTune")`).
   The flat `{id:number}` form is promoted to the `"*"` profile.
2. Whole-frame mean luma cannot see this feature; it lights a small region.
3. The census drifts camera POSE and internal RENDER SCALE between runs
   (rt 1152x648 vs 1024x576) — never compare two census frames without them.
4. `_lampGridState` was stale on the off path: it reported `{on:true}` with the
   knob at 0. Fixed in the commit that adds this note's sibling.
5. The knob does not take effect promptly — a 2500 ms sleep still captured the
   PREVIOUS setting. Wait for `lightState().tlxLampGrid.on` to agree, never sleep.
6. `lampCull` ("LAMP COUNT") ships at **40** of 48 slots, so `numLights` never
   exceeded 41 on five night circuits at seven positions each. The 48-lamp
   ceiling this feature exists to beat is NOT reached in normal play. Raise it
   to 48 to reproduce the starvation condition at all.
7. Car speed: `jump(s, 55, 0)` moves the car between captures and was the 0.81%
   far-road "noise floor". Park it.

`lampFlicker` (0.10) and the warm-up ramp matter less than the above but should
be zeroed for a still comparison.

## Reproducing

`scratch/lamp-ab.mjs` (untracked; `scratch/` is gitignored) boots TLX pinned to
WebGL2, parks with the cockpit camera down the road, raises `lampCull` to 48,
freezes flicker/warm-up, then captures OFF / ON / OFF waiting each time for the
readback to agree with the knob. The third capture gives the noise floor.

Item 6 is worth more than the shader fix: if the shipped `lampCull` default
never saturates the slot budget, per-chunk lamps solve a problem the shipped
configuration does not have.
