# Montreal (Circuit Gilles Villeneuve) — scenery survey

**Date:** 2026-10-14  
**Branch:** `cursor/montreal-survey-6a71`  
**Live:** [Circuit on GitHub Pages](https://brycejmurrin.github.io/f1-game/)  
**Shots:** 36 JPEG frames in [`artifacts/shots/tracks/montreal/`](../../../artifacts/shots/tracks/montreal/) (1280px wide, q≈80, ≤300 KB each). Captured headless TLX via `node tools/shot/shot.mjs --batch`.

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

## Screenshot panels by sector

### Sector S1

| | | |
|---|---|---|
| ![Olympic Basin approach](../../../artifacts/shots/tracks/montreal/s1-basin__day.jpg)<br>**Olympic Basin approach** · day · dry | ![Start gantry](../../../artifacts/shots/tracks/montreal/s1-gantry__day.jpg)<br>**Start gantry** · day · dry | ![Senna S (trackside)](../../../artifacts/shots/tracks/montreal/s1-senna__day.jpg)<br>**Senna S (trackside)** · day · dry |
| ![Start/finish (park)](../../../artifacts/shots/tracks/montreal/s1-sf__dawn.jpg)<br>**Start/finish (park)** · dawn · dry | ![Start/finish (park)](../../../artifacts/shots/tracks/montreal/s1-sf__day.jpg)<br>**Start/finish (park)** · day · dry | ![Start/finish (park)](../../../artifacts/shots/tracks/montreal/s1-sf__dusk.jpg)<br>**Start/finish (park)** · dusk · dry |
| ![Start/finish (park)](../../../artifacts/shots/tracks/montreal/s1-sf__night.jpg)<br>**Start/finish (park)** · night · dry |  |  |

### Sector S2

| | | |
|---|---|---|
| ![Basin shore band](../../../artifacts/shots/tracks/montreal/s2-basin-shore__day.jpg)<br>**Basin shore band** · day · dry | ![Biosphère (far bank)](../../../artifacts/shots/tracks/montreal/s2-biosphere__day.jpg)<br>**Biosphère (far bank)** · day · dry | ![Calder Trois disques](../../../artifacts/shots/tracks/montreal/s2-calder__day.jpg)<br>**Calder Trois disques** · day · dry |
| ![Casino de Montréal](../../../artifacts/shots/tracks/montreal/s2-casino__dawn.jpg)<br>**Casino de Montréal** · dawn · dry | ![Casino de Montréal](../../../artifacts/shots/tracks/montreal/s2-casino__day.jpg)<br>**Casino de Montréal** · day · dry | ![Casino de Montréal](../../../artifacts/shots/tracks/montreal/s2-casino__dusk.jpg)<br>**Casino de Montréal** · dusk · dry |
| ![Casino plaza cue](../../../artifacts/shots/tracks/montreal/s2-casino-plaza__day.jpg)<br>**Casino plaza cue** · day · dry | ![Casino straight + basin](../../../artifacts/shots/tracks/montreal/s2-casino-straight__day.jpg)<br>**Casino straight + basin** · day · dry | ![La Ronde ferris wheel](../../../artifacts/shots/tracks/montreal/s2-ferris__day.jpg)<br>**La Ronde ferris wheel** · day · dry |
| ![Floralies parterres](../../../artifacts/shots/tracks/montreal/s2-floralies__day.jpg)<br>**Floralies parterres** · day · dry | ![Casino footbridge](../../../artifacts/shots/tracks/montreal/s2-footbridge__day.jpg)<br>**Casino footbridge** · day · dry | ![Casino footbridge](../../../artifacts/shots/tracks/montreal/s2-footbridge__dusk.jpg)<br>**Casino footbridge** · dusk · dry |
| ![Habitat 67](../../../artifacts/shots/tracks/montreal/s2-habitat__day.jpg)<br>**Habitat 67** · day · dry | ![L'Épingle hairpin](../../../artifacts/shots/tracks/montreal/s2-hairpin__day.jpg)<br>**L'Épingle hairpin** · day · dry | ![L'Épingle hairpin](../../../artifacts/shots/tracks/montreal/s2-hairpin__dusk.jpg)<br>**L'Épingle hairpin** · dusk · dry |
| ![L'Épingle hairpin](../../../artifacts/shots/tracks/montreal/s2-hairpin__night.jpg)<br>**L'Épingle hairpin** · night · dry | ![Downtown skyline / Cartier truss](../../../artifacts/shots/tracks/montreal/s2-skyline__day.jpg)<br>**Downtown skyline / Cartier truss** · day · dry | ![Hairpin tyre walls](../../../artifacts/shots/tracks/montreal/s2-tyre-hairpin__day.jpg)<br>**Hairpin tyre walls** · day · dry |

### Sector S3

| | | |
|---|---|---|
| ![Back straight](../../../artifacts/shots/tracks/montreal/s3-backstraight__day.jpg)<br>**Back straight** · day · dry | ![Final chicane](../../../artifacts/shots/tracks/montreal/s3-final-chicane__day.jpg)<br>**Final chicane** · day · dry | ![Pit entry / kit complex](../../../artifacts/shots/tracks/montreal/s3-pit-entry__day.jpg)<br>**Pit entry / kit complex** · day · dry |
| ![Wall of Champions](../../../artifacts/shots/tracks/montreal/s3-woc__day.jpg)<br>**Wall of Champions** · day · dry | ![Wall of Champions](../../../artifacts/shots/tracks/montreal/s3-woc__dusk.jpg)<br>**Wall of Champions** · dusk · dry | ![Wall of Champions](../../../artifacts/shots/tracks/montreal/s3-woc__night.jpg)<br>**Wall of Champions** · night · dry |
| ![Wood deck stand (s≈0.74)](../../../artifacts/shots/tracks/montreal/s3-wood-stand__day.jpg)<br>**Wood deck stand (s≈0.74)** · day · dry |  |  |

### Lap context

| | | |
|---|---|---|
| ![Jean-Doré lagoon](../../../artifacts/shots/tracks/montreal/ctx-lagoon__day.jpg)<br>**Jean-Doré lagoon** · day · dry | ![Mid-lap orbit](../../../artifacts/shots/tracks/montreal/ctx-orbit-mid__day.jpg)<br>**Mid-lap orbit** · day · dry | ![Mid-lap orbit](../../../artifacts/shots/tracks/montreal/ctx-orbit-mid__dusk.jpg)<br>**Mid-lap orbit** · dusk · dry |
| ![Mid-lap orbit](../../../artifacts/shots/tracks/montreal/ctx-orbit-mid__night.jpg)<br>**Mid-lap orbit** · night · dry |  |  |

## Time-of-day variants (dry weather)

Six anchor views at dusk, dawn, and/or night. **Wet / rain / overcast / fog** frames wait for rebase onto the shared survey shot tooling PR.

| | | |
|---|---|---|
| ![Mid-lap orbit](../../../artifacts/shots/tracks/montreal/ctx-orbit-mid__dusk.jpg)<br>**Mid-lap orbit** · dusk · dry | ![Mid-lap orbit](../../../artifacts/shots/tracks/montreal/ctx-orbit-mid__night.jpg)<br>**Mid-lap orbit** · night · dry | ![Start/finish (park)](../../../artifacts/shots/tracks/montreal/s1-sf__dawn.jpg)<br>**Start/finish (park)** · dawn · dry |
| ![Start/finish (park)](../../../artifacts/shots/tracks/montreal/s1-sf__dusk.jpg)<br>**Start/finish (park)** · dusk · dry | ![Start/finish (park)](../../../artifacts/shots/tracks/montreal/s1-sf__night.jpg)<br>**Start/finish (park)** · night · dry | ![Casino de Montréal](../../../artifacts/shots/tracks/montreal/s2-casino__dawn.jpg)<br>**Casino de Montréal** · dawn · dry |
| ![Casino de Montréal](../../../artifacts/shots/tracks/montreal/s2-casino__dusk.jpg)<br>**Casino de Montréal** · dusk · dry | ![Casino footbridge](../../../artifacts/shots/tracks/montreal/s2-footbridge__dusk.jpg)<br>**Casino footbridge** · dusk · dry | ![L'Épingle hairpin](../../../artifacts/shots/tracks/montreal/s2-hairpin__dusk.jpg)<br>**L'Épingle hairpin** · dusk · dry |
| ![L'Épingle hairpin](../../../artifacts/shots/tracks/montreal/s2-hairpin__night.jpg)<br>**L'Épingle hairpin** · night · dry | ![Wall of Champions](../../../artifacts/shots/tracks/montreal/s3-woc__dusk.jpg)<br>**Wall of Champions** · dusk · dry | ![Wall of Champions](../../../artifacts/shots/tracks/montreal/s3-woc__night.jpg)<br>**Wall of Champions** · night · dry |

## Findings (summary)

- **Track:** `verify-track` OK — 0 surface folds; gentle elevation bumps only.
- **Strengths:** Basin teal + park read; hairpin grandstands + La Ronde ferris; far-bank skyline stack (biosphere, Habitat, Cartier truss, downtown).
- **Casino:** Correct dry placement but often tree-occluded from the track.
- **WoC:** Trackside views favour the concrete wall over GS 16 / Québec panel.
- **Night / dusk:** Time-of-day shifts sky and exposure; `furniture.lamp: "none"` — no circuit floodlight masts, so night reads dim on verges (lighting-tuner backlog).
- **Weather:** This pass is **dry only**; wet/rain/overcast/fog batch capture blocked until shared tooling PR lands.

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
| P2 | Weather matrix (wet/rain/fog) after tooling rebase |
| P2 | Night floodlight dress (`furniture.lamp` vs exclusions) |

## Verify

```sh
node tools/track/verify-track.cjs montreal
node tools/track/audit-circuit.cjs montreal
npm test -- tests/specs/montreal-foundation.spec.js
```

