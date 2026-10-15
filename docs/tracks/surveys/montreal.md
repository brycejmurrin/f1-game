# Montreal (Circuit Gilles Villeneuve) — scenery survey

**Date:** 2026-10-14  
**Branch:** `cursor/montreal-survey-6a71`  
**Live:** [Circuit on GitHub Pages](https://brycejmurrin.github.io/f1-game/)  
**Shots:** 36 JPEG frames in [`artifacts/shots/tracks/montreal/`](../../../artifacts/shots/tracks/montreal/) (`<id>__<tod>__<weather>.jpg`, 1280px, q≈80, ≤300 KB). Captured with `node tools/shot/shot.mjs --batch --jpeg --present-timeout 90 --capture-retries 4 --wait 120`.

## Code map

| Layer | Path | Role |
|-------|------|------|
| Circuit def | `js/circuits/montreal.js` | OSM centreline, `flatTerrain`, sectors/turns, dressing exclusions |
| Scenery | `js/circuits/scenery/montreal.js` | Island park dressing, required landmarks, circuit kit |
| Brief | `docs/tracks/montreal.md` | Theme, palette, landmark table |
| Landmarks | `tests/data/landmarks/montreal.json` | Required `modelGroup` ids |
| Gate | `tests/specs/montreal-foundation.spec.js` | Build, water/props, footbridge foundations |

**Sectors (racing lap fraction):** S1 ends s≈0.277, S2 ends s≈0.607, S3 to s=1.

## Theme and models

Green island-park theme; teal Olympic Basin; required casino, biosphere, hairpin stands, Wall of Champions stand, Calder, Habitat 67, casino footbridge.

## Screenshot panels by sector (36 frames)

### Sector S1

| | | |
|---|---|---|
| ![Olympic Basin approach](../../../artifacts/shots/tracks/montreal/s1-basin__day__dry.jpg)<br>**Olympic Basin approach** · day · dry | ![Senna S (trackside)](../../../artifacts/shots/tracks/montreal/s1-senna__day__dry.jpg)<br>**Senna S (trackside)** · day · dry | ![Start/finish (park)](../../../artifacts/shots/tracks/montreal/s1-sf__dawn__dry.jpg)<br>**Start/finish (park)** · dawn · dry |
| ![Start/finish (park)](../../../artifacts/shots/tracks/montreal/s1-sf__day__dry.jpg)<br>**Start/finish (park)** · day · dry | ![Start/finish (park)](../../../artifacts/shots/tracks/montreal/s1-sf__day__rain.jpg)<br>**Start/finish (park)** · day · rain | ![Start/finish (park)](../../../artifacts/shots/tracks/montreal/s1-sf__day__wet.jpg)<br>**Start/finish (park)** · day · wet |
| ![Start/finish (park)](../../../artifacts/shots/tracks/montreal/s1-sf__dusk__dry.jpg)<br>**Start/finish (park)** · dusk · dry | ![Start/finish (park)](../../../artifacts/shots/tracks/montreal/s1-sf__night__dry.jpg)<br>**Start/finish (park)** · night · dry |  |

### Sector S2

| | | |
|---|---|---|
| ![Basin shore band](../../../artifacts/shots/tracks/montreal/s2-basin-shore__day__dry.jpg)<br>**Basin shore band** · day · dry | ![Biosphère (far bank)](../../../artifacts/shots/tracks/montreal/s2-biosphere__day__dry.jpg)<br>**Biosphère (far bank)** · day · dry | ![Calder Trois disques](../../../artifacts/shots/tracks/montreal/s2-calder__day__dry.jpg)<br>**Calder Trois disques** · day · dry |
| ![Casino de Montréal](../../../artifacts/shots/tracks/montreal/s2-casino__day__dry.jpg)<br>**Casino de Montréal** · day · dry | ![Casino de Montréal](../../../artifacts/shots/tracks/montreal/s2-casino__day__fog.jpg)<br>**Casino de Montréal** · day · fog | ![Casino de Montréal](../../../artifacts/shots/tracks/montreal/s2-casino__day__overcast.jpg)<br>**Casino de Montréal** · day · overcast |
| ![Casino de Montréal](../../../artifacts/shots/tracks/montreal/s2-casino__dusk__dry.jpg)<br>**Casino de Montréal** · dusk · dry | ![Casino straight + basin](../../../artifacts/shots/tracks/montreal/s2-casino-straight__day__dry.jpg)<br>**Casino straight + basin** · day · dry | ![La Ronde ferris wheel](../../../artifacts/shots/tracks/montreal/s2-ferris__day__dry.jpg)<br>**La Ronde ferris wheel** · day · dry |
| ![Floralies parterres](../../../artifacts/shots/tracks/montreal/s2-floralies__day__dry.jpg)<br>**Floralies parterres** · day · dry | ![Casino footbridge](../../../artifacts/shots/tracks/montreal/s2-footbridge__day__dry.jpg)<br>**Casino footbridge** · day · dry | ![Casino footbridge](../../../artifacts/shots/tracks/montreal/s2-footbridge__dusk__dry.jpg)<br>**Casino footbridge** · dusk · dry |
| ![Habitat 67](../../../artifacts/shots/tracks/montreal/s2-habitat__day__dry.jpg)<br>**Habitat 67** · day · dry | ![L'Épingle hairpin](../../../artifacts/shots/tracks/montreal/s2-hairpin__day__dry.jpg)<br>**L'Épingle hairpin** · day · dry | ![L'Épingle hairpin](../../../artifacts/shots/tracks/montreal/s2-hairpin__day__storm.jpg)<br>**L'Épingle hairpin** · day · storm |
| ![L'Épingle hairpin](../../../artifacts/shots/tracks/montreal/s2-hairpin__day__wet.jpg)<br>**L'Épingle hairpin** · day · wet | ![L'Épingle hairpin](../../../artifacts/shots/tracks/montreal/s2-hairpin__night__dry.jpg)<br>**L'Épingle hairpin** · night · dry | ![Downtown skyline](../../../artifacts/shots/tracks/montreal/s2-skyline__day__dry.jpg)<br>**Downtown skyline** · day · dry |

### Sector S3

| | | |
|---|---|---|
| ![Back straight](../../../artifacts/shots/tracks/montreal/s3-backstraight__day__dry.jpg)<br>**Back straight** · day · dry | ![Final chicane](../../../artifacts/shots/tracks/montreal/s3-final-chicane__day__dry.jpg)<br>**Final chicane** · day · dry | ![Pit entry / kit complex](../../../artifacts/shots/tracks/montreal/s3-pit-entry__day__dry.jpg)<br>**Pit entry / kit complex** · day · dry |
| ![Wall of Champions](../../../artifacts/shots/tracks/montreal/s3-woc__day__dry.jpg)<br>**Wall of Champions** · day · dry | ![Wall of Champions](../../../artifacts/shots/tracks/montreal/s3-woc__day__rain.jpg)<br>**Wall of Champions** · day · rain | ![Wall of Champions](../../../artifacts/shots/tracks/montreal/s3-woc__night__dry.jpg)<br>**Wall of Champions** · night · dry |

### Lap context

| | | |
|---|---|---|
| ![Jean-Doré lagoon](../../../artifacts/shots/tracks/montreal/ctx-lagoon__day__dry.jpg)<br>**Jean-Doré lagoon** · day · dry | ![Mid-lap orbit](../../../artifacts/shots/tracks/montreal/ctx-orbit-mid__day__dry.jpg)<br>**Mid-lap orbit** · day · dry | ![Mid-lap orbit](../../../artifacts/shots/tracks/montreal/ctx-orbit-mid__day__overcast.jpg)<br>**Mid-lap orbit** · day · overcast |
| ![Mid-lap orbit](../../../artifacts/shots/tracks/montreal/ctx-orbit-mid__dusk__dry.jpg)<br>**Mid-lap orbit** · dusk · dry |  |  |

### Weather variants (hero views)

| | | |
|---|---|---|
| ![Mid-lap orbit](../../../artifacts/shots/tracks/montreal/ctx-orbit-mid__day__overcast.jpg)<br>**Mid-lap orbit** · day · overcast | ![Start/finish (park)](../../../artifacts/shots/tracks/montreal/s1-sf__day__rain.jpg)<br>**Start/finish (park)** · day · rain | ![Start/finish (park)](../../../artifacts/shots/tracks/montreal/s1-sf__day__wet.jpg)<br>**Start/finish (park)** · day · wet |
| ![Casino de Montréal](../../../artifacts/shots/tracks/montreal/s2-casino__day__fog.jpg)<br>**Casino de Montréal** · day · fog | ![Casino de Montréal](../../../artifacts/shots/tracks/montreal/s2-casino__day__overcast.jpg)<br>**Casino de Montréal** · day · overcast | ![L'Épingle hairpin](../../../artifacts/shots/tracks/montreal/s2-hairpin__day__storm.jpg)<br>**L'Épingle hairpin** · day · storm |
| ![L'Épingle hairpin](../../../artifacts/shots/tracks/montreal/s2-hairpin__day__wet.jpg)<br>**L'Épingle hairpin** · day · wet | ![Wall of Champions](../../../artifacts/shots/tracks/montreal/s3-woc__day__rain.jpg)<br>**Wall of Champions** · day · rain |  |

### Time-of-day variants (dry)

| | | |
|---|---|---|
| ![Mid-lap orbit](../../../artifacts/shots/tracks/montreal/ctx-orbit-mid__dusk__dry.jpg)<br>**Mid-lap orbit** · dusk · dry | ![Start/finish (park)](../../../artifacts/shots/tracks/montreal/s1-sf__dawn__dry.jpg)<br>**Start/finish (park)** · dawn · dry | ![Start/finish (park)](../../../artifacts/shots/tracks/montreal/s1-sf__dusk__dry.jpg)<br>**Start/finish (park)** · dusk · dry |
| ![Start/finish (park)](../../../artifacts/shots/tracks/montreal/s1-sf__night__dry.jpg)<br>**Start/finish (park)** · night · dry | ![Casino de Montréal](../../../artifacts/shots/tracks/montreal/s2-casino__dusk__dry.jpg)<br>**Casino de Montréal** · dusk · dry | ![Casino footbridge](../../../artifacts/shots/tracks/montreal/s2-footbridge__dusk__dry.jpg)<br>**Casino footbridge** · dusk · dry |
| ![L'Épingle hairpin](../../../artifacts/shots/tracks/montreal/s2-hairpin__night__dry.jpg)<br>**L'Épingle hairpin** · night · dry | ![Wall of Champions](../../../artifacts/shots/tracks/montreal/s3-woc__night__dry.jpg)<br>**Wall of Champions** · night · dry |  |

## Findings (summary)

- **Track:** `verify-track` OK — 0 surface folds; gentle elevation bumps only.
- **Strengths:** Basin teal + park read; hairpin grandstands + La Ronde ferris; far-bank skyline stack (biosphere, Habitat, Cartier truss, downtown).
- **Casino:** Correct dry placement but often tree-occluded from the track.
- **WoC:** Trackside views favour the concrete wall over GS 16 / Québec panel.
- **Night / dusk:** Time-of-day shifts sky and exposure; `furniture.lamp: "none"` — no circuit floodlight masts, so night reads dim on verges (lighting-tuner backlog).
- **Weather:** Hero views include wet, rain, overcast, fog, and storm (day); wet tarmac and sky read correctly on SF, casino, hairpin, WoC, orbit.

### Audits (after scenery fixes)

| Check | Result |
|-------|--------|
| float | 0 unsupported |
| ground | buried 2 (within baseline) |
| clip / coplanar | at baseline |

## Fixes in this PR

1. Floralies parterres — `groundUnder()` per pad for gravel/edging.
2. Far-bank slabs — `BANK_LIFT` 0.12 m.
3. Hedge gap +0.6 m to clear marshal post at s≈0.47.

## Backlog (not in PR)

| P | Item |
|---|------|
| P1 | Thin basin-side trees s 0.24–0.32 for casino sight-line |
| P1 | Better default framing for WoC / GS 16 landmark |
| P2 | Extra weather combos (e.g. dusk·rain) if marketing needs them |
| P2 | Night floodlight dress (`furniture.lamp` vs exclusions) |

## Verify

```sh
node tools/track/verify-track.cjs montreal
node tools/track/audit-circuit.cjs montreal
npm test -- tests/specs/montreal-foundation.spec.js
```

