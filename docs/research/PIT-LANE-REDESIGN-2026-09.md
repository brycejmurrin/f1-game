# Pit lane redesign — research and design (2026-09-15)

> Research + design. **Implemented 2026-09-15** as `js/track/core/pit.js`
> (`TrackPit`, the model) and `js/track/scenery/pits.js` (`SceneryPits`, the
> furniture), with the decisions in §6 taken as recommended: the bay's pitch
> (11.0 m with the 0.2 m party gap), a 5.5 m working lane, `narrow` mode on
> street circuits, no equipment in the trackside bays, side +1 until a circuit
> authors `def.pit.side`. `tests/unit/pit-complex.test.mjs` is the gate. §1–§3
> are the evidence, §4 the design as built, §5 the route it took. Screenshots
> that motivated it: `scratch/captures/pit-lane/albert_park/` (regenerable with
> `node tools/shot/pit-shots.mjs albert_park`).

## 0. The verdict in one paragraph

Apex 26 describes the pit lane **five separate times** — the ribbon fit in the
track engine, the stop positions in the race module, the painted boxes in the
mesh builder, the garages in each circuit's scenery, and the frontage the
GARAGE screen draws through its own open door — and nothing makes any two of
them agree. The car does not stop at its painted box, the painted row is a
hardcoded ten-team table that predates Cadillac, the garages stand 16 m from a
3.2 m strip with trees between them, and the one good pit-bay model in the tree
(`js/garage/scene.js`) is used only on a menu screen. The fix is not a wider
ribbon. It is **one pit-complex model**, built once per track from real
dimensions, that the lane mesh, the markings, the stop logic, the AI, the
garages *and* the GARAGE screen all read.

## 1. Evidence — what ships today

### 1.1 The five descriptions

| # | What | Owner | What it says |
|---|---|---|---|
| 1 | the lane tarmac | `Tracks.pitLaneFit` — `js/track/tracks.js:234` | a strip `PIT_LANE_W = 3.2 m` (min 2.4) offset laterally from the racing centreline by `hw + gap`, built only where `barR − hw` leaves ≥ 2.7 m, tapered over 40 m at each end |
| 2 | where a car stops | `PitLane.boxThroughFor` — `js/race/pit-lane.js:354` | **11** boxes from `Teams.LIST` at **14 m** pitch, anchored just past pole's grid slot, clamped into the ribbon |
| 3 | the painted boxes | `TrackMesh.buildPitBoxes` — `js/track/core/mesh.js:1062` | **10** boxes at **9 m** pitch, 2.8 × 8 m, block centred in `lane.lenM − 80` |
| 4 | the garages | each circuit's `scenery()`; `CircuitKit.pitBuilding` — `js/track/scenery/circuit-kit.js:199`; Albert Park's own hull — `js/circuits/scenery/albert_park.js:389` | kit: a hull `[18, 10, 72]` m with 12–24 doors at `L / garages`; Albert Park: **26** bays at **6.6 m** pitch, hand-anchored **16 m** off the centreline at the start node, 190 m long |
| 5 | the frontage on the GARAGE screen | `GarageScene.buildPitLane` — `js/garage/scene.js:637` | door → working lane **2.5 m** (box 3.8 × 2.05 m in it) → line → fast lane **2.75 m** → line → bollards → wall; 5.45 m in all |

### 1.2 The defects that fall out, each verified in source

1. **Three pitches for one row** — 14 m (stop) / 9 m (paint) / 6.6 m (doors) —
   and three different anchors. The car stops somewhere that is not its
   painted box, and the doors line up with neither.
2. **`Teams.ORDER` does not exist.** `js/data/teams.js` exports
   `{ LIST, POINTS, TIER_V, DEFAULT_CUSTOM }`, so `pitTeamList()`
   (`mesh.js:1048`) *always* returns its hardcoded fallback `PIT_TEAMS`: ten
   teams, no Cadillac, colours copied. `circuit-kit.js:191` (`PIT_TEAM_COL`)
   and `albert_park.js:400` (`AP_TEAMS`) carry the same ten-row table twice
   more. **Four** colour tables for one grid.
