# Pit lane — the open items after the walls batch (plan, 2026-09-16)

> Plan only; nothing implemented. Every claim was checked against the tree at
> `892f2cd` and carries a `file:line`. Companion to
> `PIT-GUIDANCE-STRATEGY-PLAN-2026-09.md` (the driver-facing work); this one is
> the loose ends the walls batch (171f990) left, in the order they bite.

## 1. The far PIT ENTRY board is placed by a number, not by what stands there

**Facts.** The two approach boards stand `TrackPit.SIGN.boardM` metres before
the entry road peels off — `[45, 95]` (`js/track/core/pit.js:49`). The far one was
110 until Nürburgring's grazed a tree trunk there; 95 clears it. The only thing
the placement checks is the BARRIER line (`bar[k]`, `js/track/scenery/pits.js:303-307`):
a board is skipped where the barrier leaves it no room, and stands anywhere else,
trunk or not. The circuit's own scenery is built BEFORE the complex
(`def.scenery()` at `js/track/tracks.js:2040`, `SceneryPits.build` at `:2248`), so
by the time the board is placed every tree, post and hut on that verge is already
in the mass hash — but `massBlocked` (`tracks.js:1346`) is not on the `ctx` the
pit builder receives (`:2248`), so it cannot ask.

**Design.** Hand `massBlocked` to `SceneryPits.build` on `ctx`, and place each
board at the FIRST clear node walking back from its nominal distance: try
`boardM[i]`, then +4 m, +8 m … up to +24 m, and take the first node where
`massBlocked(c, boardW/2 + 0.3, 0.2, basis)` is false AND the barrier test passes.
No clear node in 24 m → skip that board (the road chevrons remain, as today). Put
110 back as the far distance: the walk is what makes it safe, not the number.

**Tests.** `tests/unit/pit-signs.test.mjs` already asserts 1–3 boards and their
cells. Add: on Nürburgring the far board's anchor is ≥ 105 m before `sA`
(it walked, it did not vanish), and `tools/track/clip-audit.cjs nurburgring`
stays at its baseline (`tools/track/clip-baseline.json:30`, 14). Every circuit's
board count is unchanged or up, never down, against the current build — a
table-driven check in the same file.

**Cost.** pits.js +12, tracks.js +1 (the ctx field), pit.js `boardM` back to
`[45, 110]`, test +15. Sweeps re-run (`npm run test:sweeps`).

## 2. A planned stop arms a lap early

**Facts.** `PitLane.think` runs every tick for every AI car in the race
(`js/game.js:3777`) and arms as soon as `AiDrive.pitNow` says so
(`js/race/pit-lane.js:1098-1115`), with `lapsToStop = nextAt − c.lap`. The lap
counter increments at the line, and the line is INSIDE the pit window — the
window opens up to 260 m before it and closes 110 m after (`pit.js:73`) — so a
car whose plan says "lap N" crosses the line, sees `lapsToStop === 0`, arms, and
is already past the entry road. It circulates a whole lap armed and stops on lap
N+1. The Bahrain hunts count it: `c_leftWindowArmed` is 17 of 21 stops on every
run since the counter existed (`scratch/pit-hunt.cjs:206`), and the exit-lane
tests never see it because they arm by hand at the approach.

**Design.** Arm on the APPROACH, not the line. In `think`, when the car is on
the lap before its planned lap (`lapsToStop === 1`) and within `CUE_M` (550 m,
`:523`) of the entry road with the entry still ahead (`toEntry(c) > 0`), treat
`lapsToStop` as 0. Symmetrically, when `lapsToStop === 0` but the entry road is
already behind on this lap, do NOT arm — `pitNow` runs again next tick and the
approach rule catches it one lap later, which is what happens today anyway,
minus the lap spent armed. The two non-plan reasons (wrong tread, the cliff,
`ai-drive.js:784-788`) keep arming immediately: a car on slicks in the rain
should show BOX the whole lap.

**Tests.** `tests/unit/pit-lane.test.mjs` has the VM harness: a car with
`pitPlan.lapsAt = [3]` placed 400 m before the entry on lap 2 arms; the same
car placed 50 m past the entry road on lap 3 does not, and arms 400 m before
the entry on lap 3. The hunt's counter reads 0 on a Bahrain run.

**Cost.** pit-lane.js +10, test +25. One Bahrain hunt (`node
scratch/pit-hunt.cjs bahrain 10 --only4`, ~8 min, VM).

## 3. The pit-wall crest panels face the lane only

