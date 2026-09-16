# Street circuits get a REAL pit lane — plan (2026-09-15)

> Plan only; nothing under `js/`, `css/`, `tests/`, `tools/` is touched by this
> document. Every number below was measured in the Node VM
> (`tools/lib/track-build-vm.cjs`, `Tracks.build` on a def copy with a different
> `pit` key) on commit c70542d; the scratch scripts are regenerable from §2.
> Parent design: `docs/research/PIT-LANE-REDESIGN-2026-09.md` (§4.3 for the keep-out).

## 1. Goal

Baku, Jeddah, Monaco, Singapore and Vegas (`def.street: true`) today resolve to
`mode: "narrow"` → `painted: true` (`js/track/core/pit.js:60,79`): no ribbon, no
wall, no bays, and the keep-out loop exits on its first node (`pit.js:169`). The
five get the engine's built complex instead — a lane physically beside the road
behind a real pit wall, bays where the window holds them — with a STREET band
set sized for a lane between barriers, each def's scenery split so the lap-long
street walls stop at the complex and resume after it, and one engine fix so the
engine's own instanced street barrier does not stand on the lane.

## 2. Facts (measured)

Windows do not depend on mode, bands or side (only on curvature), so every
variant below shares them. `hw` is the road half-width across the window.

| circuit | side today→plan | sA / sIn / sOut / sB (racing frac) | entryM+exitM=lenM | roads / grow | row pitch (12 bays) | hw | authored-space window (pit side) |
|---|---|---|---|---|---|---|---|
| baku | +1 → +1 | .9203 / .9322 / .0207 / .0261 | 400+122=522 | 70/32, 16 | 11.0 (371→492) | 6.0 | same (racing, shift 0) |
| jeddah | +1 → −1 | .9643 / .9757 / .0065 / .0211 | 150+40=**190** | 70/90, 30 | **10.0 compressed** (50→160) | 6.0 | same (racing, shift 0) |
| monaco | +1 → +1 | .9326 / .9417 / .0273 / .0370 | 192+90=282 | 30/32, 15 | 11.0 (131→252) | 5.0 | source .2570→.1526 (descending), authored side **−1** (`SIDE` flips, tracks.js:306) |
| singapore | −1 → −1 | .9482 / .9543 / .0265 / .0448 | 224+130=354 | 30/90, 15 | 11.0 (203→324) | 6.0 | racing-mirrored .5816→.4850, authored side **+1** (reverse flips) |
| vegas | +1 → −1 | .9644 / .9757 / .0211 / .0356 | 150+130=280 | 70/90, 30 | 11.0 (129→250) | 7.0 | racing .1210→.1923 (shift .8433), side unflipped |

Keep-out casualties (`modelDiagnostics.supersededByPit`), no required-model
failure in any variant, `scenery-guards` counts (Monaco guardrail/billboard = 0)
unchanged in all of them:

| circuit/side | FULL 14 m + bays | first pass 9.4 m {.6/1.8/3.0/.6/3.4} | STREET 10.6 m (§3) + bays |
|---|---|---|---|
| baku +1 | fence 35, guardrail 15, building 21, billboard 2 | wall 11, fence 62, guardrail 56, tyreWall 52 | wall 11, fence 193, guardrail 56, tyreWall 52, building 11, billboard 2 |
| jeddah −1 (bays off) | concreteCanyon 34 | concreteCanyon 81 | concreteCanyon 82, place 12 |
| monaco +1 | 0 walls; hedge 34, palm 7, bush 6 | wall 6, hedge 34, palm 7 | wall 6, hedge 34, palm 7, bush 6, place 27 |
| singapore −1 | fence 24, floodMast 11, palm 12 | fence 101 (first pass said 113) | fence 101, floodMast 10, palm 12, place 30 |
| vegas −1 | fence 30, wall 14 (+1 side) | wall 16, fence 101 (+1 side) | fence 104, wall 19, building 4, place 13 |

Why FULL keeps so much standing: `inPitFootprint` (tracks.js:644-657) leaves
`hw + max(verge, fastIn·v) + 0.3` placeable, i.e. **4.3 m** with the FULL set.
Baku's wall (2.0), fence (2.6), guardrail (3.0) and fence (4.0) all fit under it
and stand between the road and the engine's pit wall. With STREET the band is
2.5 m: only props at gap ≲ 2.2 survive, and those are the calls §4 splits.

