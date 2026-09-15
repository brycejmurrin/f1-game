# Lighting the pit complex at night — plan (2026-09-15)

> Plan only; nothing implemented. Every claim below was checked against the
> tree at `c70542d` and carries a `file:line`. Measurements come from the Node
> VM build (`tools/lib/track-build-vm.cjs`), no browser. Companion:
> `docs/research/PIT-LANE-REDESIGN-2026-09.md` (the complex itself).

## 1. Goal

The engine-built pit complex (`js/track/core/pit.js` model, `js/track/scenery/pits.js`
furniture) registers **no light source** and its "lights" are plain boxes. At night
the row of twelve bays is the darkest thing on the pit straight. The goal is a row
that reads like a real F1 pit lane after dark — a lit canopy over the working lane,
open garages glowing, a signal at the exit — using the existing lamp pipeline
(fixture → `track.lampPosts` → baked record → per-frame cull), costing at most **six
of the 48 light slots** when the player is on the straight, on all three backends,
with no shader change.

## 2. Facts (verified; corrections to the first pass marked ✗→✓)

**Pipeline.** Lamps are baked once per track by `TrackLights.buildTrackLights`
(`js/lighting/track-lights.js:193`) into flat 15-float records from `track.lampPosts`
(`:220`), re-seated to the nearest node by position (`resolvePostNodes`, `:101`),
then culled per frame in `FrameLights.setFrameLights` (`js/lighting/frame-lights.js:263`)
against `lampCap` (`:193`): 48 solo / `LT.lampCull` 40 with traffic / 24 on the mobile
tier / never above `LightBudget.slots()`. Budget constants: `js/render/shared/light-budget.js:13-17`
(MAX 48, MOBILE 24, LITE 16 for TLX-lite, CHUNK 24, TAIL_RESERVE 5). PerfGov shed is
`tierShed` (`frame-lights.js:216-222`): tier ≥ 1 → 32, tier ≥ 2 → 24. Lamps are fed only
when `isFloodActiveSession()` (`js/game.js:2208`: night/dusk/dawn, or default on a
`def.night` track) or the DAYTIME LAMPS knob is up (`game.js:6700-6708`); brightness
ramps by sun elevation at dusk/dawn (`:6742-6755`).

**Emissive.** ✗ "track props draw with emissive 0" → ✓ **only by day.** `_wmPropsDryN`
is *declared* with `emissive: 0` (`game.js:6083`) but the draw sets
`m.emissive = floodEmit` whenever `floodEmit > 0` (`game.js:6182-6184`), and
`_floodEmit` is 0.78 × `LT.floodEmitMul` at night, ≤ 0.70 at dusk/dawn (`:6875-6879`).
The shader then lerps to albedo and adds `smoothstep(0.50, 0.95, max(albedo)) × emissive ×
uGlowAmp × (1 + max(bright−1, 0) × uBloomBoost)` (`js/render/glx/shaders/glsl-lit.js:1606-1627`).
So **any over-white vertex colour in the props mesh already glows at night** — that is
how mast heads glow (`LENS_NIGHT` 1.06–1.40, `js/track/tracks.js:2117-2122`), how the
`led` hoarding ribbon glows (`js/track/scenery/structures.js:442-445`) and how city panes
glow (`js/track/scenery/city.js:65`). Vertex colours are packed at `COL_SCALE` 15
(`js/render/shared/vertex-pack.js:67`), half-float on TLX/WGX (`js/render/three/tlx-chunked.js:34`,
`js/render/webgpu/wgx.js:188`) — over-white survives on all three.
✗ "on track the same bay mesh is plain" → ✓ the bay's LED faces are baked at
`KEY_TINT × 1.14 = [1.32, 1.14, 0.89]` (`js/garage/scene.js:367, :436`), included by
`buildStatic` (`:1314-1331`) and copied verbatim by `TrackGeom.addMesh`
(`js/track/core/geom.js:270-274`), so **the bay strips already glow on track at night**;
what the bays lack is a *light record* (the garage screen's 11-fixture rig,
`scene.js:371-390, :477`, is drawn only there). There is no per-material emissive
(`MAT` ids at `geom.js:7` are texture layers only); emissive is per draw.

