<<<<<<< HEAD
# Paul Ricard (`paul_ricard`) — circuit survey (2026-10-15)

**Base brief:** `docs/tracks/paul_ricard.md`  
**Live:** https://brycejmurrin.github.io/f1-game/  
**Captures:** `../../../artifacts/shots/tracks/paul_ricard/` — **36 JPEGs** (q≈80, max width 1280px, under 300 KB), force-added. Captured with shared `shot.mjs` (`--weather`, `--jpeg`, `--present-timeout 90`, `--capture-retries 4`, `--wait 120`).  
**VM audits:** `node tools/track/audit-circuit.cjs paul_ricard` — OK on branch tip.
=======
# Paul Ricard (`paul_ricard`) — circuit survey (2026-10-14)

**Base brief:** `docs/tracks/paul_ricard.md`  
**Live:** https://brycejmurrin.github.io/f1-game/  
**Captures:** `../../../artifacts/shots/tracks/paul_ricard/` — **32 JPEGs** (q≈80, max width 1280px, each under 300 KB), force-added on branch `cursor/paul-ricard-survey-decf`. Weather variants (rain/fog/wet/overcast) deferred until shared shot batch tooling lands.  
**VM audits:** `node tools/track/audit-circuit.cjs paul_ricard` (post-fix: all checks OK).
>>>>>>> origin/cursor/paul-ricard-survey-decf

## Code map

| Layer | Path | Role |
|--------|------|------|
<<<<<<< HEAD
| Circuit def | `js/circuits/paul_ricard.js` | OSM centreline, `reverse: true`, `sceneryCoordinates: "racing"`, `hwZones`, `bankZones` |
| Scenery | `js/circuits/scenery/paul_ricard.js` | Draped Blue/Red runoff, pit mirror, aerodrome, landmarks |
| Landmarks | `tests/data/landmarks/paul_ricard.json` | Eight required `modelGroup` ids |
| Lighting | `js/lighting/presets.js` | `paul_ricard|<tod>|<wx>` |

## Capture set (36 frames)

| Bucket | Count |
|--------|------:|
| Sector anchor (Verrerie, day dry) | 1 |
| Five hero views × six weathers @ day | 30 |
| Extra TOD on pit (dawn/dusk/night) + chicane (dusk/night) | 5 |

Hero views: pit straight, Mistral chicane, aerodrome, Signes, Le Village. Weathers: dry, wet, rain, overcast, fog, storm.

## Sector panel

| Verrerie T1 |
|:---:|
| ![verrerie](../../../artifacts/shots/tracks/paul_ricard/s1-verrerie-day-dry.jpg) |
| verrerie · day · dry |

## Hero weather — pit straight (day)

| dry | wet | rain |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-day-dry.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-day-wet.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-day-rain.jpg) |
| pit straight · day · dry | pit straight · day · wet | pit straight · day · rain |

| overcast | fog | storm |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-day-overcast.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-day-fog.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-day-storm.jpg) |
| pit straight · day · overcast | pit straight · day · fog | pit straight · day · storm |

## Hero weather — Mistral chicane (day)

| dry | wet | rain |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-day-dry.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-day-wet.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-day-rain.jpg) |
| mistral chicane · day · dry | mistral chicane · day · wet | mistral chicane · day · rain |

| overcast | fog | storm |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-day-overcast.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-day-fog.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-day-storm.jpg) |
| mistral chicane · day · overcast | mistral chicane · day · fog | mistral chicane · day · storm |

## Hero weather — aerodrome (day)

| dry | wet | rain |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s2-aerodrome-wide-day-dry.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-aerodrome-wide-day-wet.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-aerodrome-wide-day-rain.jpg) |
| aerodrome wide · day · dry | aerodrome wide · day · wet | aerodrome wide · day · rain |

| overcast | fog | storm |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s2-aerodrome-wide-day-overcast.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-aerodrome-wide-day-fog.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-aerodrome-wide-day-storm.jpg) |
| aerodrome wide · day · overcast | aerodrome wide · day · fog | aerodrome wide · day · storm |

## Hero weather — Signes (day)

| dry | wet | rain |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s3-signes-day-dry.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s3-signes-day-wet.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s3-signes-day-rain.jpg) |
| signes · day · dry | signes · day · wet | signes · day · rain |

| overcast | fog | storm |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s3-signes-day-overcast.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s3-signes-day-fog.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s3-signes-day-storm.jpg) |
| signes · day · overcast | signes · day · fog | signes · day · storm |