Two engine facts found on the way:

- **The engine's own street barrier stands on the lane.** tracks.js:1657-1709
  instances a lap-long 0.4 × 1.1 m panel on BOTH sides at `def.barrierGap`
  (Baku default 0.35, Vegas 1.0, Singapore 1.2, Monaco 2.0, Jeddah 3.4). It is
  guarded, so it is culled only where it reaches past 2.5 m: at Baku it stands
  ON the entry-road lane (13 panels at lat 0.3-0.4 with FULL; the lane's inner
  edge is `hw` there, `pit.js:216`), and at Monaco/Singapore/Vegas it stands in
  the platform band 15-40 cm from the complex's own wall (measured residual:
  Monaco 33 panels at lat 2.0, Singapore 41 at lat 1.0, Vegas ~20 at lat 1.0,
  Baku 57 at lat 0.5). It is not counted in `supersededByPit`.
- **A 190 m window compresses the pitch below the bay.** Jeddah's entry is
  `ENTRY_MIN` (150) and its exit `EXIT_MIN` (40) because the trace's corners sit
  against the line (def comment: "known-wrong corner placement"); `pit.js:157`
  compresses the pitch to 10.0 m while the bay mesh is 10.8 m wide → 0.8 m
  interpenetration per neighbour if bays were placed. `bays: false` there.

Physics (§4 of the task): `scanBarrier` (tracks.js:1232-1256) tests each node's
face point with `onTrack(fx, fz, 0.3)` → `inPitFootprint`, so a wall node the
complex supersedes gets **neither** the `barR` tighten nor a `barSegs` record —
the barrier RECORD is dropped with the geometry, per node. A wall that survives
in the placeable band still tightens `barR` to `hw+gap−1.1`, but
`TrackPit.openBoundary` (pit.js:232-241) runs after `buildProps` and raises the
pit-side bar to `hw + outer·w + 1.5` on every `keep>0` node. Measured on all five
with STREET: `min(barR − (hw+outer·w)) = 1.50`, `Tracks.wallAt` below the lane
centre on 0-2 nodes (the first peel node, where `wallAt` takes the min of the
two bracketing nodes and the lane is centimetres wide). No phantom armco; the
def splits in §4 exist so that a surviving wall is not VISIBLE without a record.

Real layouts (general knowledge; Baku/Vegas sides to be confirmed by
`survey-track`): **Monaco** — 2004 permanent pit building on the harbour side
(track right, `+1`), 60 km/h, ~480 m, the narrowest lane in F1 (~10 m).
**Baku** — lane behind the main straight's wall, garages under a
permanent-look temporary structure, 80 km/h; the real side is the inside
(left), the def's art (kit, halls, broadcast) is on `+1`. **Jeddah** —
permanent pit building/paddock on the inside of the pit straight by the
corniche lagoon, 80 km/h. **Singapore** — permanent Pit Building on the left,
60 km/h. **Vegas** — purpose-built Paddock Building on the left (inside),
80 km/h. All five: concrete wall + debris fence between lane and road, a
10-12 m lane.

## 3. Design

### 3.1 The STREET band set (`pit.js`)

```js
const STREET = { verge: 0.6, platform: 1.6, fast: 3.2, corridor: 1.0, work: 4.2 };  // 10.6 m
```

Wall 0.6 m off the road edge (Albert Park's 2021 precedent: pit wall at the
track edge), a 1.6 m platform (FIM ≥ 1.5), fast ≤ 3.5, corridor ≥ 1 (FIM), a
4.2 m working lane (2 m car + a crew either side); 10.0 m wall-to-garage
(Monaco-real, under the 12 m Grade-1 figure the FULL set keeps).
`fastIn = 2.2`, `outer = 10.6` — every keep-out number in §2 was measured with
exactly this pair (corridor/work split is cosmetic for the keep-out).
Mode `"street"` = these bands, `painted: false`, `hasWall: true`,
`hasBays: bays !== false`; `"narrow"` stays as the explicit painted opt-out.
`limitKph` for `"street"` defaults to 80 (F1 SR B1.7.3(a)); 60 is authored.