3. **The lane has no geometry of its own.** It is `hw + gap` at every node,
   so it is parallel by construction: it cannot peel off the circuit at an
   angle, cannot run behind a wall, cannot be longer than the curvature-derived
   window, and vanishes wherever the barrier is tight (Monaco, Baku, Vegas,
   Singapore keep the painted fallback in `glsl-lit.js:600`).
4. **3.2 m is one car wide.** A real pit lane is a fast lane *and* a working
   lane (§2). There is no room for a crew, which is why every garage had to be
   pushed outboard — and why `buildPitGarages()` (`mesh.js:1116`) is an empty
   function: the garages collided with the scenery-kit hulls and the collision
   was resolved by deleting the geometry.
5. **The good garage is on the wrong screen.** `js/garage/scene.js` builds a
   10.8 × 12.8 × 5 m pit bay — roller-door aperture, truss, LED fixtures, team
   dado, pit equipment, a painted box on the apron — as plain
   `{pos,nrm,col,mat,idx}` data (`scene.js:1294`), and the files are already in
   `TRACK_VM` (`tools/manifest.cjs:154`). Trackside, the player gets a kit box
   with coloured lintels instead.
6. **`PIT_SIDE = 1`** (`tracks.js:215`) puts the lane on the right of the
   centreline on all 52 circuits regardless of where the real pits are;
   `pitCorridor` (`albert_park.js:28`) is the only authored pit datum in any def.

The aerial in `03-lane-aerial.png` shows all of it at once: a blue stripe and
a thin strip glued to the road, the garage hull marooned across grass and a row
of trees, and no pit wall anywhere.

## 2. What a real pit lane is

Primary = the regulation text itself (extracted from the PDFs with `pypdf`;
plain-text copies in `artifacts/tmp/pitres/`). Secondary = press/reference
sites; treat those figures as ranges.

### 2.1 Load-bearing numbers

| Item | Figure | Source |
|---|---|---|
| Pit lane overall width, Grade 1 | **≥ 12 m**, "adjacent to the starting straight, separated by a pit wall and signalling platform" | FIA Appendix O 2026 §7.9 (primary) |
| Pit entry / exit | "should leave and join the track at points avoiding interference with the racing line" | Appendix O 2026 §7.9 (primary) |
| The three roads | **Pit Entry Road, Pit Lane, Pit Exit Road** are three named things | F1 Sporting Regs 2026 B1.7 (primary) |
| Fast lane width | **≤ 3.5 m** ("may be no more than 3.5 metres wide"); the lane nearest the pit wall | F1 Sporting Regs 2022–2025 (secondary quote; the 2026 issue 04 text no longer carries the width sentence in B1.7) |
| Fast lane, motorcycle grade | **3.5–5 m** | FIM Standards for Circuits 2022 §9.1 (primary) |
| Inner (working) lane | "as wide as possible"; the **only** place work may be done on a car | F1 SR 2026 B1.7.1(e); FIM §9.1 (primary) |
| Corridor between lanes | **≥ 1 m**, delimited by white lines; both lanes white-lined both sides | FIM §9.1 (primary). FIM §4.11.10.3: two 10 cm lines 40 cm apart |
| Entry line | continuous **10 cm** white line across the lane at the first speed loop; limit boards both sides | FIM §4.11.10.1 / §9.4 (primary) |
| Exit line | continuous 10 cm white line across the lane at the exit lights; crossed-out boards | FIM §4.11.10.2 / §9.5 (primary) |
| Where the limit applies | "between the entry line and exit line" | formula1.com explainer (secondary) |
| Speed limit | **80 km/h** for the whole Competition, Race Director may amend; **60** at Monaco (and Melbourne before its 2021 widening) | F1 SR 2026 B1.7.3(a) (primary); formula1.com, GPFans (secondary) |
| Pit exit control | green/red light at the end of the lane; flashing blue in the Pit Exit Road when cars approach on track | F1 SR 2026 B1.7.3(e) (primary) |
| Entry-line rule | the dashed white line at the pit entry defines the track edge; nobody continuing on track may cross it; a whole tyre must not go beyond the entry/exit lines | FIA event notes via motorsport.com, Baku 2024 (secondary) |
| Signalling platform | verge **2 m** trackside, platform **≥ 1.5 m**, **+35 cm** above the lane, concrete wall **25 cm** thick, **1 m** above the platform; **65 cm** barrier between platform and lane; platform extends **25 m** beyond the boxes at each end | FIM §9.2 (primary) |
| Starter's rostrum | **20–50 m** after the start line, ≥ 2 m above the platform | FIM §9.6 (primary) |
| Garage allocation | one "designated garage area" per competitor, with **one** pit stop position; no painting lines in the lane | F1 SR 2026 B1.7.1 (primary) |
| Garage frontage | units **4–7 m** wide, a team takes **2–3** units; doors 3–4 m+; Silverstone garages **16.5 × 8 m** | f1technical forum, Silverstone/WikiArquitectura (secondary) |
| The FIA's own model | the circuit drawing carries the pit lane's **own** left/right edge polylines and centreline, plus `PIT_ENTRY_SPEED_LIMIT_LANE`, `PIT_EXIT_SPEED_LIMIT_LANE` and `PIT_WALL` layers | FIA Circuit Drawing Format 2024 §Pit lane (primary) |
| Sims | Assetto Corsa: the pit lane is its own recorded spline (`pit_lane.ai`), boxes are placed objects (`AC_PIT_n`), the surface is tagged `PITS` | assettocorsamods.net (secondary) |