## Hero weather — Le Village (day)

| dry | wet | rain |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s3-le-village-day-dry.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s3-le-village-day-wet.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s3-le-village-day-rain.jpg) |
| le village · day · dry | le village · day · wet | le village · day · rain |

| overcast | fog | storm |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s3-le-village-day-overcast.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s3-le-village-day-fog.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s3-le-village-day-storm.jpg) |
| le village · day · overcast | le village · day · fog | le village · day · storm |

## Time of day panels (dry)

### Pit straight

| day | dusk | night |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-day-dry.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-night-dry.jpg) |
| pit straight · day · dry | pit straight · dusk · dry | pit straight · night · dry |

| dawn | | |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-dawn-dry.jpg) | | |
| pit straight · dawn · dry | | |

### Mistral chicane

| day | dusk | night |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-day-dry.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-night-dry.jpg) |
| mistral chicane · day · dry | mistral chicane · dusk · dry | mistral chicane · night · dry |

## Weather / lighting notes

| Issue | Frames | Notes |
|-------|--------|--------|
| Runoff shimmer | chicane/signes day dry/wet | Less after runoff abut fix; SwiftShader still shows crawl |
| Night exposure | pit/chicane night dry | `night: false` on def — plateau reads very dark |
| Fog / storm | aerodrome, pit | Sky/fog tint matches presets; apron contrast drops in fog |
| Wet sheen | all heroes day wet | Road darker; runoff hue still readable |

## Scenery fixes (this PR)

Runoff `along` abut; shorter chicane bleacher brace; motorhome gap 70 m; airfield marker `terrainYAt`.
=======
| Circuit def | `js/circuits/paul_ricard.js` | OSM centreline, `reverse: true`, `sceneryCoordinates: "racing"`, `hwZones`, `bankZones`, palette, `dressingExclusions` |
| Scenery | `js/circuits/scenery/paul_ricard.js` | Draped Blue/Red runoff, mirrored pit straight, aerodrome landmarks, Provençal dressing |
| Registry | `js/track/circuit-meta.js`, `tools/manifest.cjs` | Metadata; build via `TrackDefs` + lazy `TrackScenery` |
| Landmarks | `tests/data/landmarks/paul_ricard.json` | Eight required `modelGroup` ids |
| Lighting keys | `js/lighting/presets.js` | `paul_ricard|<tod>|<wx>` for dawn/day/dusk/night × dry/wet/rain/overcast/fog |

**Convention debt:** `groundPatch(k, side, …)` negates `side` on this reversed circuit because `transformSceneryApi` still remaps `sceneryCoordinates: "racing"` like `source` for ranges (fleet fix tracked separately; do not patch `tracks.js` from this PR).

## Theme and models

Provençal plateau: continuous blue/red draped runoff, flat pit slab (right/paddock), 4,400-seat main stand (left), Le Castellet aerodrome (apron, hangars, tower, light aircraft), Beausset GA hill, cabanon + drywall, scenic horizon turbines. `def.night: false` — night TOD is supported in menus/presets but there is **no circuit lamp pass**; expect a dark plateau with limited track lighting at night.

## Capture plan (32 frames)

| Bucket | Count | TOD / weather |
|--------|------:|----------------|
| Sector coverage | 20 | `day` + `dry` (implicit) |
| Key-view lighting | 12 | 4 landmarks × `dawn` / `dusk` / `night` (still dry) |
| **Deferred** | — | `rain`, `wet`, `overcast`, `fog` on key views — needs shared `shot.mjs` weather batch + retries (follow-up after tooling PR rebase) |

Tooling: `node tools/shot/shot.mjs --batch scratch/paul-ricard-day-batch.json` (day batch) plus existing day-dry sector set; `--tod` only (no `wx` until shared runner lands).

---

## Panel grids — by sector (`day` / `dry`)

Paths are repo-relative under `../../../artifacts/shots/tracks/paul_ricard/`.

### Sector 1 — pit straight & Verrerie (s ≈ 0–0.33)

| Pit straight | Main grandstand | Verrerie T1 |
|:---:|:---:|:---:|
| ![S1 pit](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-day-dry.jpg) | ![S1 stand](../../../artifacts/shots/tracks/paul_ricard/s1-grandstand-day-dry.jpg) | ![S1 Verrerie](../../../artifacts/shots/tracks/paul_ricard/s1-verrerie-day-dry.jpg) |
| `s1-pit-straight-day-dry` · 0.002 orbit | `s1-grandstand-day-dry` · 0.005 trackside | `s1-verrerie-day-dry` · 0.070 orbit |

