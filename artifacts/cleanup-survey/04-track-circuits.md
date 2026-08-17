# 04 — track / circuits cleanup survey

Branch: `cursor/project-cleanup-survey-d0fd`  
Scope: `js/track/**`, `js/circuits/**`, and their `CLAUDE.md`  
Method: static only (no browser, no mass `verify-track`)  
Date: 2026-08-17T11:52Z

## Verdict

High-confidence cleanup lives in **unused scenery(api) members**, **Monaco/Singapore KOLD shift forks**, **legacy `grandstand()` holdouts**, and **Monaco’s commented-out `cityFront` blocks**. Curvature-sign myths and the arc-length `_sceneryShift` path are already fixed in engine docs/code; remaining “+k = right” text is accurate archaeology, not wrong claims. `HKSHIFT` in `tracks.js` is **not** obsolete — it still stabilises scatter.

---

## Top cleanup candidates (priority order)

### 1. Dead scenery(api) emitters — zero circuit callers

Frozen contract is 111 members (`tests/unit/scenery-api-contract.test.mjs`). Circuits never call:

| Member | Defined in | ~LOC | Notes |
|---|---|---|---|
| `conifer` | `scenery-nature.js` | ~20 | Near-duplicate of `pine` (stacked cones); `pine` has ~35 live circuit calls |
| `house` | `scenery-city.js` | ~37 | Fully implemented residential emitter; never invoked |
| `gridshellCanopy` | `scenery-identity.js` | ~42 | LED lattice; docs example only |
| `underpassPortal` | `scenery-identity.js` | ~35 | Docs example only; circuits use `overheadSpan` / hand portals |
| `bakedModels` | `tracks.js` binding | 1 | Lister helper; circuits use `bakedModel(id)` only |
| `addMountain` | `geom.js` + API | — | Circuits use `mountain()` which already wraps it |

Also never called from circuits (keep if intentional agent/dev surface):

- `lerp` — engine uses `M4.lerp`; no `api.lerp` use in `js/circuits/`
- `modelDiagnostics` — exposed on api; real use is `__apex.modelDiagnostics()`
- `sceneryTheme` — circuits set `def.sceneryTheme`; none read `api.sceneryTheme`

**Cleanup shape:** drop from contract + bindings + docs tables, or leave as reserved with a one-line “unused; reserved” note. Removals need the contract test + `docs/SCENERY-API.md` in the same commit.

### 2. Monaco + Singapore local `KOLD` — obsolete shift fork

Only two circuits still hand-roll OLD-origin node remap:

- `js/circuits/monaco.js` — defines `_offNew` / `_offOld` / `_kShift` / `KOLD` (~L93–104); **7 live call sites** (Casino, tunnel, Rock, pool, Rascasse, …)
- `js/circuits/singapore.js` — copy of the same recipe (~L171–175); **1 live call** (`KOLD(0.999)` for a mast)

This is the control-point **index** delta (`startFrac` vs `sceneryStartFrac`), not `TrackSpace.sceneryOriginDelta`’s arc-length `_sceneryShift`. `js/track/space.js` L101–109 documents why plain index subtraction was the wrong first attempt for dressing tables; the engine now looks up arc length in `buildCenterline`. These locals are migration leftovers for raw `px`/`rx` readers authored against pre-7a17351 origins.

**Cleanup shape:** re-author those fracs into current racing/source space (or route through `TrackSpace.sceneryNode` / wrapped `anchor`), then delete both `KOLD` blocks.

### 3. Legacy `grandstand()` — 23 calls on 3 circuits

`grandstandEx` dominates (228 calls / 36 files). Remaining grey-box `grandstand(`:

| Circuit | Calls |
|---|---|
| `imola.js` | 13 |
| `baku.js` | 5 |
| `jeddah.js` | 5 |

Comments elsewhere already treat `grandstand` as retired in favour of `grandstandEx` + `STAND_SETS`. Not dead API yet — still required by the contract — but a clear finish-the-migration item.

### 4. Commented-out Monaco `cityFront` chunks (~40 lines)

Real disabled code (not prose), four sectors:

- L159–168 — Sainte Dévote both sides  
- L403–412 — Casino / Mirabeau both sides  
- L725–729 — Harbour inland  
- L1050–1059 — Antony Noghès both sides  

Rationale in comments: intrusions even at `depth: 5`. Live replacement is `pastelStreetRow` / hand masses. Safe to delete once the “why disabled” one-liner is kept (or moved to a track brief).