### 2.2 Worked examples (the circuits we ship)

| Circuit | Lane length | Limit | Pit loss | Notes | Source |
|---|---|---|---|---|---|
| Silverstone | **970 m** | 80 | ~28 s in-to-out; 20.9 s median loss | entry before Vale, exit outside Farm | oversteer48, f1chronicle (secondary) |
| Monaco | **480 m** | 60 | ~19 s; 22.0 s median | starts before T19, ends before T1, blend into T2; a left kink after the entry line | oversteer48, formula1.com (secondary) |
| Bahrain | ~**441 m** in-to-out | 80 | — | "long lane pushes teams to fewer stops" | sportskeeda (secondary, page not fetchable) |
| Albert Park | ~**281 m** | 60 → 80 after the 2021 widening | 12–17 s transit | entry at T14 (final corner), exit into T1; lane widened **2 m** in 2021 by removing the verge so the pit wall sits at the track edge; pit building being rebuilt (2025–) | f1technical, si.com, GPFans, Development Victoria (secondary) |
| Monza | not found | 80 | ~25 s (Pirelli) | track 10–12 m wide, start straight 1194 m | monzanet.it (secondary) |
| Measured median loss, 2022–26 | — | — | **19.7–23.8 s** across 2,106 green-flag stops | "lane lengths, speed limits and geometry, not car performance" | f1chronicle (secondary) |

### 2.3 What I could not find

- The 2026 F1 Sporting Regulations no longer state the 3.5 m fast-lane width
  in B1.7 (checked by grep of the extracted text); the 2022–2025 wording is the
  source for that figure.
- No primary figure for garage frontage per team; the 4–7 m unit / 2–3 units
  range is a forum consensus.
- Monza's pit lane length; Albert Park's real pit SIDE (assumed inside of the
  start straight, to be surveyed in Phase 5).

## 3. The engine constraints the design must respect