**Registration.** `lampPost(spec)` (`tracks.js:1968`, cap 96, `pos/k/side/kind/always/
aim/energy/radius`, tagged `custom`) and `ctx.registerMastLamp` (`:1987`, cap 512, tagged
`custom, mast`; radius read as a FLOOR, `track-lights.js:75`). Both are concatenated into
`track.lampPosts` at `:2173-2174`, **before** `SceneryPits.build` runs at `:2227-2228`, and
its ctx `{ track, out, rawBox, upOf, bankOffsetAt, curvature }` carries neither a
registrar nor `night`. `NIGHT` is `track._night ?? def.night` (`:215`, `:422`), visible in
that scope. A record with `glareW > 0` draws a lens-halo billboard (`glx.js:2415-2446`,
mirrored `wgx.js:5680`, `tlx.js:3127`) so it must sit on a drawn fixture within 1 m
(`tests/unit/lamp-fixture-anchor.test.mjs:103`); synth fills get `glareW 0`
(`track-lights.js:336`). Kinds: `LAMP_KINDS` (`:52-61`); `led` = 5000 K, cIn 0.84 / cOut
0.48, glareW 0.7.

**Energy.** `ePhys = intensity·bri·eMul·al²·poolEnergy / max(hAim/al, 0.35) · energy`
(`track-lights.js:377-379`) where `al` is the lens → **racing-road near-lane centre**
distance (`:352-364`), *not* to the point the lamp aims at; `aim` only redirects the cone
(`:368`). For a soffit 5.5 m over the working lane, 16 m from that near-lane centre, the
default is ~27× too hot — Monaco's tunnel soffits compensate with `energy 0.62` at 6 m
throw (`js/circuits/scenery/monaco.js:402-406`).

**Measured on the pit straight (VM, night build).** The generic verge masts stand at
`hw+6` (`tracks.js:2146`) and are skipped when `onTrack(…)` hits (`:2147`); inside the
complex `inPitFootprint` (`:644-656`) rejects anything past `hw + 4.3`. Result:

| circuit | side | lampPosts inside the complex, pit side / other side |
|---|---|---|
| monza, suzuka | +1 / −1 | **0** / 16, **0** / 10 |
| silverstone, abudhabi, albert_park | +1 | 1 (at the exit road, s≈192) / 9, 5, 15 |
| miami | −1 | 2 (entry/exit roads) / 10 |
| bahrain, qatar | −1 | 4, 8 tall masts at 34–39 m out (floodMast, radius 76–90) / 7, 8 |

The row (`row.s0..s1`, frac 0.995→0.018–0.020, 12 boxes at 11.0 m) is lit only by the
far side's masts 14–28 m away and Bahrain/Qatar's stadium banks. The pit-lane tarmac is a
decal in the `startline` mesh (`tracks.js:2293-2298`, drawn `game.js:6167`), one
unchunked draw — it is lit from the **global** culled set, never the per-chunk table.