**Facts.** `emitPanel` (`pits.js`, the panels block after `emitBoard`) lays each
panel with normal `+sd·r`, toward the lane, on a dark plate grounded through the
wall. From the track — the chase and TV cameras' side, and the only side a
rival's driver sees — the wall shows the plate's back. A real pit wall carries
the team's name toward the TRACK (the pit stands face the circuit).

**Design.** A second quad per panel on the plate's track face (normal `−sd·r`,
reader's right `−sd·t`), same cell. Twelve more quads in `signs`, listed as
`panels` with a `face` field so the painter's quad order stays fascias, boards,
panels (lane), panels (track), crests; `pit-signs.test.mjs` indexes by that
order and gets one more block. The plate is already 6 cm thick, so both decals
sit a centimetre proud of their own face.

**Tests.** The panel block of `pit-signs.test.mjs` runs twice with the sign of
the normal flipped; the count is `2 × S.cells`.

**Cost.** pits.js +20 (a `face` parameter on `emitPanel`), test +10.

## 4. The neon at night has not been seen on a GPU

**Facts.** Every night frame from this container is washed out (SwiftShader,
`docs/notes/CI-RENDERING-PERFORMANCE.md`): the LED strips, the door tubes and
the stop gate were signed off as geometry and colour, not as a lit image. The
over-white trick they use is the same one the mast heads and the canopy lens
use (`glsl-lit.js`, `PIT-LIGHTING-PLAN-2026-09.md` §2), so they will glow, but
HOW MUCH — the 2.2× + 0.25 in `pits.js` `led` — was chosen blind.

**Design.** Dispatch `gpu-census.yml` on `macos-latest` with a night Bahrain
pit-row frame added to its "Game check — GLX / WebGL2" step (it already boots
the game there, `.github/workflows/gpu-census.yml:241`), upload the PNG in the
`gpu-census-macos-latest` artifact, and read it. If the strips bloom into the
canopy or the gate bleaches the box paint, drop the night multiplier to 1.8 and
re-shoot; if they read dim, raise the offset to 0.35. One constant, two values,
decided on a real frame.

**Tests.** None: it is a look decision. Record the chosen values and the frame in
`PIT-LIGHTING-PLAN-2026-09.md`.

**Cost.** gpu-census.yml +8 (one shot line), one dispatch (~15 min on the mac
runner).

## 5. The entry road's track side is a line and cones

**Facts.** By design: the wall grows only over the last `grow` metres of the
entry road (`pit.js:196`, 30 m), because a car must cross the peel line to
enter; before that the separation is the painted line and a cone every 8 m
(`pits.js:278-290`). The cones are 60 cm boxes; at 200 km/h they read late.

**Design.** Keep the line and the cones (the gap is the entrance). Add what a real
entry has: a painted HATCHED triangle on the road side of the line from the
road's start to where the wall grows — the FIA "no-go" chevron fill — as one
striped quad in `TrackMesh.buildPitLane` (`js/track/core/mesh.js`, next to the
entry chevrons), and a "PIT" road-paint word at the road's start. Paint, not
prims: nothing for the clip audit to count and nothing a car can hit.

**Tests.** `tests/unit/pit-complex.test.mjs`: the hatch's outer edge never
crosses the lane's inner edge (`p.off.fastIn·v`), and it ends where `p.v`
reaches 0.5.

**Cost.** mesh.js +25. `verify-track` on three circuits, the pit-complex suite.

## 6. Three Bahrain stops leave the road 500 m after the exit

**Facts.** The last hunt (`artifacts/tmp/pit-hunt-walls4-bahrain.log`) counts
`g_offroadAfterExit: 3` at `s ≈ 642–677 m`, 23 s after the exit road, at 20–32 m/s
with `|x| ≈ 7.1–8.2` on a 7 m half-width. That is T4 on cold tyres, not the lane:
the excursions are on the racing line, one wheel over the edge.

**Design.** Nothing in the pit code. If it is worth chasing, it is the out-lap
tyre temperature the AI's corner speed ignores (`ai-drive.js` reads grip, not
temperature) — a `tune-physics` / `ai-racecraft` item, not this plan's.

**Tests / cost.** None here; noted so the counter is not mistaken for a lane bug.

## 7. Order

1. §2 (a lap of pit loss on every planned AI stop, and a clean hunt counter).
2. §1 (the board walk; puts the far board back where it reads best).
3. §3 (panels toward the track: the TV side).
4. §5 (the hatch), §4 (one real-GPU frame), §6 (hand off).

§1–§3 and §5 are one commit each with their tests; §4 is a workflow dispatch
and a note. None needs a new browser group: the pit-lane spec and the sweeps
cover them.