- **One ribbon, one arc coordinate.** Every reader — physics, timing, walls,
  HUD, AI — lives in `(s, x)` on the main spline (`docs/PHYSICS.md`). The
  shader comment at `glsl-lit.js:600` records two earlier attempts to branch
  the road that failed (Monaco's buildings; 2.4 m at Monza). A second spline
  with its own `s` would need a remap through every consumer.
- **`hw` is symmetric.** `tracks.js:137` records why a one-sided widening is
  "a different change": one half-width per node feeds mesh, kerbs, banking,
  sampling and projection.
- **The ribbon mechanism already exists and works** — `pitLaneFit` +
  `buildPitLane` build a second tarmac ribbon from a per-node lateral profile,
  `pitLaneAt`/`inPitLane` read the same profile, and the physics exemption
  (`game.js:4241`) and the AI lane steer (`game.js:4538`) read those. What is
  wrong is what the profile is (`hw + gap`, 3.2 m, measured room) — not that a
  profile drives everything.
- **The scenery must yield, not the lane.** Today the lane exists where the
  barrier happens to leave room. `pitCorridor` (`tracks.js:302`) is the seed of
  the right idea: the pit complex *declares* the corridor it needs and the
  driving boundary and prop placement read it.
- **Budgets.** Prop clipping (`tools/track/clip-baseline.json`), coplanar and
  grounding sweeps, and `tests/data/ratchets.json`. One bay is ~16.4 k verts /
  12 k tris in 16 meshes (measured with the `garage-mesh.test.mjs` harness);
  eleven fused copies is 180 k verts in the prop mesh — instance it.

## 4. The design

### 4.1 One model: `track.pit` (`PitComplex`)

Built once in `Tracks.build`, after the centreline and before scenery. Every
consumer in §1.1 reads it and none derives its own numbers.

```
track.pit = {
  side,                       // -1 | +1, AUTHORED per circuit (def.pit.side), default +1
  limitKph,                   // 80, or def.pit.limitKph (60 on street circuits)
  entry: { s0, s1 },          // Pit Entry Road: peel-off begins at s0, entry line at s1
  lane:  { sIn, sOut, lenM }, // between the entry line and the exit line (the limiter)
  exit:  { s0, s1 },          // Pit Exit Road: exit line at s0, blend line at s1
  bands: {                    // lateral, metres, from the racing-surface EDGE outward
    verge: 2.0,               //   FIM 9.2
    platform: 2.0,            //   1.5 m platform + 0.25 m wall + rounding
    fast: 3.5,                //   F1 SR ≤ 3.5
    corridor: 1.0,            //   FIM 9.1
    work: 5.5,                //   the box lane: a 2 m car + crew both sides
  },                          //   = 14 m to the garage line; 12 m of "pit lane" wall-to-garage
  x: Float32Array(n),         // the fast-lane CENTRE's lateral offset per node (0 outside)
  row: { s0, pitch: 10.8, boxLen: 8, boxes: [{ team, s, x }] },   // 11 from Teams.LIST
  garage: { depth: 12.8, height: 5.0, frontS0, frontS1 },        // GaragePrims constants
}
```

- `bands` are the §2.1 figures. The **pitch is the bay's frontage**
  (`GaragePrims.HALF_W × 2 = 10.8 m`) — inside the 10–15 m a real team takes,
  and it makes the setup-screen bay and the trackside bay the same object.
  Eleven teams × 10.8 = 118.8 m of frontage; race control and hospitality sit
  beyond the ends.
- `row.boxes[i].s` is the **one** number the stop logic, the box paint and the
  door position all read. That is the assertion Phase 0 adds: paint ≡ stop ≡
  door, for every team, on every circuit.
- `x[k]` is the lateral profile that replaces `hw + gap`: 0 outside the
  complex, a smoothstep over the Pit Entry Road from the track edge out to the
  fast-lane centre (`verge + platform + fast/2` beyond the edge), constant
  through the lane, and back over the Pit Exit Road. The peel angle is
  `atan(dx/ds)`; with a 70 m entry road and ~7.75 m of offset it is ~6°, which
  is what a real entry looks like.
- The arc positions come from what the engine already knows: `pitWindow`'s
  curvature scan for the entry, `Tracks.findCorners` to keep the entry road
  and the blend clear of a corner (Appendix O §7.9), `def.pit` to override.

### 4.2 Geometry — the ribbon, made real

Keep the ribbon (§3), change the profile:

- `TrackMesh.buildPitLane` takes its rails from `track.pit.x[k]` and
  `bands`, not `hw[k] + gap`: verge (grass), platform (concrete, +0.35 m),
  wall (0.25 × 1.0 m on the platform, the 0.65 m lane-side barrier), fast lane
  tarmac, corridor with its two 10 cm lines, working lane tarmac, apron, then
  the garage line. The road's own edge line stays where it is; the dashed
  entry line along the peel-off replaces the blue stripe.
- Entry and exit roads are the same ribbon with `x` easing — no branch, no
  second `s`. The physics exemption, `throughM`, `laneX`, `inPitLane` all keep
  working because they read the same profile the mesh was built from.
- Where a circuit cannot hold 14 m (street), `def.pit.mode = "narrow"` scales
  `work` down and drops `platform`, but the bands, the row and the lines are
  the same model at smaller numbers — Monaco's 480 m, 60 km/h lane is the
  worked example, not a different code path.

### 4.3 Room — the corridor is declared, the scenery yields

`applyPitCorridor` becomes automatic: the driving boundary (`barL/barR`) across
`[entry.s0, exit.s1]` is pushed out to the complex's outer edge (garage line +
`garage.depth` + a service margin), tapered like `x`. Prop placement already
reads the boundary, so the trees and hulls that stood on the lane move out
by construction. `pitCorridor` in a def becomes an *extra* setback, not the
only one.

