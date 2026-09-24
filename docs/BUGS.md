# Apex 26 — verified bugs (2026-09-24 hunt)

Findings from a read-of-code + targeted-test architecture pass on tip of
`claude/f1-game-project-26h3ng`. Only defects defended from current source are
listed. Speculative rewrites are out of scope. Historical fixed defects live in
[notes/DEFECT-LEDGER.md](notes/DEFECT-LEDGER.md).

Contributor map: [ARCHITECTURE-MAP.md](ARCHITECTURE-MAP.md). Module contract:
[ARCHITECTURE.md](ARCHITECTURE.md). Scenery pipeline:
[SCENERY-AND-TRACK-BUILD.md](SCENERY-AND-TRACK-BUILD.md).

**Severity key:** critical = data loss / unplayable for many; high = common path
broken; medium = wrong outcome on a reachable path; low = cosmetic or rare.

---

## Fixed in this PR

### B1 — Wheel-wizard axis capture survived settings close / resume
**Severity:** high · **Status:** FIXED here

**Where:** `js/ui/key-binds.js` (`disarmAll`), `js/game.js` (`setPaused`)

**What:** `SET UP A WHEEL` calls `Input.beginAxisCapture`. While armed,
`pollGamepad` zeroes throttle/brake/steer every frame. Resume paths hid
`#pmsettings` without calling `closeSettings()`, so an armed pad-capture slot
could survive.

**Fix:** `disarmAll` aborts the wizard (`beginAxisCapture(null)`). `setPaused(false)`
calls `closeSettings()` so every resume path disarms.

**Test:** `tests/unit/key-binds.test.mjs` — disarm clears axis capture.

### B2 — Time trial still ran the +5 s track-limits ladder
**Severity:** low · **Status:** FIXED here

**Where:** `js/game.js`

**What:** TT invalidates the lap on the first counted cut, but the fourth cut
still did `penalty += 5` and announced `+5s TRACK LIMITS PENALTY`.

**Fix:** Gate the ladder on `!isTimeTrial()`.

**Test:** `tests/unit/tt-lap-validity-vm.test.mjs` — fourth cut leaves `penalty` at 0.

### B3 — Lobby READY is not host-relayed (3–4 player guest UI lies)
**Severity:** medium · **Status:** FIXED here · **Confidence:** high

**Where:** `js/net/lobby.js` READY handler

**What:** HELLO was relayed with `from`; READY keyed only by connection `id`. On
a guest that is always the host peer, other guests' READY never arrived.

**Fix:** Host relays `{ ready, from }`; guests key `_ready` by `from || id`
(same pattern as HELLO).

**Test:** `tests/unit/net-lobby-lifecycle.test.mjs` — READY relay + `from` keying.

### B4 — Championship points / FL / countback for cars that never finished
**Severity:** medium · **Status:** FIXED here · **Confidence:** high

**Where:** `js/career/season-cal.js` `award()`; `js/game.js` `endRace` FL from
`fin` only

**What:** `award()` zeroed only `c.retired`. Still-running cars on a time-cap /
early end took table points, finishes histogram entries, and could take FL.

**Fix:** Require `c.finished && !c.retired` for points, finishes countback, and
FL. `endRace` picks FL among classified finishers only.

**Test:** `tests/unit/season-cal.test.mjs` — unfinished take no points/finishes/FL.

### B5 — Cross-tab + quota can overwrite a newer mirror-only save
**Severity:** high · **Status:** FIXED here · **Confidence:** medium-high

**Where:** `js/core/store.js` IDB flush

**What:** Tab A's quota-refused (`lsOk:false`) row is the only durable copy of
V2. Tab B, never seeing `storage`, could flush `lsOk:true` with older V1 and
replace it.

**Fix:** Refuse `lsOk:false` → `lsOk:true` when the payloads differ. Same-value
upgrade (boot healed disk) still lands.

**Test:** `tests/unit/store-cross-tab.test.mjs` — older `lsOk:true` refused.

### B6 — Launch / tyre / phase / mistake hashes ignored career season seed
**Severity:** medium · **Status:** FIXED here · **Confidence:** high

**Where:** `js/game.js` grid arm; `js/race/weather-arc.js`; mistake path

**What:** Reliability used `Career.seasonSeed()` + round; launch/tyreClass/
phaseRoll/mistake hashes used bare `simSeed()` / `raceIndex`.