### 5. Unused kit member: `landmarkKit.stadiumSection`

`js/track/landmark-kit.js` L114–129 — exported, **zero** circuit or tracks.js callers. Sibling methods (`roof`, `tower`, `arch`, `canopy`) are used. `circuitKit.localCenter` is internal-only (ok). `pedestrianBridge` is live (Singapore, Baku).

### 6. Dead option: `setback: true` on `building()`

`building()` massing knob is `arch: "setback"`, not `setback: bool`. Still passed (inert) at:

- `bahrain.js` L258  
- `monaco.js` L437, L1451  
- `suzuka.js` L197  

Documented in `scenery-city.js` L755–767 (notes five sites; grep finds four literals — Monaco may have been counted twice in that comment). Pure delete of the dead key, or deliberate `arch: "setback"` with clip re-measure (not a silent cleanup).

### 7. Duplicate / overlapping geometry helpers

| Pair | Status |
|---|---|
| `pine` vs `conifer` | Both stacked-cone conifers; only `pine` used → delete or alias `conifer → pine` |
| `mountain` vs `addMountain` on api | `mountain` is the circuit-facing wrapper; `addMountain` on api is redundant |
| `grandstand` vs `grandstandEx` | Overlap by design; migrate holdouts (#3) then consider deprecating `grandstand` |
| Local `carPark` / `duneDeck` | `miami.js` / `zandvoort.js` locals — not dead; optional promote-to-api later, out of scope for deletion |

`geom.js` `cross`/`norm`/`vadd` vs api math utils: not duplicates to delete — shared primitives re-exported.

### 8. `HKSHIFT` — do **not** remove

`js/track/tracks.js` L1489–1495: `HKSHIFT` / `HK` / phased `every()` keep random scatter stable when `startFrac` moves. Still consumed. Not a fully-migrated leftover.

`sceneryStartFrac` + `_sceneryShift` path is live for 27 circuits. Thirteen defs omit `sceneryStartFrac` (ok when scenery was authored at current `startFrac`; footgun for Bahrain/Jeddah/Magny-Cours with non-zero `startFrac` and no pin — track as risk, not dead code).

### 9. Curvature / startFrac comment hygiene (low urgency)

**No remaining wrong-sign claims in scope.** Correct measured rule is restated in:

- `js/track/CLAUDE.md`, `js/circuits/CLAUDE.md`  
- `spline.js`, `mesh.js` L404–407, `tracks.js` L1756–1759  

“Retired `+k = right`” comments are true history. Optional trim of long war-story blocks (esp. Monaco FULL_LAP essay L131–148, `space.js` L79–116) if comment density is the cleanup goal — content is not stale-wrong.

`startFrac` GPS TODOs remain on `baku.js` / `interlagos.js` (defaults) — unfinished calibration, not myth.

### 10. CLAUDE.md in scope

Both stubs are short and accurate (`+k = LEFT`, `_sceneryShift` compensated idiom, 111-member contract, `verify-track`). No obsolete HKSHIFT/startFrac-myth instructions to delete. No edit needed unless contract members are removed (#1).

---

## Also noted (not top-10)

- **Migration checklist** (`docs/TRACK-MIGRATION-CHECKLIST.md`): migration marked COMPLETE; file stays as new-circuit checklist — not dead.
- **Hockenheim** comment L50–52: deliberate absence of hand `points` because `geo-paths.js` wins — not dead data.
- **Shanghai** paddy waterSurface thinning (L126–140): intentional coplanar fix, not commented-out chunk.
- **`neonTower`**: internal to `scenery-city.js` (not on the 111 contract); used via `building({kind})`.
- Circuits missing `sceneryStartFrac` with `startFrac === 0`: no shift; fine.

---

## Suggested cleanup batches (for a later agent)

1. **Safe static deletes:** unused api members (#1) + `stadiumSection` (#5) + Monaco commented `cityFront` (#4) + inert `setback: true` (#6) — contract/docs lockstep; no geometry change if members truly unused.  
2. **Visual migration:** `grandstand` → `grandstandEx` on Imola/Baku/Jeddah (#3) — needs per-circuit `verify-track` + foundation glance.  
3. **Coordinate migration:** retire `KOLD` (#2) — highest risk; measure landmark positions before/after.

## Not run

Browser groups, mass `verify-track`, and live `__apex` probes — per survey charter.