### 4.4 Garages — the bay we already have

- **Exterior:** `CircuitKit.pitBuilding` keeps the hull (glazed hospitality
  floor, canopy, roof) but takes `size`, `frac` and `garages` **from
  `track.pit`** — length = `row.pitch × 11` (+ ends), depth = `garage.depth`,
  doors at `row.boxes[i].s`, colours from `Teams.LIST[i]`. A circuit's
  scenery may pass a *style*; it no longer guesses a position.
- **Interior:** one bay = the static half of `GarageScene` — shell, floor,
  door aperture, truss, LED fixtures (~3.7 k verts) — exported as a builder
  (`GarageScene.buildStatic(out, liv, ctx)` is a small extraction; the parts
  are already separate functions at `scene.js:38/400/622/735`) and placed
  eleven times through `TrackGraph.instance` with `NODE_COLOR` for the team
  tint, so it is **one** model, drawn instanced on GLX/WGX/TLX
  (`docs/ARCHITECTURE.md` §Parity, `updateInstances`). Equipment (11 k verts)
  is a quality-tier option, not the default.
- The shell is wound to be seen from inside (`scene.js:29`); the hull provides
  the outside. Standing in the lane you look through a door aperture into a
  lit bay — which is exactly the setup-screen view, at the right place.
- **Delete** `PIT_TEAMS` (`mesh.js`), `PIT_TEAM_COL` (`circuit-kit.js`),
  `AP_TEAMS` and the hand-built hull in `albert_park.js` (its 26-bay 1995 hall
  becomes a *style* of the kit: bay count and facade rhythm, not position).

### 4.5 Markings and furniture (from §2.1, all off the model)

Entry line and exit line (continuous 10 cm white across the lane at `sIn`/
`sOut`) with limit boards; the dashed track-edge line along the entry road;
the two-line corridor; box outlines 8 m long, centred on each door, team
keyline; the pit wall with openings every 25 m; exit lights (red/green, blue
flashing when a car is within `OT_GAP` on track — already computable from
`ranked`); the starter's rostrum 20–50 m after the line; the platform extends
25 m past the row at each end.

### 4.6 The GARAGE screen reads the same model

