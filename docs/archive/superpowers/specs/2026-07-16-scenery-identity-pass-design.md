# Scenery identity pass — all 24 circuits

## Goal

Make every Apex 26 circuit read as itself within ~0.5s at race speed by
shipping each track’s audited **Top-3** fixes (accuracy gaps *and*
game-feel / recognizability). New composite models, palettes, `STYLES` /
`FURN` / `BARRIER` entries, and scenery helpers are allowed.

Criterion for prioritization (agreed): **C** — both real-world accuracy and
in-game silhouette readability, ranked by leverage.

## Scope

### In scope

- Per-track `scenery(api)` in `js/tracks/<id>.js`
- Shared dressing: `STYLES` / `FURN` / `BARRIER` / local palettes in
  `js/track-scenery-data.js`
- New composite helpers in `js/tracks.js` (or geometry helpers) when a
  silhouette repeats or needs a clean API
- Track `pal`, `elevations`, and local half-width `w:` when a Top-3 item
  requires them
- Brief corrections in `docs/tracks/<id>.md` when reality contradicts the
  brief (e.g. COTA Observation Tower placement)
- `verify-track`, survey before/after, and one cache bump per shipped batch

### Out of scope

- Physics, AI, input, HUD, Data Hub, PWA/CI
- Full layout re-traces (except local `w:` / elevation for identity)
- Texture / material systems — stay procedural coloured boxes
- The separate gameplay quality pass in
  `docs/superpowers/specs/2026-07-16-quality-pass-design.md`
- Optional backlog items unless they are nearly free once Top-3 is done

### Success criteria

- All 24 tracks have their Top-3 landed and survey-verified
- `node tools/verify-track.cjs --all` clean (no scenery throws)
- No new props on/above the racing line; prefer reallocate verts over stack
- Tracks remain visually distinct after shared palette/model reuse

## Delivery model

Ship in **five theme batches**. Within each batch: add shared helpers first,
then apply Top-3 per track, then verify/survey the batch before the next.

| Batch | Tracks | Shared investments |
|-------|--------|--------------------|
| **1 · Night streets** | singapore, vegas, jeddah, baku | Cool night pal presets; underpass/portal helper; LED façade / fire rings; concrete canyon wall variant (grey + accent stripes) |
| **2 · Desert nights** | bahrain, qatar, abudhabi | Tall flood-mast kit; sail / gridshell canopy; continuous verge sandwich (green→sand); open-island sky composition |
| **3 · Green permanents A** | spa, monza, silverstone, suzuka, imola, redbull | Atmosphere presets (damp / overcast / alpine); flyover / banking prism kit; Ferris declutter pattern |
| **4 · Green / park B** | montreal, interlagos, albert_park, hungaroring, zandvoort, cota, mexico | Water tint helpers; amphitheatre bowl seat wall; Observation-tower red-tube veil; dusty vs lush grass presets; banked-kerb strip |
| **5 · Modern / hybrid** | miami, shanghai, madrid, monaco | Aqua runoff; twin wing-bridge; La Monumental bowl; sparse Med canyon buildings (monaco reuses canyon helpers from batch 1) |

### Rules

1. **Top-3 only** as the definition of done for a track; pull backlog only when
   cost is near-zero after Top-3 (e.g. palette already open).
2. **Shared API:** if two+ tracks need the same silhouette, add a named helper
   (`gridshellCanopy`, `underpassPortal`, `bankedKerbStrip`, `floodMastRing`,
   …). Track-unique heroes stay inline in `scenery(api)`.
3. **Vert discipline:** prefer cull + reshape over add. Street/desert tracks
   are already heavy — night batches emphasize reallocation.
4. **Track-keyed dressing:** prefer `STYLES[id]` / `FURN[id]` / `BARRIER[id]`
   over mutating `THEME_DEF` so one track’s retune does not wash out others.
5. **One batch at a time** to avoid colliding edits in shared files.

## Verification