```
     racing road (2·hw)        |<------------ STREET complex, 10.6 m ------------>|<- bay 12.8 ->|<3>|
 ...tarmac............edge  |.6| 1.6 pl. |<--- 3.2 FAST --->|1.0|<--- 4.2 WORK --->|  garage door |svc|
                            | W| +0.35 m |     (limiter)    |||| (box, crew, stop) |  jamb·lintel |   |
                            | A| 65 cm   |                  ||||                   |  roof/hosp.  |   |
                            | L| barrier |                  ||||                   |              |   |
 keep-out (inPitFootprint): placeable to hw+2.2+0.3 (wall up) … edge hw+10.9, +15.8 across the row + 16 m tail
 driving boundary (openBoundary): barR = hw + 10.6·w + 1.5     engine street panel: SKIPPED here (E1)
```

### 3.2 Def keys per circuit

| circuit | `def.pit` | notes |
|---|---|---|
| monaco | `{ mode: "street", side: 1, limitKph: 60 }` | 12 bays fit at 11 m (131→252 of 282) |
| baku | `{ mode: "street", side: 1 }` (80) | keep `+1` — the def's whole pit art is there; real side is an open question (§7) |
| jeddah | `{ mode: "street", side: -1, bays: false }` (80) | 190 m window; boxes painted at 10 m pitch, no bays; def kit `pitBuilding` behind the garage line |
| singapore | `{ mode: "street", side: -1, limitKph: 60 }` | already `side: -1` |
| vegas | `{ mode: "street", side: -1 }` (80) | paddock kits (`vegas.js:321-328`), lot bleacher, camera tower are all on −1 |

No `entryM/exitM` override is needed: every window holds the row except
Jeddah's, and widening Jeddah's window would push the entry road into the
(mis-placed) final corner — `bays: false` is the honest fix until the corner
table is surveyed.

## 4. Per-circuit scenery edits (authored fracs; `K(f)` = authored node)

Rule of thumb from §2: gap ≤ 2.2 m **survives** the keep-out (verge/platform
band) → SPLIT or DELETE; gap in 2.3…10.9 (or …26.7 across the row + tail) is
**superseded** → cosmetic, trim for cleanliness; gap ≥ 27.5 across the row is
clear → keep.

**Monaco** (`js/circuits/scenery/monaco.js`; pit side = authored **−1**, window
authored .1526–.2570 descending):
- `:84 wall(0.0, FULL_LAP, -1, 1.2, 0.8, ARMCO, 0.22)` → SPLIT into
  `wall(0.0, 0.1526, -1, …)` + `wall(0.2570, FULL_LAP, -1, …)`. (1.09-1.31 m
  survives the keep-out: 19 slabs measured inside the complex, 6 superseded.) `:85` (+1) unchanged.
- `:894 guardrail(0.15, 0.19, -1, 0.4, ARMCO)` → `guardrail(0.15, 0.1526, -1, 0.4, ARMCO)`
  (32 posts at lat 0.5 measured on the lane/exit road) — effectively delete.
- `:685 cityFront(0.87, 0.95, 1, 9)`, `:704 guardrail(0.88, 0.95, 1, 1.0)` are
  authored +1 = racing −1: NOT the pit side (first pass was wrong here). Keep.
- `:783-794` "PIT WALL & START GRANDSTAND" lands at racing .13–.19 side −1 (not
  the pit straight) — leave; not this change.
- Engine passes: hedge 34 / palm 7 / bush 6 / place 27 superseded — intended.

**Singapore** (`singapore.js`; pit side = authored **+1**, window .4850–.5816):
- `:601-604` fence list: `[0.45, 0.54, 1]` → `[0.45, 0.485, 1]`; `[0.55, 0.66, 1]`
  → `[0.582, 0.66, 1]` (gap 3.0: 101 posts/meshes superseded — trim so the fence
  visibly ends at the complex).
- `:541-558` four `circuitKit.pitBuilding` segments + their `WIN_CYAN` glazing
  boxes → DELETE (the kit is already a no-op under `pitBuilt`, tracks.js:1000;
  the glazing at `anchor(K(seg.frac), -1, 11)` is authored-space and lands at
  racing ~.57, not the pit straight — a pre-existing misplacement).
- `:559 raceControl` kit (racing frac .999, gap 46) clear of the 26.7 m keep-out — keep.
- `:539 floodMastRing(38, {dist: 11})`: 10 masts superseded across the row →
  the pit straight loses its floods (see §7).
- `:517 cityFront(0.955, 0.04, -1, 14)` maps to racing .49–.57 — not the window. Keep.

