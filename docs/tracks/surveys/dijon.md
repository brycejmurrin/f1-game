# Dijon-Prenois (`dijon`) — circuit survey (2026-10-14)

**Brief:** `docs/tracks/dijon.md`  
**Scenery:** `js/circuits/scenery/dijon.js` · **Def:** `js/circuits/dijon.js`  
**Shots:** 32 JPEGs in `artifacts/shots/tracks/dijon/` (day · dry · midday; SwiftShader TLX headless)  
**Weather matrix:** deferred until rebase on shared survey `shot.mjs` tooling (`tod` + `wx` per batch job).

## Code map

| Layer | Path | Notes |
|--------|------|--------|
| Centreline + meta | `js/circuits/dijon.js` | OSM stitch, 3727 m, `theme: green`, `terrainOuter: 110` |
| Scenery | `js/circuits/scenery/dijon.js` | Landmarks + Burgundy patchwork; `farHill` horizons |
| Landmarks | `tests/data/landmarks/dijon.json` | pit garages, race control, Combe cut, Parabolique bank, Prenois ferme |

Sectors: **S1** `s < 0.329` · **S2** `0.329–0.612` · **S3** `> 0.612`.

---

## Sector 1 — pit straight through Pouas (day · dry)

| | | |
|:---:|:---:|:---:|
| ![pit orbit](../../../artifacts/shots/tracks/dijon/s1-pit-028-orbit.jpg) | ![pit trackside](../../../artifacts/shots/tracks/dijon/s1-pit-028-trackside.jpg) | ![main stand](../../../artifacts/shots/tracks/dijon/s1-stand-020-trackside.jpg) |
| orbit · day · dry — pit complex | trackside · day · dry — pit wall | trackside · day · dry — main grandstand |
| ![paddock](../../../artifacts/shots/tracks/dijon/s1-paddock-060-orbit.jpg) | ![straight](../../../artifacts/shots/tracks/dijon/s1-straight-110-orbit.jpg) | ![spectator hill](../../../artifacts/shots/tracks/dijon/s1-hill-160-orbit.jpg) |
| orbit · day · dry — paddock apron | orbit · day · dry — outfield straight | orbit · day · dry — spectator hill |
| ![Pouas](../../../artifacts/shots/tracks/dijon/s1-pouas-215-trackside.jpg) | ![S1 cinematic](../../../artifacts/shots/tracks/dijon/s1-sector1-250-cinematic.jpg) | ![pit detail](../../../artifacts/shots/tracks/dijon/extra-pitcomplex-050-orbit.jpg) |
| trackside · day · dry — Courbe de Pouas | cinematic · day · dry — sector 1 | orbit · day · dry — pit garages infield |
| ![Pouas approach](../../../artifacts/shots/tracks/dijon/extra-pouas-approach-190-orbit.jpg) | | |
| orbit · day · dry — approach to Pouas | | |

---

## Sector 2 — Combe through esses (day · dry)

| | | |
|:---:|:---:|:---:|
| ![Combe orbit](../../../artifacts/shots/tracks/dijon/s2-combe-308-orbit.jpg) | ![Combe eye](../../../artifacts/shots/tracks/dijon/s2-combe-308-eye.jpg) | ![Combe trackside](../../../artifacts/shots/tracks/dijon/extra-combe-300-trackside.jpg) |
| orbit · day · dry — `dijon-combe-cut` | eye · day · dry — blind crest | trackside · day · dry — Combe inside |
| ![valley](../../../artifacts/shots/tracks/dijon/s2-valley-370-orbit.jpg) | ![valley wide](../../../artifacts/shots/tracks/dijon/extra-valley-365-orbit.jpg) | ![ferme](../../../artifacts/shots/tracks/dijon/s2-ferme-424-orbit.jpg) |
| orbit · day · dry — open valley | orbit · day · dry — valley patchwork | orbit · day · dry — `dijon-prenois-ferme` |
| ![Villeroy](../../../artifacts/shots/tracks/dijon/s2-villeroy-430-trackside.jpg) | ![Villeroy wide](../../../artifacts/shots/tracks/dijon/extra-villeroy-420-orbit.jpg) | ![S2 cinematic](../../../artifacts/shots/tracks/dijon/s2-sector2-470-cinematic.jpg) |
| trackside · day · dry — Double Droite | orbit · day · dry — Villeroy climb | cinematic · day · dry — sector 2 |
| ![esses orbit](../../../artifacts/shots/tracks/dijon/s2-esses-545-orbit.jpg) | ![esses trackside](../../../artifacts/shots/tracks/dijon/s2-esses-580-trackside.jpg) | ![Combe ridge](../../../artifacts/shots/tracks/dijon/extra-combe-ridge-330-orbit.jpg) |
| orbit · day · dry — esses spoil | trackside · day · dry — esses flick | orbit · day · dry — Combe ridge context |

---

## Sector 3 — Bretelle to line (day · dry)

| | | |
|:---:|:---:|:---:|
| ![Bretelle](../../../artifacts/shots/tracks/dijon/s3-bretelle-650-trackside.jpg) | ![Bretelle wide](../../../artifacts/shots/tracks/dijon/extra-bretelle-620-orbit.jpg) | ![Parabolique](../../../artifacts/shots/tracks/dijon/s3-parabolique-742-orbit.jpg) |
| trackside · day · dry — Bretelle | orbit · day · dry — extension rejoin | orbit · day · dry — `dijon-parabolique-bank` |
| ![Parabolique TS](../../../artifacts/shots/tracks/dijon/extra-parabolique-725-trackside.jpg) | ![infield](../../../artifacts/shots/tracks/dijon/s3-parabolique-760-park.jpg) | ![S3 cinematic](../../../artifacts/shots/tracks/dijon/s3-sector3-800-cinematic.jpg) |
| trackside · day · dry — Parabolique outside | park · day · dry — empty infield | cinematic · day · dry — sector 3 |
| ![exit](../../../artifacts/shots/tracks/dijon/s3-exit-885-orbit.jpg) | ![paddock gate](../../../artifacts/shots/tracks/dijon/extra-paddock-880-orbit.jpg) | ![approach](../../../artifacts/shots/tracks/dijon/s3-approach-955-trackside.jpg) |
| orbit · day · dry — pit straight exit | orbit · day · dry — paddock entrance | trackside · day · dry — second grandstand |
| ![midlap](../../../artifacts/shots/tracks/dijon/extra-midlap-500-orbit.jpg) | | |
| orbit · day · dry — whole-lap farmland read | | |

---

## Weather / lighting (planned — not in this commit)

After shared survey tooling: **5 hero views** × dusk dry, night dry, overcast, rain, fog, wet dusk. Watch **W1** (no local lamps, `night: false`), **W2** (Magny-Cours lighting donor).

## Findings backlog

| ID | Sev | Issue |
|----|-----|--------|
| D2 | Low | Grandstand crowd vs steps coplanar (engine) |
| D3 | Low | Lap-wide `hedgeRun` plane sharing |
| D4 | Low | Crop drape overlap (rape/wheat) |
| D5 | Low | Tree vs Villeroy timing box clip |
| D6 | Low | Esses procedural tree clumps |
| D7 | Info | `city.js` detail 0.05 m buried (shared) |

## Scenery fixes (this branch)

Hedge-tier dedupe, hillside tree thin, Villeroy tree offset, rapeseed gap — `js/circuits/scenery/dijon.js` only.

## Verify

```sh
node tools/track/verify-track.cjs dijon
node tools/track/audit-circuit.cjs dijon
```
