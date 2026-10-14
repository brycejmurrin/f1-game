# Catalunya — circuit survey (2026-10-14)

**Circuit id:** `catalunya` · **GP:** Spanish GP (Barcelona-Catalunya, Montmeló) · **Length:** ~4.657 km, 14 turns, clockwise · **Theme:** `green` (dry Catalan hillside)

**Brief:** `docs/tracks/catalunya.md` · **Data:** `js/circuits/catalunya.js` · **Scenery:** `js/circuits/scenery/catalunya.js` (lazy `TrackScenery.catalunya`)

**Captures:** headless TLX batch via `node tools/shot/shot.mjs --batch` → session folder `catalunya-survey/` (15 frames, ≤1 MB JPEG each). Fractions are racing-lap arc `s` after `startFrac: 0` (no `sceneryStartFrac`).

---

## 1. Code map

| Layer | Role |
|--------|------|
| `js/circuits/catalunya.js` | OSM centreline (`path.len` 4670 m), `startFrac` 0, palette, four elevation bumps, three `hwZones` (Seat / La Caixa / final complex), four `bankZones`, 14 `turns`, `ownPitStraight`, `terrainOuter: 115`, foliage exclusions (main straight + Campsa bowl), `furniture` stone-pine kit |
| `js/circuits/scenery/catalunya.js` | Full dressing: pit bays + race control, Tilke main stand + hero `catalunya-main-grandstand`, Tribuna J, pit-end scoreboard, railway strip, sun terraces, sail canopies, gravel/tyres at T1 / Seat / La Caixa / final, ridges, paddock clubs, sponsor hoardings, stone-pine back half, camera towers, `circuitKit` marshal shelter + Campsa recovery bay |
| `js/track/` (engine) | Builds centreline, terrain, road, lazy-loads scenery closure; frac tables consumed with `_sceneryShift` when present (Catalunya: shift 0) |
| `tests/data/landmarks/catalunya.json` | Required hero models: `catalunya-main-grandstand`, `catalunya-pit-end-scoreboard`, `catalunya-race-control` |
| Offline QA | `node tools/track/verify-track.cjs catalunya`, `node tools/track/audit-circuit.cjs catalunya` |

**Lap landmarks (authoring fracs in scenery comments):** pit straight 0.945–0.024 · T1 Elf ~0.158 · Repsol ~0.345 · Seat ~0.432–0.442 · Campsa ~0.609 · La Caixa ~0.727 · final complex ~0.92–0.95.

---

## 2. Theme, palette, and models

- **Atmosphere:** hard dry sun, bleached scrub, ochre runoff — matches `pal` in the def (`zenith` blue, `horizon` warm grey, `grass` / `runoff` ochre-green).
- **Planting:** umbrella pine + dry scrub (`furniture.tree: stonePine`); open infield at Campsa (`dressingExclusions` + `openInfield()` in scenery).
- **Hero architecture:** white concrete pit terrace (six `catalunya-pit-bay-*` groups), Tilke main grandstand (engine `grandstandEx` + detailed `catalunya-main-grandstand`), LED pit totem, low railway behind main stand.
- **Crowd furniture:** `sunTerrace()` with chord-scaled seating (fixes terrace fold on tight bends), shade sails, `spectatorHill` at Seat, orange cantilever stand outside T1.
- **Broadcast:** compound at ~0.912, four `cameraTower` placements on long corners.
- **Perf (audit build):** ~182k prop tris compacted, 77 model groups in a live headless frame; no floaters; centreline surface folds 0.

---

## 3. Visual survey (screenshots)