**Vegas** (`vegas.js`; pit side −1, window .1210–.1923, row .1524–.1738):
- `:159-163` fence list `[0.00, 0.25, -1]` (gap 3.4) → `[0.00, 0.121, -1]` + `[0.192, 0.25, -1]`.
- `:165-169` wall list `[0.02, 0.33, -1]` (gap 2.4, 0.35 thick straddles the
  2.5 m edge) → `[0.02, 0.121, -1]` + `[0.192, 0.33, -1]`.
- `:358 cityFront(0.12, 0.20, -1, 20, …)` → gap 20 → **28** (units 14-30 m wide
  start at the gap; 26.7 + margin) or split around `[0.150, 0.178]`.
- `:246-248` lamp post at authored .188 side −1 gap 12 stands on the exit road's
  keep-out edge — leave (superseded/kept by the guard either way).
- `:314-319` "pit-lane light masts" at side **+1** gap 9 and `:330 broadcastCompound(…, 1, 44)`
  are on the wrong side for a −1 lane — cosmetic, optional follow-up.

**Baku** (`baku.js`; pit side +1, window .9203–.0261, row .9942–.0165 + 16 m tail):
- `:71 wall(0.0, 0.65, 1, 2.0, …)` → `wall(0.0261, 0.65, 1, 2.0, …)`;
  `:72 wall(0.82, 1.0, 1, 2.0, …)` → `wall(0.82, 0.9203, 1, 2.0, …)` (1.8-2.2 m survives: 62 slabs measured).