### Per track

1. `node tools/verify-track.cjs <id>`
2. `node tools/survey-track.mjs <id> after` — eye + orbit vs Top-3 intent
3. Spot-check on-track rejection; run `props-over-road` if close buildings or
   barriers moved
4. Cache bump (`index.html` `?v=` + matching `version.json`) once per
   **batch** ship, not per micro-edit

### Per batch

- `node tools/verify-track.cjs --all` before calling the batch done
- Regenerate intentional Playwright track snapshots when they exist
- Smoke one night + one day track for lighting/palette regressions

## Risks

| Risk | Mitigation |
|------|------------|
| Vert blow-ups on street/desert tracks | Cull first (cityFront, fantasy landmarks); measure before stacking heroes |
| Shared STYLES change breaks siblings | Track-keyed entries; avoid `THEME_DEF` mutations |
| Elevation / `w:` changes alter driving | Keep driving feel; if narrowing (Baku), re-check walls / barrier tests |
| Brief vs reality | Update `docs/tracks/<id>.md` in the same change as the scenery fix |
| Parallel edit collisions | One batch at a time; one track file per commit slice |

## Architecture notes

- Placement and helpers: `docs/SCENERY-API.md`, skill `scenery-dress`
- Survey loop: skill `survey-track` (`tools/survey-track.mjs`)
- City generator / palettes: `js/track-scenery-data.js` (`STYLES`, `FURN`,
  `BARRIER`, `NC`/`DC`)
- Engine wiring: `buildProps` in `js/tracks.js`; new `def` keys must be
  whitelisted in the `LIST = DEFS.map` block

## Shared toolkit (invented from audits)

Cross-track helpers / data to add **once**, then call from many circuits.
Track-unique heroes stay inline in `scenery(api)`.

### New / extended composite helpers (`js/tracks.js` api)

| Helper | Purpose | Consumers |
|--------|---------|-----------|
| `underpassPortal(s, opts)` | Dark overhead slab + support piers (cars pass under) | singapore, baku (optional), abudhabi hotel bridge cue |
| `floodMast(k, side, dist, opts)` | Tall dual-arm cool-white flood + optional ground pool | bahrain, qatar, singapore densify |
| `floodMastRing(stepM, opts)` | `every`-style ring both sides | qatar, bahrain |
| `sailCanopy(c, basis, opts)` / `gridshellCanopy(…)` | Disc/ellipse sail or LED lattice veil | bahrain Sakhir crown, abudhabi Yas Hotel |
| `ledFacadeBands(c, h, opts)` | Stacked emissive colour rings/frustums full height | baku Flame Towers, vegas Sphere simplify |
| `concreteCanyon(s0, s1, side, gap, opts)` | Pale grey Jersey wall + optional accent stripe boxes | jeddah, monaco (Armco accent), baku castle |
| `runoffApron(k, side, gap, sz, col)` | Wide low asphalt/gravel apron | silverstone, miami aqua, qatar sand |
| `bankedKerbStrip(s0, s1, side, opts)` | Tilted red/white kerbs + SAFER-ish outer rail | zandvoort |
| `bowlSeatWall(s0, s1, side, gap, opts)` | Continuous eye-height stand wall / baseball bowl | mexico Foro Sol, madrid Monumental |
| `pastelStreetRow(s0, s1, side, gap, opts)` | Sparse cream/ochre Med apartment boxes | monaco |
| `observationTowerVeil(k, side, dist, opts)` | Pale shaft + red tube veil → stage | cota |

### Palette / atmosphere presets (`js/track-scenery-data.js` or track `pal`)

Named merge helpers or documented RGB packs (not mandatory globals — track
`pal` may embed them):