| # | File | View | Notes |
|---|------|------|--------|
| 01 | `01-main-straight-sf.jpg` | Orbit over S/F | Pit terrace right, main straight gantries, distant ridges; green racing-line chevrons read clearly. |
| 02 | `02-main-grandstand.jpg` | Trackside (−1) | Tilke stand + suite glazing; fascia reads “Mediterranean white”; railway ballast behind is subtle at this angle. |
| 03 | `03-pit-scoreboard.jpg` | Orbit pit exit | Pit bays, race-control mass, pit-end LED totem, Tribuna J side; hedge along pit wall. |
| 04 | `04-t1-elf.jpg` | Trackside T1 | Heavy braking gravel + orange cantilever stand; large sun-terrace blocks on outside — intentional crowd bowl. |
| 05 | `05-renault-sector.jpg` | Mid-sector orbit | Stone-pine back rank + guardrail; terrain drapes read as terraced farmland. |
| 06 | `06-repsol.jpg` | Trackside Repsol | Sponsor hoarding visible on braking approach; camera tower on outside. |
| 07 | `07-seat-terrace.jpg` | Seat / infield | Shade sails + sun terraces; open bowl matches real Campsa approach sightlines. |
| 08 | `08-campsa-crest.jpg` | Campsa crest | Wide ochre runoff, blind crest feel; flood masts dominate skyline (tall but on-brief). |
| 09 | `09-la-caixa-hairpin.jpg` | La Caixa | Yellow tyre wall, gravel patch, terraces on both sides; hedge reads cleanly. |
| 10 | `10-final-sector.jpg` | Stadium section | Terraced seating colours (red/yellow/green) echo TV framing of sector 3. |
| 11 | `11-pit-lane-gantry.jpg` | Pit entry gantry | Pit lane merge + paddock club boxes. |
| 12 | `12-midlap-chase.jpg` | Chase cam mid-lap | Overall scale and tree density — thin, not forested. |
| 13 | `13-broadcast-compound.jpg` | TV compound | Vans/dishes/mast behind straight kink. |
| 14 | `14-paddock-club.jpg` | Eye paddock clubs | Pergola decks + glass facades on pit-side terraces. |
| 15 | `15-la-caixa-after-fix.jpg` | La Caixa (post clip fix) | Same framing as 09 after terrace/mast de-overlap pass. |

**Bugs not seen in captures (offline audits):** no road surface folds; no props-over-road failures in historical CI timings; no terrain-over-road on this id in recent runs.

**Minor visual nits (acceptable / backlog):**

- T1 trackside: sun-terrace mass reads as a single brown slab at low angles (procedural boxes, not baked seating).
- Main-stand hero mesh stacks on `grandstandEx` — slight double silhouette from some orbit angles.
- `drape()` ochre terrace bands can bury into hillside (ground audit “buried” within baseline 5) — intentional grounded chords, not floaters.
- T1 minor clip 0.50 m `addBox × addFrustum` at frac ~0.135 (flood mast vs terrace) — below severe threshold; left for a fleet-wide mast/terrace spacing pass.

---

## 4. Ranked improvements

| Priority | Item | Risk | Notes |
|----------|------|------|--------|
| P0 (done this pass) | Severe prop clip at La Caixa terraces (~0.699) and final-sector terrace vs cypress (~0.909) | Low | Shortened La Caixa `sunTerrace`, nudged flood mast, widened Repsol terrace gap, moved shade sail; clip severe 5 → 0 (`clip-baseline.json`). |
| P1 | Add optional `catalunya-pit-bay-1`… to landmark registry if we want pit hero parity with main stand | Low | Models already `required: true` in scenery; registry lists three heroes only. |
| P2 | Soften T1 sun-terrace silhouette (tier colours / break up monolithic slab) | Medium | Art pass only in `scenery/catalunya.js`. |
| P3 | Named Montseny backdrop | High uncertainty | Brief says keep anonymous ridges — do not label without dated photo evidence. |
| P4 | Final-chicane `hwZone` label vs 2023 layout | Docs/engine | Track has no chicane since 2023; `hwZones` still names “final chicane complex” — geometry is slow esses; rename in def comment only when touching layout. |
| P5 | Motion flicker pass under gantries | Manual | `motion-capture.mjs` not run this session; coplanar overhead gate is clean in VM. |

---

## 5. Fixes applied (2026-10-14)

**File:** `js/circuits/scenery/catalunya.js`

- Repsol sun terrace: lateral gap 19 → 23 m (clears flood-mast frustum clipping).
- La Caixa sun terrace: end frac 0.705 → 0.690, five → four rows (removes overlap with shade sail / mast frusta at ~0.699).
- Final-sector terrace: end 0.908 → 0.902, gap 19 → 22 m (clears cypress vs seating at ~0.909).
- Shade sail at La Caixa: moved 0.690 → 0.715, gap 36 m.
- Flood mast: 0.700 → 0.732 (−1 side) to clear terrace stack.
- Gravel patch id renamed `catalunya-chicane-gravel` → `catalunya-seat-gravel` (Seat corner, not a chicane).

**Baseline:** `tools/track/clip-baseline.json` `catalunya` severe cap 5 → 0.

**Verification:**

```text
node tools/track/verify-track.cjs catalunya          # OK, surface folds 0
node tools/track/audit-circuit.cjs catalunya       # ok, clip severe 0/0
node --test tests/unit/prop-clipping.test.mjs      # pass (fleet clip ratchet)
```