- `:76 fence(0.0, 0.35, 1, 2.6)` → `(0.0261, 0.35)`; `:77 fence(0.86, 1.0, 1, 2.6)` → `(0.86, 0.9203)`.
- `:79 guardrail(0.63, 0.96, 1, 3.0)` → `(0.63, 0.9203)`; `:80 fence(0.63, 0.95, 1, 4.0)` → `(0.63, 0.9203)`.
- `:179-180` five `building(K(0.95+i·0.012), 1, 5, 16, 9, 14, hall)` → DELETE (the bays replace them).
- `:181 wall(0.94, 0.02, 1, 1.0, 1.0, …)` → DELETE (the def's pit wall; 0.8-1.2 m survives — 57 slabs measured).
- `:60-64 circuitKit.pitBuilding(… gap 30, required)` → DELETE (no-op under `pitBuilt`; a dead required spec otherwise).
- `:186 billboard(K(0.01), 1, 9, …)` → gap 30 (superseded at 9); `:654 tyreWall(0.955, 0.99, 1, 3.0)` → DELETE (52 stacks superseded);
  `:656-659` the +1 apron box at `anchor(K(0.97), 1, 4)` → drop the +1 half.
- `:580 cityFront(0.762, 0.95, 1, 14)` → `(0.762, 0.9203)`; `:135 cityFront(0.0, 0.12, 1, 14)` → `(0.0261, 0.12)`.
- Keep: `:152` Government House (gap 42 at .02 — the keep-out is 10.9 there), `:189 broadcastCompound` gap 55, grandstands on −1.

**Jeddah** (`jeddah.js`; pit side −1, window .9643–.0211, row .9830–.0024, no bays → keep-out 10.9):
- `:87-93` canyon loop: for `side === -1` only, `[0.84, 1.00]` → `[0.84, 0.9643]` and
  `[0.00, 0.16]` → `[0.0211, 0.16]` (gap 3.5: 82 slabs superseded; a wall that
  visibly ends at the pit wall reads right). Side +1 untouched.
- `:218 building(K(0.0), -1, 16, 62, 8, 28, hall)` → replace with
  `circuitKit.pitBuilding({ id: "kit:jeddah:pit-building", frac: 0.993, side: -1, gap: 11.2, size: [18, 11, 120], garages: 12 })`
  (row centre ≈ .9927; 12 doors over 120 m ≈ the 10 m pitch; kit fracs are raw racing, `tracks.js:917`).
- `:216 gantry(0.012, 11)` → move to `0.030` (past sB .0211): its portal leg at
  1.5 m stood ON the exit-road lane (measured, 11.2 m tall box at lat 2.0).
- `:34-37` pit-hospitality kit (frac .035, gap 72) and `:332 guardrail(0.96, 0.99, 1, 2.4)` (+1) unaffected.

## 5. Implementation steps

1. **`js/track/core/pit.js`** (+12 lines): add `STREET`; `resolve()` accepts
   `mode: "street"`; `painted = mode === "narrow"`; `hasWall/hasBays` for both
   built modes; `limitKph` default 80 unless `mode === "narrow"`; export
   `STREET`. Add the bay guard: `hasBays = hasBays && pitch >= PITCH - 1e-6`
   (compute after the pitch clamp at `:157`, so a compressed row paints boxes
   but places no overlapping bays). Default for `def.street` stays `"narrow"`.
2. **`js/track/tracks.js:1676-1709`** (+4, E1): inside the panel loop,
   `if (pitKeep && side === pitSide && pitKeep[k] > 0) continue;` and the same
   test before `markBarrier` at `:1709` (openBoundary re-widens it anyway).
   Zero effect while every street def is still `narrow` (`keep` is all-zero).
3. **`tests/unit/pit-complex.test.mjs`**: keep `STREET = "monaco"`; change
   `:49` `"narrow"`→`"street"`, `:50` `painted` true→false, `:51` `hasWall`
   false→true, `:52` `hasBays` false→true, `:56-58` `kept === 0` → `kept > 0`,
   `:59` `pitLaneAt(...) === null` → non-null. Add: (a) Jeddah builds with
   `hasBays === false` and `row.pitch < TrackPit.PITCH`, and a synthetic def
   with `mode:"street"` and no `bays` key on a 190 m window gets no bays (the
   guard); (b) on each of the five, no `streetBarrier` instance sits on the pit
   side at a `keep > 0` node (`track.graph` meta `{kind, k, side}`, or the
   prims-in-lane count from §2's script = 0 in the verge/platform band).
   `tests/unit/pit-lane.test.mjs` needs no change (its street test uses a
   model-less `fakeTrack`, `:114-120`).
4. **Monaco** (§4) + `def.pit` in `js/circuits/monaco.js`; run §6.
5. **Singapore**, 6. **Vegas**, 7. **Baku**, 8. **Jeddah** — same shape, each
   its own commit with its baselines.
9. **Flip the default**: `pit.js` `street ? "street" : "full"`; keep `"narrow"`
   as an explicit opt-out; `pit-lane.js:707-717` comment ("A STREET circuit's
   model is painted") and `:172-195` header, `docs/SCENERY-API.md:69` ("street
   circuits, which build no ribbon"), `PIT-LANE-REDESIGN §4.2/§6.4`, `docs/DEBUG-HOOKS.md`
   `pit()` row → update. (+20 lines of docs.)
10. `js/race/pit-lane.js`: **no functional change**. `laneUniform/boxUniform`
    (`:700-717`) return null once `painted` is false (the shader stripe goes
    off); `inLaneLat/inBoxLat/laneX` (`:625-662`) already take the ribbon
    branch; the limiter reads `model.limitKph` (`:293`). `js/garage/scene.js:640`
    keeps `TrackPit.BANDS` — the showroom is one generic bay, not a circuit.

Line budget: pit.js +12, tracks.js +5 (ratcheted — pay for it), five scenery
files net −40, test +30, baselines ±10, docs +20.

## 6. Verification (per circuit, in this order)

```sh
node tools/track/verify-track.cjs <id>            # 2 s; hard-fails on a required model; read the "superseded by the pit complex" line
node tools/track/clip-audit.cjs <id>              # vs clip-baseline: baku 30, jeddah 29, monaco 24, singapore 11, vegas 11
node tools/track/coplanar-audit.cjs <id>          # vs coplanar-baseline: vegas 72, jeddah 62, baku 13, singapore 9, monaco 5
node tools/track/float-audit.cjs <id>             # float-baseline lists none of the five — must stay 0
node --test tests/unit/pit-complex.test.mjs tests/unit/scenery-guards.test.mjs
npm run test:tooling-fast                         # the edit-loop gate
node tools/shot/pit-shots.mjs <id> --teams none   # visual sign-off, one boot (~1 min at half scale); background it, log in artifacts/
```

Ratchet a lower clip/coplanar count DOWN in the same commit (precedent:
`tests/unit/prop-clipping.test.mjs:101`); an increase needs the spot named and a
rendered look (expected sources: a gantry leg at 1.5 m through the 0.6 m pit
wall — the same clash the FULL set has at 2.0 m — and jambs against a surviving
kerb). Monaco alone has a browser foundation spec:
`npm test -- tests/specs/monaco-foundation.spec.js`. `pit-lane.spec.js` runs on
Monza and is unaffected; do not add a street case there (SwiftShader minutes) —
`pit-shots` is the evidence. Before push: `npm run test:guards` (commit hook),
`npm run test:sweeps` once for all five, `pick-tests` for the groups; name
`physics-core` (pit-lane.spec) as not-run in the PR.

## 7. Risks

- **Terrain reach.** `surface.js:46` adds pit rails at 10.9 / 18.9 / 26.7 /
  34.7 m; `terrainOuter` is 28 (Monaco, Jeddah, Baku default), 26 (Vegas), 48
  (Singapore). The back of the bays (26.4 m) sits at the ribbon's edge on four
  circuits; the universal floor slab is under it, but check `float-audit` and
  the aerial in `pit-shots` for a visible terrain step behind the garages.
  Raising `terrainOuter` to 36 on those defs is the cheap cure.
- **Monaco's road is 10 m.** Complex + bays add 26.4 m on the harbour side over
  282 m; the quay/water at `:565-568` is authored at .585–.99 (not the window),
  but the harbour `waterField` stations (`:897`, racing .365/.545/.59) are far
  away. Look at the `map` render anyway.
- **Gantry legs vs the 0.6 m wall** (Jeddah 0.0, Baku 0.0/0.96, Singapore 0.0,
  Vegas .005 → racing .848, Monaco 0.0): the engine `gantry` anchors legs at
  1.5 m (`structures.js:236`) on both sides regardless of the complex. Same
  clash as permanent circuits at 2.0 m; if the coplanar sweep names it, the
  fix is engine-side (offset the pit-side leg to `fastIn + 0.4` when the
  complex owns the node), not per def.
- **Singapore loses its pit-straight floods** (10 of the ring superseded) and
  the row is dark at night; `SceneryPits` has no lamps. Acceptable for the
  first cut; a lamp row on the garage roof is a follow-up.
- **The verge is placeable on the entry road** (`inPitFootprint` uses
  `max(verge, fastIn·v)`, so with `v = 0` a prop at gap < 0.9 stands on lane
  tarmac whose inner edge is `hw`). E1 removes the engine panel; the def splits
  remove the rest here. The fleet-wide fix (`a0 = hw + fastIn·v + 0.3`) changes
  keep-out on every permanent circuit's entry road — measure `supersededByPit`
  on `verify-track --all` before taking it (separate change).
- **`tracks.js` ratchet** — +5 lines; `node tools/check/ratchets.mjs` will say.
- Coplanar baseline for Vegas (72) and Jeddah (62) may move either way: the
  canyon/fence splits remove spots, the new bays/jambs add the same kind the
  permanent circuits already ratchet.

## 8. Open questions

1. **Baku's side.** The real lane is on the inside (left) of the main straight;
   every piece of the def's pit art is on +1. Keeping +1 now (this plan) costs
   nothing; moving to −1 needs the grandstands at `:182-183` and the −1 Caspian
   exclusion (`baku.js` def `dressingExclusions`) re-authored — a `survey-track` job.
2. **Jeddah's window.** `bays: false` is a workaround for a 190 m window that
   exists because the trace's last/first corners sit on the line. Once the
   corner table is surveyed, `window()` should give ~400 m and the bays return
   by deleting one key. Alternatively add `def.pit.entryM/exitM` overrides to
   `pit.js window()` (6 lines) — not recommended while the corner placement is wrong.
3. **Keep `"narrow"`?** After step 9 no def uses it; it stays as the fallback a
   circuit can declare if its lane regresses, and as the path model-less VM
   tracks take. Deleting it (and the painted-lane shader branch, `glsl-lit.js:158-165`)
   is a separate cleanup with `pit-lane.test.mjs:491-517` to retire.
4. **Speed limits.** 60 at Monaco/Singapore, 80 elsewhere — `limitKph` default
   80 for `"street"` flips the current 60 for Baku/Jeddah/Vegas; confirm that is wanted.
5. **Singapore's kit glazing** (`:554-557`) and Vegas's +1 "pit-lane light
   masts" (`:314-319`) are pre-existing misplacements found while mapping; fix
   with the def edits or file separately.