**Fix:** Career path uses `Career.seasonSeed()` and championship `drawRound`
(same contract as `armReliability`).

### B7 — Settings export lacked oneOf for steer / HUD / driving line
**Severity:** low · **Status:** FIXED here · **Confidence:** high

**Where:** `js/ui/settings-export.js`; `js/game.js` `setSteerMode`

**What:** Unknown strings could be stored; `setSteerMode` now falls back to
`buttons` when the mode is not in `["tilt","buttons","touch"]`.

**Fix:** `oneOf` on `steerMode`, `hudProfile`, `drivingLine`; validate in
`setSteerMode`.

**Test:** `tests/unit/settings-export.test.mjs` — oneOf allowlists.

### B8 — Garage `customLogo` import accepts any string
**Severity:** medium · **Status:** FIXED here · **Confidence:** high

**Where:** `js/ui/settings-export.js` `garageValue`

**What:** Only type `string` was required; schemes like `javascript:` could land.

**Fix:** Require `^data:image/(png|jpeg|webp);base64,` and length ≤ 400000
(matches upload canvas path).

**Test:** `tests/unit/settings-export.test.mjs` — reject non-image / over-cap.

---

## Scenery / track build

Pipeline: [SCENERY-AND-TRACK-BUILD.md](SCENERY-AND-TRACK-BUILD.md). Helper
catalogue: [SCENERY-API.md](SCENERY-API.md). `scenery(api)` surface frozen at
**112 members** by `tests/unit/scenery-api-contract.test.mjs`.

### S1 — `along()` + wrapped helpers double-apply `_sceneryShift`
**Severity:** high · **Status:** FIXED here · **Confidence:** high

**Where:** `js/track/tracks.js` `transformSceneryApi`; `js/track/core/space.js`
`sceneryNodeToAuthored`

**What:** Wrapper remapped `(s0,s1)` into engine space, then callback helpers
remapped engine `k` again. Measured mid-span displacement: imola ~1817 m,
spa ~277 m.

**Fix:** `along` walks the remapped span but hands the callback **authored-frame**
`k` via `sceneryNodeToAuthored`, so wrapped helpers apply `sceneryNode` once.
Engine-internal `ctx.along` (walls/fences) unchanged.

**Test:** `tests/unit/scenery-guards.test.mjs` — imola/spa mid-span vs `K(mid)`
within tens of metres (not kilometres).

### S2 — `furniture.tree: "pine"` silently became broadleaf
**Severity:** medium · **Status:** FIXED here · **Confidence:** high

**Where:** `js/track/scenery/nature.js` `canopyR`; five circuit defs;
`tests/unit/circuit-vocab.test.mjs`

**What:** `"pine"` was not in `SPECIES`; scatter fell through to broadleaf. A
prior fir retarget grew interpenetration because `canopyR("fir")` was ~half of
broad at h=12.

**Fix:** Inflate `canopyR("fir")` to mesh extent floored near broadleaf keep-out;
retarget anderstorp / fuji / mont_tremblant / okayama / zolder to `"fir"`.
`KNOWN_UNHANDLED` cleared (no fake `"pine"` SPECIES alias).

**Test:** `tests/unit/circuit-vocab.test.mjs` — every `furniture.tree` is a
known species.

### S3 — Large `_sceneryShift` remaining (frame debt)
**Severity:** medium (trap) · **Status:** OPEN (documented) · **Confidence:** high

**Where:** `js/track/tracks.js` `buildCenterline`; consumers
`transformSceneryApi`, dress, `HKSHIFT`, bakedModel path.

**What:** Independent census of racing-forward leftovers with `|shift| > 0.01`:
**13** circuits (not the earlier “15” prose). Measured on this tree (2026-09-24):

| id | `_sceneryShift` | notes |
|---|---|---|
| spa | 0.9575 | `sceneryStartFrac` 0.9875 |
| hungaroring | 0.9029 | |
| jerez | 0.8736 | `sceneryStartFrac` 0 (startFrac moved) |
| zolder | 0.8438 | `sceneryStartFrac` 0 |
| vegas | 0.8433 | |
| brands_hatch | 0.8365 | `sceneryStartFrac` 0 |
| qatar | 0.6953 | |
| silverstone | 0.5233 | |
| imola | 0.5094 | |
| mont_tremblant | 0.2834 | `sceneryStartFrac` 0 |
| abudhabi | 0.1015 | |
| donington | 0.0973 | |
| shanghai | 0.0895 | |