`GarageScene.buildPitLane` builds its frontage from `bands` (work lane, corridor,
fast lane, wall) instead of `PIT_Z0/8.95/11.70`, and its box from `row.boxLen`.
Then the bay you tune in is the bay you pit in, and there is no fifth
description.

### 4.7 Physics, AI, HUD — mostly unchanged

- `Tracks.pitLaneAt/inPitLane` read `track.pit` (same shape as today's return).
- `PitLane.zoneOf` reads `track.pit.lane` and drops its own `EXIT_M/BOX_M/
  PIT_SIDE/LANE_W` constants; `boxThroughFor` reads `row.boxes[teamRow]`.
- AI: `pits.laneX` returns the fast-lane centre through the lane and the
  working-lane centre for the last 30 m before its box (today it has one lane).
- The state machine (armed → lane → box → out), the commitment gesture, the
  cue, tyre service, strategy: untouched. `tests/unit/pit-lane.test.mjs`
  stays green except the "no lane WIDTH in the zone" tests, which move to
  reading the model.
- The limiter applies between the entry line and the exit line (it does
  today: `inWindow`).

### 4.8 What this kills, by defect number

1 → one pitch, one anchor. 2 → one colour source. 3 → `x[k]` has an angle
and a wall. 4 → 14 m of complex. 5 → the bay is trackside. 6 → `def.pit.side`.

## 5. Phases (each ships alone, each has a gate)

| Phase | Change | Gate |
|---|---|---|
| **0 — stop the drift** (small, now) | `pitTeamList` → `Teams.LIST` (11 boxes, real colours); `buildPitBoxes` paints at `PitLane.boxThroughFor`'s positions (export a pure `boxRow(track)` from `js/race/pit-lane.js` that both read); delete `PIT_TEAMS`; add `tests/unit/pit-row.test.mjs`: paint ≡ stop for every team on every circuit | `test:tooling-fast`, `verify-track --all`, `test:sweeps` (clip baseline should not move), `pit-lane.spec.js` |
| **1 — the model** | `Tracks.build` computes `track.pit`; `pitLaneAt/inPitLane/pitLaneSpan`, `PitLane.zoneOf/boxThroughFor`, `buildPitBoxes`, the shader uniform all read it. **No visual change** — `x[k]` is set to today's `hw + gap + w/2` for this phase so `graph-parity` and the ribbon tests prove nothing moved | `pit-ribbon.test.mjs` rewritten against the model; `node tools/track/graph-parity.cjs --all`; `test:sweeps` |
| **2 — the lane** | bands, the entry/exit easing, the wall + platform, the corridor setback (§4.2–4.3, 4.5) | `verify-track --all`; sweeps re-baselined with the reason (garages move *closer*); `pit-lane.spec.js`; `circuits` foundation specs for the touched circuits; `pit-shots.mjs` on albert_park, bahrain, monaco |
| **3 — the garages** | `GarageScene.buildStatic`; `CircuitKit.pitBuilding` from the model; instanced bays; delete the three colour tables and Albert Park's hull | `garage-mesh/-interior-gate/-sign-occlusion` tests; `graph-parity`; `gfx` group on `macos-latest` (`gpu-census.yml`) for the instanced draw on all three backends |
| **4 — the screen** | `GarageScene.buildPitLane` from `bands` | garage tests; `garage-angles.mjs --views=rear` before/after |
| **5 — per-circuit data** | `def.pit = { side, entryFrac?, exitFrac?, limitKph?, mode? }` for the 24 season circuits, surveyed (`survey-track`); street circuits to `narrow` | one circuit at a time: `verify-track <id>` + its foundation spec |

Phase 0 is the cheap, certain win and can go out today. Phases 1–2 are the
redesign proper. Phase 3 is where the screenshots change the most.

## 6. Open decisions

1. **Pitch 10.8 m (the bay) vs 14 m (today's stop logic).** 10.8 makes the
   setup bay and the trackside bay one model and fits 11 teams in 119 m; 14 is
   the upper end of real frontage and spreads the row to 154 m. Recommendation:
   10.8, because the shared model is worth more than 3 m of frontage.
2. **Working-lane width 5.5 m.** Regulation says "as wide as possible" and
   ≥ 12 m overall; 5.5 gives 12 m wall-to-garage. Could be 6–7 m on permanent
   circuits with room.
3. **Do the instanced bays carry equipment by default?** 11 k verts once
   (instanced) is cheap on desktop, not free on the mobile tier. Recommendation:
   `PerfGov` tier ≥ medium only.
4. **Street circuits:** `narrow` mode (Monaco-like, 60 km/h, no platform) vs
   keeping the painted fallback. Recommendation: `narrow` — one code path.
5. **Which side, per circuit.** Needs a survey pass; the default stays +1 until
   Phase 5 authors it.

## 7. Sources

Primary (text extracted from the PDFs):
- FIA, *2026 Formula 1 Regulations — Section B: Sporting*, issue 04, 2025-12-10, B1.7 —
  https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_04_-_2025-12-10_0.pdf
- FIA, *Appendix O to the International Sporting Code 2026*, §7.9 —
  https://www.fia.com/system/files/documents/appendix_o_2026_published_23122025.pdf
- FIA, *Circuit Drawing Format 2024*, §Pit lane —
  https://api.fia.com/sites/default/files/list_of_requirements_for_the_circuit_drawing_2024.pdf
- FIM, *Standards for Circuits 2022*, §4.11.10, §9 —
  https://www.fim-moto.com/fileadmin/user_upload/Documents/2022/Circuits_Standards_2022_updated_05May2022.pdf

Secondary:
- motorsport.com, FIA track grades and requirements (12 m pit lane, 15 m grid, 8 m slots) — https://www.motorsport.com/f1/news/fia-track-grades-requirements-f1-potential/6508330/
- sportrules.org, F1 pit lane rules (the 3.5 m fast-lane quote) — https://www.sportrules.org/formula-1/pit-lane-pit-stops-and-unsafe-release-rules/
- formula1.com, why there are pit lane speed limits and how they are measured — https://www.formula1.com/en/latest/article/explained-why-are-there-pit-lane-speed-limits-in-f1-and-how-are-they-measured.jc4jiWVsfbRhb62QomSf0
- motorsport.com, FIA clarifies pit entry line limits (Baku) — https://www.motorsport.com/f1/news/fia-clarifies-pit-entry-line-limits-for-f1-azerbaijan-gp/10319874/
- f1chronicle.com, measured pit loss across 2,106 stops — https://f1chronicle.com/f1-pit-stop-time-loss-data/
- oversteer48.com, Silverstone pit lane (970 m) — https://oversteer48.com/silverstone-pit-lane-paddock-club/ ; Monaco (480 m) — https://oversteer48.com/monaco-track-layout-drs-zones-corner-names/
- GPFans, Albert Park pit lane widened 2 m — https://www.gpfans.com/en/f1-news/61549/melbourne-s-albert-park-gets-new-pit-lane-possible-resurfacing-before-november-race/
- f1-fansite.com, pit lane / pits glossary — https://www.f1-fansite.com/glossary/pit-lane/ , https://www.f1-fansite.com/glossary/pits/
- motorsports-regulations.com, pit road (work area / fast lane / sign area) — https://motorsports-regulations.com/en/pitroad
- Wikipedia, *Pit stop* — https://en.wikipedia.org/wiki/Pit_stop ; *Albert Park Circuit* — https://en.wikipedia.org/wiki/Albert_Park_Circuit
- assettocorsamods.net, pit boxes and `pit_lane.ai` — https://assettocorsamods.net/threads/adding-pitboxes-to-existing-track.2403/
- f1technical.net, garage/pits layouts (forum; 403 on fetch, figures via search excerpt) — https://www.f1technical.net/forum/viewtopic.php?t=8644