| Verrerie exit (chase) | | |
|:---:|:---:|:---:|
| ![S1 chase](../../../artifacts/shots/tracks/paul_ricard/s1-verrerie-chase-day-dry.jpg) | | |
| `s1-verrerie-chase-day-dry` · 0.110 park | | |

### Sector 2 — Mistral, aerodrome (s ≈ 0.33–0.68)

| Camp hairpin | Mistral straight | Braking boards |
|:---:|:---:|:---:|
| ![S2 hairpin](../../../artifacts/shots/tracks/paul_ricard/s2-hairpin-camp-day-dry.jpg) | ![S2 Mistral](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-straight-day-dry.jpg) | ![S2 boards](../../../artifacts/shots/tracks/paul_ricard/s2-braking-chicane-day-dry.jpg) |
| `s2-hairpin-camp-day-dry` · 0.242 | `s2-mistral-straight-day-dry` · 0.420 | `s2-braking-chicane-day-dry` · 0.463 |

| Mistral chicane | Aerodrome wide | Hangars / apron |
|:---:|:---:|:---:|
| ![S2 chicane](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-day-dry.jpg) | ![S2 airfield](../../../artifacts/shots/tracks/paul_ricard/s2-aerodrome-wide-day-dry.jpg) | ![S2 hangars](../../../artifacts/shots/tracks/paul_ricard/s2-hangars-apron-day-dry.jpg) |
| `s2-mistral-chicane-day-dry` · 0.490 | `s2-aerodrome-wide-day-dry` · 0.500 | `s2-hangars-apron-day-dry` · 0.445 |

| Control tower | Light aircraft | Horizon turbines |
|:---:|:---:|:---:|
| ![S2 tower](../../../artifacts/shots/tracks/paul_ricard/s2-control-tower-day-dry.jpg) | ![S2 planes](../../../artifacts/shots/tracks/paul_ricard/s2-lightplanes-day-dry.jpg) | ![S2 turbines](../../../artifacts/shots/tracks/paul_ricard/s2-turbines-horizon-day-dry.jpg) |
| `s2-control-tower-day-dry` · 0.545 | `s2-lightplanes-day-dry` · 0.475 | `s2-turbines-horizon-day-dry` · 0.150 |

| Runoff detail (eye) | | |
|:---:|:---:|:---:|
| ![S2 runoff](../../../artifacts/shots/tracks/paul_ricard/s2-runoff-detail-day-dry.jpg) | | |
| `s2-runoff-detail-day-dry` · 0.500 eye | | |

### Sector 3 — Signes, Beausset, Village (s ≈ 0.68–1.0)

| Cabanon | Signes | Beausset hill |
|:---:|:---:|:---:|
| ![S3 cabanon](../../../artifacts/shots/tracks/paul_ricard/s3-cabanon-day-dry.jpg) | ![S3 Signes](../../../artifacts/shots/tracks/paul_ricard/s3-signes-day-dry.jpg) | ![S3 Beausset](../../../artifacts/shots/tracks/paul_ricard/s3-beausset-hill-day-dry.jpg) |
| `s3-cabanon-day-dry` · 0.235 | `s3-signes-day-dry` · 0.713 | `s3-beausset-hill-day-dry` · 0.745 |

| Le Village | Helipad | 2019 pit entry |
|:---:|:---:|:---:|
| ![S3 village](../../../artifacts/shots/tracks/paul_ricard/s3-le-village-day-dry.jpg) | ![S3 helipad](../../../artifacts/shots/tracks/paul_ricard/s3-helipad-day-dry.jpg) | ![S3 pit entry](../../../artifacts/shots/tracks/paul_ricard/s3-pit-entry-2019-day-dry.jpg) |
| `s3-le-village-day-dry` · 0.905 | `s3-helipad-day-dry` · 0.885 | `s3-pit-entry-2019-day-dry` · 0.940 |

---

## Panel grids — lighting variants (dry weather; 4 key views)

### Pit straight (`s1-pit-straight` · 0.002)

| Day | Dusk | Night |
|:---:|:---:|:---:|
| ![pit day](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-day-dry.jpg) | ![pit dusk](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-dusk-dry.jpg) | ![pit night](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-night-dry.jpg) |
| day | dusk | night |

| Dawn | | |
|:---:|:---:|:---:|
| ![pit dawn](../../../artifacts/shots/tracks/paul_ricard/s1-pit-straight-dawn-dry.jpg) | | |
| dawn | | |