Also still large but outside that 13 (intentional anchors / reverse-source):
monaco 0.938 (`sceneryCoordinates: "source"`, `sceneryStartFrac` 0.28);
singapore 0.530 (`sceneryStartFrac` 0.5075, reverse).

**Not fixed here:** dropping `sceneryStartFrac` without a per-circuit probe is
unsafe (estoril lesson). Prefer frame audits over blanket zeroing. S1 no longer
double-shifts on these; residual shift remains authoring debt.

### S4 — `pits.js` `sweep()` invisible to primitive audits
**Severity:** medium · **Status:** FIXED here · **Confidence:** high

**Where:** `js/track/scenery/pits.js` `sweep`

**What:** Pit wall/cap/outer wall pushed `out.pos`/`out.idx` directly, so
clip/coplanar/float could not name them.

**Fix:** Record `__blocks` ids on each sweep strip (`pit-wall`,
`pit-wall-cap`, …) so audits can name them. Keep the tip extrusion
winding — routing the mesh through `TrackGeom.emit` coplanar-fought bay
panels (bahrain/istanbul) and left hungaroring entry lamps floating.

### S5 — Coplanar ground slabs vs terrain
**Severity:** medium · **Status:** FIXED here (seating) · **Confidence:** high

**Where:** `js/track/tracks.js` universal ground / `groundPatch` / water sheet

**What:** Large ground slabs and patch tops sat on the terrain plane.

**Fix:** Seat patch tops 2 cm below terrain estimate; water sheet 2 cm deeper;
universal floor nudged similarly. Did **not** explode `FIGHT_MAX` (no baseline
campaign).

### S6 — Props-over-road blind to band-spanning solids
**Severity:** medium · **Status:** FIXED here · **Confidence:** high

**Where:** `tools/track/measure-props-over-road.mjs`;
`tests/specs/props-over-road.spec.js`

**What:** Only faces with interpolated height in `(TOL, CEIL)` counted; a solid
whose y-span covers the whole band had no qualifying face.

**Fix:** Also flag footprint ∩ road when triangle y-span overlaps
`[road+TOL, road+CEIL]`.

### S7 — Overlapping `waterBand` slabs
**Severity:** low–medium · **Status:** FIXED here · **Confidence:** high

**Where:** `js/track/tracks.js` `waterEmit`

**What:** Adjacent/overlapping bands stacked coplanar quads.

**Fix:** `waterOccupied` cell set skips duplicate cells; sheet y biased 2 cm
deeper (pairs with S5).

### S8 — `SceneryThemes.variants` tables unused
**Severity:** low · **Status:** FIXED here · **Confidence:** high

**Where:** `js/track/scenery/themes.js`

**What:** `variants.roof|facade|tower` merged into themes but no scenery
consumer read them.

**Fix:** Deleted the dead `variants` tables from BASE/THEMES. Kept
`SceneryThemes.variant()` (deterministic picker still used by
`tests/unit/scenery-kits.test.mjs`).

### S9 — Skill doc claimed `bakedModel` never places on shifted circuits
**Severity:** low (docs) · **Status:** FIXED this PR · **Confidence:** high

**Where:** `.claude/skills/scenery-dress/references/rules.md`; code +
`tests/unit/scenery-guards.test.mjs`.

### S10 — `bakedModel` road guard + pack-visible node VM
**Severity:** — · **Status:** FIXED · **Confidence:** high

**Where:** `bakedModel` `rejBox`; `tools/lib/pack-assets.cjs` via
`track-build-vm.cjs`.

---

## Deliberately not listed as defects

- Race-mode cut laps still set `c.best` / FL with +5 s pricing — product ladder.
- Pit-lane lap setting FL — matches real F1.
- Prior 2026-09-22 FIXED batches — re-checked; still fixed.
- S3 residual `_sceneryShift` — documented above; needs per-circuit probes.

## How this file relates to the ledger

`docs/notes/DEFECT-LEDGER.md` is the long chronological register. This file is
the **current credible shortlist** from the 2026-09-24 architecture/bug-hunt
pass: B1–B8 and S1–S2 / S4–S10 FIXED here; S3 remains OPEN as measured frame
debt. Prefer linking here from PRs; promote lasting open items into the ledger
when a campaign owns them.