**Circuits' own pit lighting.** All decoration, no record: `miami.js:316-329` (10 pairs at
`hw+10`; the pit-side (left) half is inside the keep-out — measured **0 of 10 left heads
survive, 8 right**), `suzuka.js:242-248` (8 on the right; pits are left), `silverstone.js:302-316`
(comment says pit straight; frac 0.44–0.485 is mid-lap), `abudhabi.js:233-240` (6 `tower`s
at side −1, pits +1, with *painted* pool discs), `vegas.js:228-258, 314-319` (street circuit,
no complex; a local `lampPost` closure shadows the api's). Only `floodMast`
(`js/track/scenery/identity.js:62-121`) registers. Also generic: `tracks.js:1921-1931` places
a "pit building" at side +1, 12 m out, with night light bars — superseded by the complex on
+1 circuits (silverstone `place`: 8 superseded) and on the wrong side elsewhere.

## 3. What a real F1 pit lane looks like at night

Bahrain, Singapore, Jeddah, Lusail, Yas Marina, Vegas: (1) a **continuous canopy** over
the working lane with LED battens every 2–4 m under its soffit — an even cool-white
(4000–5000 K) wash, working lane brighter than the fast lane; (2) **open garages are the
brightest thing in frame**, ceiling battens spilling through the roller doors; (3) the pit
wall is a low glow of monitors, not a lit structure; (4) the **exit signal** (green/red, blue
flashing on traffic); (5) the circuit floods cover the lane too. Deliver (1), then (4);
(2) already exists (§2); (3) is out of scope.

## 4. Design

```
plan view, pit side (sd = p.side), arc s →         LAT (m beyond hw)
 verge   ─────────────────────────────────────────  0..2
 platform+wall ═══════════════════════════════════  2..4     (v ≥ 0.98 only)
 fast lane ───────────────────────────────────────  4..7.5
 corridor ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈  7.5..8.5
 working lane      ☼        ☼        ☼        ☼     8.5..14   ☼ = canopy luminaire
 canopy edge  ───────────────────────────────────── 11.4      (2.6 m proud of the doors)
 doors  |bay0|bay1|bay2|bay3|bay4|bay5|…|bay10|bay11|  14     ☼ at bays 0-1,2-3,…,10-11 party lines
 roof / hospitality storey                          14..26.8
cross-section at a luminaire:      y
   hospitality (5.4..8.8) ┃██████████┃            8.8
   roof slab 5.2..5.6 ┏━━━┻━━━━━━━━━━┫ canopy 5.45..5.7, 2.6 m deep
   luminaire ▭ 5.3 (lens under the soffit, aim −u)  ↓ pool on the working lane
   lintel/door 4.8      │  bay  │
   apron 0.02 ──────────┴───────┴────── lat 11.4   14
```

**A. Canopy + luminaires (the light).** In the bay loop of `SceneryPits.build`
(`pits.js:167-213`) add per bay a RAW canopy slab: centre `atF(f, sd·(h + garage − 1.45) − bump,
B.h + 0.45 + lift, k)`, size `[2.6, 0.25, segAt(kap, sd·(h + garage − 1.45))]`, colour `ROOF`,
basis `bs`; the existing 6 mm `lift`/`bump` alternation keeps neighbouring slices off one
plane (coplanar sweep). On **even** bays only (`i % 2 === 0`, i.e. one fixture per 22 m —
the engine's tuned pool stride, `track-lights.js:138`) hang a luminaire under the soffit at
the party line with bay i+1: `along = +seg/2` in `bs[2]`, centre `atF(f, sd·(h + garage − 1.7),
B.h + 0.45 − 0.125 − 0.09, k)` offset by `along`, size `[0.5, 0.12, 2.4]`, colour
`lensAlbedo("led")` (= `LENS_NIGHT.led` `[1.16,1.24,1.36]` at night, `LENS_DAY.led` by day,
`tracks.js:2117-2128`). Register the same point:

```js
ctx.registerLamp({ pos: lens, k, side: sd, kind: "led",
  aim: [-f.u[0], -f.u[1], -f.u[2]],                 // straight down (Monaco soffit precedent)
  aimAt: atF(f, sd * (h + o.corrOut + o.workOut) / 2 /* workCentre */, 0, k) + along,
  radius: 18 });                                    // reaches wall (8 m) and bays, not the far kerb
```
Six records per circuit; pools overlap at the 22 m pitch (window `(1−(d/r)^4)^2` = 0.61
midway at r 18) and the `led` cone (cIn 0.84 / cOut 0.48) keeps the road edge (66° off
axis, cos 0.40) dark while the wall (58°) gets the skirt. Optional richer tier: all twelve
bays at r 14 when `!G.mobileTier` (the `CITY_LOD` gate, `tracks.js:416`).

**B. `aimAt` in the bake (generic, 6 lines).** In `buildTrackLights` before `al` is
measured (`track-lights.js:355-364`): `if (post && post.aimAt) { ax = aimAt−lx; … }`, then
`al` is the true throw and `hAim = max(ly − aimAt.y, 1)`. With it the pit lamp needs no
`energy` fudge: `ePhys ≈ 19·bri·1.05·30·0.55 ≈ 330` (Monaco's soffits land ~250). Fallback if
that edit is refused: `energy: 0.04` (= (5.5/16.9)² × 0.35 — recompute if the row moves).

**C. Exit signal (no record).** `pits.js:142-143` paints green `[0.2,0.9,0.3]` and red
`[0.9,0.15,0.1]` (both already glow ~0.9 at night). At night make the lit aspect over-white
(`[0.30,1.40,0.45]`) and the dead one dark (`[0.30,0.06,0.04]`) so it reads as a signal and
blooms via `hdrTag`; a light record would put a 2 m halo on a 28 cm lamp. State (red/blue
on traffic) is runtime, not build time — open question 3.

**D. Bays.** Nothing: the LED faces already glow (§2). The canopy lamp's hot core (33°)
reaches ~3 m inside the door, which lights the floor at the box; back walls stay dark —
acceptable, and an interior record would light the apron through the wall (no lamp shadows
except the nearest fixture, `js/render/shared/shadow-pass.js`).

**E. Plumbing (`tracks.js`).** (1) Hoist `LENS_NIGHT`/`LENS_DAY` out of the mast block
(`:2117-2128`) to function scope. (2) Beside `registerMastLamp` (`:1987`) add
`const pitLamps = [], PIT_LAMP_CAP = 32; const registerPitLamp = (spec) => …` writing
`{ k, side, x, y, z, kind, custom: true, pit: true, aim, aimAt, radius, energy }` (`custom`
keeps the street NEON washer off it, `track-lights.js:279`; not `mast`, so `radius` is an
override not a floor). (3) Pass `night: NIGHT, registerLamp: registerPitLamp, lensAlbedo:
(kind) => (NIGHT ? LENS_NIGHT : LENS_DAY)[kind]` in the ctx at `:2228`. (4) Immediately
after that call: `for (const l of pitLamps) track.lampPosts.push(l);` — the concat at
`:2173-2174` has already run, and nothing reads `lampPosts` before `buildProps` returns
(`hasAlwaysLamps`, `:2175`, is customLamps-only; the bake is per frame). Order of the
build call itself does not move.

**F. Chunk binding.** Props chunks are 72 m cells (`tracks.js:265`); `LampChunks.buildTable`
binds a lamp to every chunk within `radius` (`js/render/shared/lamp-chunks.js:44-45`), cap 24
nearest. At r 18 a canopy lamp reaches the bay/wall/terrain chunks of its own 72 m cell and
the neighbour, never a corner. The lane tarmac and road are global-set draws (§2), so the
lane pool depends on the frame cull only.

**G. Backends.** Records are backend-neutral: GLX `uLight[]`, WGX SBO rows (`wgx.js:3565`),
TLX uniform/texture grid; `drawGlow` is mirrored on all three. No shader or uniform changes,
so no parity work — only the TLX-lite cap (16) matters (§5). Boot evidence is still owed:
one live GLX frame (pit-shots) is the gate; WGX/TLX get `backend-compare.mjs` only if a
reviewer asks.

## 5. Implementation checklist (ordered)

1. `js/lighting/track-lights.js` `buildTrackLights` — `aimAt` support (~8 lines, §4B).
2. `js/track/tracks.js` — hoist lens tables (~0 net), `registerPitLamp` (~14), ctx fields
   (+2), push loop (+1). Ratchet: file is 2643 lines, ceiling 2680 (`tests/data/ratchets.json:20`)
   — stay under, do not `--update`.
3. `js/track/scenery/pits.js` — canopy slab + luminaire + registration in the bay loop
   (~30), exit-signal night albedo (~4), a `workCentre` helper (~3). Not ratcheted.
4. `tests/unit/pit-complex.test.mjs` — new test "the complex lights its row": on
   `silverstone` and `bahrain` exactly 6 posts with `pit`, all `kind "led"`, on the pit
   side (`lat·side > 0`), lateral within `[hw + off.workOut − 3, hw + off.workOut]`, 5.0–6.0 m
   above the road at their node, `k` inside `[row.s0, row.s1]`, present in `track.lampPosts`;
   `monaco` has 0 (~35 lines).
5. `tests/unit/lamp-fixture-anchor.test.mjs:125-147` — for a post with `aimAt`, measure the
   throw to `aimAt` instead of the centreline (~8 lines); the other three tests must stay
   at zero offenders on all 52 circuits unchanged.
6. Superseded circuit lighting (each a separate small commit, `verify-track <id>` each):
   `miami.js:324-328` delete the pit-side loop body (dead: measured 0 survivors) and register
   the stadium side via api `lampPost({ pos: head, k, side: 1, kind: "halogen" })` or delete it
   too (it duplicates the generic 22 m masts); `suzuka.js:242-248` and `silverstone.js:302-326`
   register heads the same way or leave (fix Silverstone's "pit straight" comment);
   `abudhabi.js:233-240` replace the 6 `tower`+painted-disc pairs with `floodMast(tk, −1, 20,
   { h: 36 })` from `identity.js` (registers; drop the painted `POOL` discs); `tracks.js:1926-1931`
   retire the generic pit building and its night bars (keep the grandstand). Vegas: leave
   (no complex; rename its local `lampPost` so it stops shadowing the api's).
7. `docs/DEBUG-HOOKS.md` §lightState: note `lampPosts` now includes 6 `pit` records on
   every non-street circuit; `docs/SCENERY-API.md` if `lensAlbedo` is exposed.

Estimated diff: ~65 lines engine/lighting, ~45 tests, −20 circuits.

## 6. Budget & risks

- **Slots.** Tier 0: 6 of 48 (40 with traffic) while on the straight; elsewhere the cull's
  distance ranking drops them. Tier 1 (32): fine. Tier 2 / mobile (24): 6 = a quarter of the
  set exactly where the far-side masts, 3 gantry downlights and (Bahrain) the stadium banks
  also compete; the row is what the player looks at there, so accept — the 12-lamp variant
  must stay desktop-only. TLX-lite (16): the six will be the nearest lamps in the lane and
  can push the road ahead out; the BEHIND-CAM BIAS / REACH knobs (`knobs.js:85-88`) already
  favour ahead. Measure with `__apex.lightState().numLights` on qatar night.
- **Lamp shadow pass** picks the nearest fixture (`shadow-pass.js`): a 5.5 m soffit becomes
  the shadow caster in the lane; watch for acne on the apron in the night shot.
- **Coplanar sweep** (`tests/unit/coplanar-faces.test.mjs`, `test:sweeps`): the canopy slice
  reuses `segAt`/`lift`/`bump`; the luminaire hangs 2 cm under the soffit, never flush.
- **Knobs**: LAMP DENSITY `< 1` may thin pit lamps like any custom lamp
  (`track-lights.js:153`); lens albedo is baked from `track._night` (day lens on a dusk
  race), as for the masts. A wrong `aimAt`/`al` makes pools 27× too hot — step 4 should
  also assert the baked record's max channel lies in `[150, 600]`.

## 7. Verification (AGENTS.md scale: engine + scenery + lighting)

1. `node tools/track/verify-track.cjs bahrain` (2 s), then `silverstone`, `monaco`.
2. `node --test tests/unit/pit-complex.test.mjs tests/unit/lamp-fixture-anchor.test.mjs
   tests/unit/floodmast-lamp-register.test.mjs` — pure Node, all 52 circuits build (minutes).
3. `npm run test:tooling-fast`; `npm run test:guards` (ratchets) before the commit.
4. One browser spec, backgrounded: `node tools/ci/test-bg.mjs` for
   `tests/specs/lighting-ab.spec.js` ("night light budget", `numLights ≤ 48`). Name
   `pit-lane.spec.js`, the circuit foundation specs and `test:sweeps` as not-run in the PR
   unless `pick-tests` names them.
5. Visual sign-off: `node tools/shot/pit-shots.mjs bahrain --tod night --teams none`
   (fast profile; add `--full` for the keeper), then `silverstone` (side +1, green theme);
   compare with `scratch/captures/pit-lane/`. Expect the working lane lit, the fast lane
   dimmer, halos on six luminaires, none floating. `__apex.lightState().lampPosts` rises by 6.

## 8. Open questions

1. Six fixtures at 22 m or twelve at 11 m — pick after the first night shot; the budget
   argues for six, realism (continuous battens) for twelve on desktop.
2. Should `aimAt` also retire Monaco's hand-tuned `energy` values? Only with a tunnel shot.
3. A live exit signal (red when closed, blue flashing on traffic) needs a per-frame
   emissive draw outside the props mesh — separate change. Pit-wall monitor glow: defer.
4. Should `dressingExclusions` of kind `lamps` suppress the canopy lamps? Proposed no: they
   are the complex's fixtures, not the generic mast pass.