**Lighting notes:** Dusk warms the plateau and pit fascia; **night** is very dark (`night: false` — no floodlight dress); pit garages read as silhouettes. No missing-sky mismatch observed; rain/fog not captured yet.

### Mistral chicane (`s2-mistral-chicane` · 0.490)

| Day | Dusk | Night |
|:---:|:---:|:---:|
| ![chicane day](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-day-dry.jpg) | ![chicane dusk](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-dusk-dry.jpg) | ![chicane night](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-night-dry.jpg) |
| day | dusk | night |

| Dawn | | |
|:---:|:---:|:---:|
| ![chicane dawn](../../../artifacts/shots/tracks/paul_ricard/s2-mistral-chicane-dawn-dry.jpg) | | |
| dawn | | |

**Lighting notes:** Runoff **z-fighting/shimmer** still visible at day/dusk on long painted bands; slightly reduced after overlap fix. Night: runoff colour lost in shadow; bleacher scaffold readable.

### Aerodrome (`s2-aerodrome-wide` · 0.500)

| Day | Dusk | Night |
|:---:|:---:|:---:|
| ![aero day](../../../artifacts/shots/tracks/paul_ricard/s2-aerodrome-wide-day-dry.jpg) | ![aero dusk](../../../artifacts/shots/tracks/paul_ricard/s2-aerodrome-wide-dusk-dry.jpg) | ![aero night](../../../artifacts/shots/tracks/paul_ricard/s2-aerodrome-wide-night-dry.jpg) |
| day | dusk | night |

| Dawn | | |
|:---:|:---:|:---:|
| ![aero dawn](../../../artifacts/shots/tracks/paul_ricard/s2-aerodrome-wide-dawn-dry.jpg) | | |
| dawn | | |

**Lighting notes:** Hangars/tower hold silhouette at dusk; night loses apron detail — acceptable until optional lamp dress.

### Signes (`s3-signes` · 0.713)

| Day | Dusk | Night |
|:---:|:---:|:---:|
| ![signes day](../../../artifacts/shots/tracks/paul_ricard/s3-signes-day-dry.jpg) | ![signes dusk](../../../artifacts/shots/tracks/paul_ricard/s3-signes-dusk-dry.jpg) | ![signes night](../../../artifacts/shots/tracks/paul_ricard/s3-signes-night-dry.jpg) |
| day | dusk | night |

| Dawn | | |
|:---:|:---:|:---:|
| ![signes dawn](../../../artifacts/shots/tracks/paul_ricard/s3-signes-dawn-dry.jpg) | | |
| dawn | | |

**Lighting notes:** Banking read strongest at day/dawn; dusk flare on outer runoff; night bleachers float as grey steps (expected without fill lights).

---

## Findings and backlog

### Fixed this PR (`js/circuits/scenery/paul_ricard.js` only)

| Fix | Rationale |
|-----|-----------|
| Remove 5% overlap on continuous runoff `along` segments | Less coplanar shimmer between drape stations |
| Shorten bleacher diagonal brace | Removed “ribbon” artifact at Mistral chicane |
| Motorhome gap 66 → 70 m | Paddock apron buried ≤0.02 m |
| `terrainYAt` on runway/taxiway centreline ticks | Taxiway markers no longer buried |

### Open (ranked)

1. **Weather matrix** — rain / wet / overcast / fog on 4–6 key views (blocked on shared shot batch + gitignore exception).
2. **Night readability** — `night: false` + no lamps; consider optional `lampPost` dress on pit straight only (low priority; not real circuit furniture).
3. **Runoff shimmer** — residual z-fight at day on Signes/Mistral; engine `drape` overlap policy or station step tune (careful with ground baseline).
4. **Engine `sceneryCoordinates: "racing"`** — remove hand `groundPatch` negation fleet-wide (not this PR).
5. **Pit hoarding panel gaps** — cosmetic meshing on engine pit wall vs `sponsorHoarding` panels.

### VM metrics (post-fix)

- `verify-track`: OK, surface folds **0**
- `audit-circuit`: float 0, clip 0, coplanar 0, props **191168** tris (baseline 190694, within ratchet), ground buried **1** / unsupported **4** / flatCoplanar **6** (within baseline)
>>>>>>> origin/cursor/paul-ricard-survey-decf

## Verification

```sh
node tools/track/verify-track.cjs paul_ricard
node tools/track/audit-circuit.cjs paul_ricard
```