| Preset | Intent |
|--------|--------|
| `ATM.coolNight` | Near-black zenith, cool fog, warm floods only on asphalt |
| `ATM.warmNight` | Magenta/amber haze (Vegas) |
| `ATM.dampArdennes` | Grey zenith/horizon, dense cool fog, no snowcaps |
| `ATM.britishOvercast` | Pale grey-blue sky, lush grass |
| `ATM.dustyBowl` | Bleached straw-olive grass/runoff (Hungaroring) |
| `ATM.alpineGreen` | Vivid green aprons + cool sky (Red Bull) |
| `ATM.rivieraDay` | Clear blue + warm pastels (Monaco) |
| `COL.aquaRunoff` | Dolphins aqua apron |
| `COL.basinTeal` | Montreal Olympic Basin / river |
| `COL.desertSand` | Warm tan runoff sandwich |

### STYLES / FURN / BARRIER retunes

| Key | Change |
|-----|--------|
| `STYLES.madrid.dayPal` | White / glass / steel / stone (not ochre brick canyon) |
| `STYLES.shanghai` | Lower `bh` / neon bias; marsh campus not megacity wall |
| `STYLES.monaco` | Keep short Med; support pastelStreetRow |
| `FURN.baku` / `FURN.monaco` | Palm-biased furniture where scenery already palms |
| `FURN.bahrain` / qatar | Sparse or none green; cool-white lamp colour |
| `FURN.albert_park` / imola | Broadleaf / eucalyptus; `pineFrac` guidance |
| `BARRIER.jeddah` | Night = pale grey concrete + green/gold accents |
| `BARRIER.abudhabi` | Teal / magenta / amber Yas accents (new entry) |
| `BARRIER.monaco` | Ensure red/white F1-TV read on scenery walls where used |

### Unique inline heroes (do **not** force into shared API)

Casino Hôtel de Paris twin, MBS lean, Strip hotel re-order, Favela patch,
Sopraelevata flyover, Ferris re-aim, Yas marina yacht hierarchy, Shanghai
snail coil, Senna S Brazilian crowd bias, Wall of Champions panel, etc.

---

## Appendix A — Top-3 checklist (source of truth)

Unchecked = not yet implemented. Source: parallel scenery audits
2026-07-16 (criterion C).

### Batch 1 — Night streets

#### singapore
- [x] 1. Cool night palette retune (black/cool sky; warm floods on tarmac only)
- [x] 2. Sheares + finish underpass portals
- [x] 3. MBS leaning silhouette

#### vegas
- [x] 1. Resequence & re-side Strip landmark corridor
- [x] 2. Sphere as single-hue hero in its sector
- [x] 3. Cull off-route props → verge-safe neon wet-look

#### jeddah
- [x] 1. Grey concrete canyon + Saudi green/gold accents (not solid green night rails)
- [x] 2. Open Red Sea corridor (thin seaward cityFront)
- [x] 3. Cool-white LED light tunnel densification

#### baku
- [x] 1. Castle Section squeeze (road `w:` + walls ≈ 7.6 m)
- [x] 2. Neftchilar left: sell Caspian void (cull mid-ground clutter)
- [x] 3. Flame Towers full-height LED fire

### Batch 2 — Desert nights

#### bahrain
- [x] 1. Finish Sakhir Tower sail canopy
- [x] 2. Scale floodlights to night-race drama (~36–42 m, cool white)
- [x] 3. Sparse desert — cut green oasis / palm clutter

#### qatar
- [x] 1. Floodlight ring as primary identity
- [x] 2. Continuous green verge → warm sand sandwich
- [x] 3. Replace fantasy landmarks with Tilke T1/paddock language

#### abudhabi
- [x] 1. Yas Hotel continuous gridshell + monocoque bridge
- [x] 2. Marina corridor composition (yacht + glow sightline)
- [x] 3. Thin island skyline — open leisure vs dense cityFront

### Batch 3 — Green permanents A

#### spa
- [x] 1. Cool Ardennes atmosphere (kill sunny alpine / snowcaps)
- [x] 2. Raidillon amphitheatre hero (Gold 3 scale)
- [x] 3. Forest-sweeper identity: Pouhon + Stavelot

