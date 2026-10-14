# Shanghai International Circuit — survey (2026-10-14)

**Circuit id:** `shanghai` · **Theme:** `modern` · **Live:** [f1-game Shanghai](https://brycejmurrin.github.io/f1-game/)  
**Evidence:** 15 headless TLX captures in `artifacts/shanghai-survey/` (this session); node audits via `audit-circuit.cjs`.

## Code map

| Layer | Path | Role |
|-------|------|------|
| Circuit def | `js/circuits/shanghai.js` | OSM centreline (`path.len` 5454 m), `sceneryStartFrac` 0.1525 → `_sceneryShift` ≈ 0.09, `flatTerrain` + `terrainOuter` 120, three gentle `elevations`, `bankZones`, FIA `sectors`/`turns`, palette, `dressingExclusions` (city + two foliage bands), `cityStyle` (marsh campus, not megacity wall). |
| Scenery | `js/circuits/scenery/shanghai.js` | ~1070 lines: pit garages + twin `overheadSpan` wings, main `grandstandEx` bays, Yu lakes/pavilions/boardwalk, T1–3 snail `runoffApron`, `shanghai-circles-stand` lotus roof, Pudong `modelGroup`, rice-paddy blocks, midfield service roads, back-straight stands/sails, T14 apron. Uses `sl()` racing-frame remap (pit straight at file origin). |
| Engine registry | `js/track/tracks.js` | `Tracks.LIST` / `build()` / `buildCenterline()` — Shanghai is a lazy scenery def loaded from `TrackScenery["shanghai"]` (`tools/manifest.cjs`). |
| Meta | `js/track/circuit-meta.js` | Picker row: 5.5 km, tyre severity 0.45, night-capable. |
| Landmarks | `tests/data/landmarks/shanghai.json` | Required `modelGroup` ids: wing east/west, circles stand, Yu pavilions, lake boardwalk (`shanghai-pudong` is required at runtime but outside BATCH-01 window). |
| Brief | `docs/tracks/shanghai.md` | Authoritative palette, landmark table, marsh/paddy research notes. |

Shared builders consumed here: `js/track/scenery/build-props.js`, `models.js` (`overheadSpan`, `grandstandEx`), `city.js` (generic `building`/`plantTree` — clipped in two spots, engine-owned).

## Theme and models

- **Read:** Hazy pale sky, concrete/aluminium pit complex, crimson/alu grandstands, red kerb rhythm through the snail, marsh-green outfield with **flooded rectangular paddies** (`waterSurface` + bunds), soft **Pudong hero cluster** at s≈0.30 (fiction ~30 km away; intentional cue).
- **Hero models (required):** Twin wing decks + piers, overlapping-circle secondary stand, Yu Garden pavilion cluster, lake boardwalk, Pudong tripod/towers group.
- **Night:** `shanghai|day|dry` and night presets in `js/lighting/presets.js`; cyan/teal `cityStyle.neon` bias — viable but not re-shot this pass (one cinematic night frame at s=0).

## Screenshot index

| File | Lap s (racing) | Camera | What it shows |
|------|----------------|--------|----------------|
| `shanghai-0-orbit.png` | ~0.00 | orbit | Pit straight, main stand, wing gantry, start lights — **identity reads well**. |
| `shanghai-0-eye.png` | ~0.00 | eye | Cockpit approach to grid; wing bridge ahead. |
| `shanghai-5-trackside.png` | ~0.05 | trackside | T1 snail outside — **large red stand mass can dominate FOV** (lotus/crimson geometry). |
| `shanghai-8-orbit.png` | ~0.08 | orbit | Snail + secondary stand + runoff pads. |
| `shanghai-10-eye.png` | ~0.10 | eye | Mid-snail; Yu red-roof houses on left horizon. |
| `shanghai-30-orbit.png` | ~0.30 | orbit | Pudong cluster + tree line — **distant blocks read as floating slabs** until haze sells depth. |
| `shanghai-45-eye.png` | ~0.45 | eye | Mid-arena grandstands + approach to footbridge. |
| `shanghai-47-trackside.png` | ~0.47 | trackside | **Mid-arena spectator bridge** (required landmark) clearance read. |
| `shanghai-55-eye.png` | ~0.55 | eye | Infield between 上 loops — service roads + sheds (denser than older builds). |
| `shanghai-75-orbit.png` | ~0.75 | orbit | Back straight length + marsh verge. |
| `shanghai-82-eye.png` | ~0.82 | eye | High-speed straight, billboards, pine verge. |
| `shanghai-90-trackside.png` | ~0.90 | trackside | T14 hairpin runoff apron + stands. |
| `shanghai-95-orbit.png` | ~0.95 | orbit | Pit entry / lake margin return to start. |
| `shanghai-0-cinematic.png` | ~0.00 | cinematic night | Pit lighting smoke test (not compared to day). |
| `shanghai-45-orbit.png` | ~0.45 | orbit night | Mid circuit floodlit stands. |

## Findings (visual + audit)

### Layout / road

1. **Surface fold (engine):** `verify-track` reports **1 surface fold** at node 702 (min radius 7.76 m @ 582). Not introduced by this pass; fixing needs centreline/banking review (`js/circuits/shanghai.js` `bankZones` / path), not scenery-only.
2. **Snail read:** Coiling pale runoff + dense stands outside T1–3 match the brief; kerb boxes were removed earlier (buried under `place()` sink) — apron-only kerb cue is correct but **less stripe detail** than real China kerbs.

### Scenery / landmarks

3. **Pit / wings / main stand:** Strongest identity beat; twin wings and glazed pit row match `docs/tracks/shanghai.md`. Minor **grandstand vs pit-step coplanar** (0.5 m, baseline).
4. **T1 trackside camera:** At s≈0.05, **crimson stand/lotus mass fills the frame** — not a z-fight, but hurts corner read for new players (see `shanghai-5-trackside.png`).
5. **Pudong:** Hero group reads; **perimeter haze boxes** at s≈0.30 can look like floating tiers from low orbit (acceptable at speed, weak in orbit cam).
6. **Marsh / paddies:** Eight 2×3 paddy blocks + reeds sell Jiading; **11 buried bund tops** remain at ground-audit baseline (slope + bund height trade-off on `seat.box` at lines 60–63).
7. **Midfield:** Service-road ribbons and tech sheds fix the “empty green” between loops; performance OK (~255.6k prop tris, identical compaction).

### Clipping / perf (node VM, 2026-10-14)

| Check | Before survey | After fixes |
|-------|---------------|-------------|
| Severe clip spots | 6 (baseline cap) | **2** (yuGarden×engine `city.js` building @ 0.121; mid-lap replay×engine building @ 0.564) |
| Float | 0 | 0 |
| flatCoplanar | 0 | 0 |
| buried | 11 | 11 (within baseline) |
| Guard drops | 53 trees, 22 buildings, … | unchanged (expected on dense circuit) |

**Perf:** Single-orbit captures ~1.0–1.7 MB PNG each; no obvious SwiftShader stall on batch of 15. Back straight is the cheapest sector; pit/snail highest overdraw (stands + wings).

## Ranked improvements

| Rank | Item | Risk | Scope |
|------|------|------|-------|
| 1 | **Done:** Remove duplicate `crowds()` boxes that re-covered `fanTerraces` (cleared 4 severe clips). | Low | scenery |
| 2 | **Done:** Skip `backdrop()` anchors sunk >0.5 m below grade (reduces marsh hill bury). | Low | scenery |
| 3 | Engine: resolve **yuGarden vs `city.js` plantTree/building** @ s≈0.12 (2.8 m) — needs `dressingExclusions` or city spawn guard, not more Yu shuffling. | Med | engine / def exclusions |
| 4 | Re-seat **notch building** near T1 (`K(0.078)`) or add `indexSolid` if clip persists with city layer. | Low | scenery |
| 5 | Add **visible kerb rhythm** on snail without `place()` 0.8 m sink (e.g. `runoffApron` tint strips or engine kerb helper). | Med | scenery + API |
| 6 | Investigate **surface fold** node 702 with `verify-track` centreline export + optional `bankZones` tweak. | Med | def |
| 7 | Optional **moon-gate** boardwalk detail on Yu lake (brief §6) — cosmetic. | Low | scenery |
| 8 | Night pass: tune `shanghai|night|*` haze + wing soffit emissive (lighting-tuner). | Low | presets |

## Verification commands

```sh
node tools/track/verify-track.cjs shanghai
node tools/track/audit-circuit.cjs shanghai
node tools/track/clip-audit.cjs shanghai --why
```