#### monza
- [x] 1. Ascari Sopraelevata flyover
- [x] 2. Chicane red/white kerb punctuation
- [x] 3. Curva Grande pine wall

#### silverstone
- [x] 1. Vast airfield run-off aprons
- [x] 2. British overcast sky + lusher grass
- [x] 3. Open Hangar Straight + barrel hangar silhouettes

#### suzuka
- [x] 1. Ferris silhouette + Motopia declutter / re-aim
- [x] 2. Figure-8 crossover readable at speed
- [x] 3. Esses climb identity (sakura + relief + forest)

#### imola
- [x] 1. Continuous Santerno riverside
- [x] 2. Acque Minerali / Piratella deciduous hollow
- [x] 3. Variante Alta crest + Rivazza plunge silhouette

#### redbull
- [x] 1. Amplify elevation (~40–65 m)
- [x] 2. Green near-field identity (runoff / aprons)
- [x] 3. Punch Remus crest + T3–T4 spectator amphitheatre

### Batch 4 — Green / park B

#### montreal
- [x] 1. Bright teal Olympic Basin + river
- [x] 2. Wall of Champions hero beat
- [x] 3. Reshape Casino into Expo pavilion silhouette

#### interlagos
- [x] 1. Hero Senna S corridor (plunge + Brazilian crowd)
- [x] 2. Punch favela silhouette closer / clearer
- [x] 3. Readable Subida dos Boxes + distinctive pit tower

#### albert_park
- [x] 1. Lake + CBD coplanar composition (cull towers)
- [x] 2. Eucalyptus parkland, not pine forest
- [x] 3. Temporary barrier + kerb densification

#### hungaroring
- [x] 1. Dry dusty palette + canopy
- [x] 2. Elevation amphitheatre (~36 m)
- [x] 3. Modern s=0 pit + covered main tribune

#### zandvoort
- [x] 1. Banked-corner visual kit (Hugenholtz + Arie Luyendyk)
- [x] 2. Sand-first mid-lap (Hunserug → Scheivlak)
- [x] 3. Coastal silhouette beats (sea peeks)

#### cota
- [x] 1. Relocate + restyle Observation Tower onto amphitheater (T16–18); update brief
- [x] 2. Commit Turn 1 to Big Red only (no tower)
- [x] 3. Open Hill Country frame (thin cityFront; drop Velocity Tower)

#### mexico
- [x] 1. Far Sierra Nevada mountain ring + cool haze
- [x] 2. Tighten Foro Sol as enclosed baseball bowl
- [x] 3. Park-first composition (push city back; densify Mixhuca green)

### Batch 5 — Modern / hybrid

#### miami
- [x] 1. Aqua runoff identity
- [x] 2. Marina hero pass (T5–9)
- [x] 3. Campus hierarchy: stadium first, skyline second

#### shanghai
- [x] 1. Clarify twin wing bridges (collapse pit-straight stack)
- [x] 2. Make T1–3 snail readable from cockpit
- [x] 3. Retarget backdrop: marsh + one hazy Pudong (+ Yu Garden paddock)

#### madrid
- [x] 1. Hero La Monumental (white bowl + flood ring)
- [x] 2. IFEMA white vs Castilian straw (`STYLES.madrid` dayPal)
- [x] 3. Hybrid rhythm + El Búnker + motorway bridge landmarks

#### monaco
- [x] 1. Sparse close pastel street canyon (Beau Rivage + Tabac inland)
- [x] 2. Casino Square twin — Hôtel de Paris mass
- [x] 3. Tabac–pool inland pastel façade row

---

## Appendix B — Audit provenance

Parallel research agents (2026-07-16) produced per-track scenery audits
against `docs/tracks/<id>.md`, `js/tracks/<id>.js`, shared dressing tables,
and web reference for each real circuit. Full narratives live in those agent
transcripts; this spec holds only the actionable Top-3 checklist.
