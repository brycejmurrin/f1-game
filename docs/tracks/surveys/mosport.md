# Mosport — circuit survey (2026-10-15)

**Branch:** `cursor/mosport-survey-021b` · **Brief:** [`docs/tracks/mosport.md`](../mosport.md)

**Shots:** `artifacts/shots/tracks/mosport/` — **36 JPEGs** (picker + 35 captures), q≈80, max width 1280px. Captured with shared `shot.mjs` (`--weather`, `--tod`, `--jpeg`, `--present-timeout 90`, `--capture-retries 4`).

---

## Code map

| Layer | Path |
|--------|------|
| Def | `js/circuits/mosport.js` |
| Scenery | `js/circuits/scenery/mosport.js` |
| Landmarks | `tests/data/landmarks/mosport.json` |

Sectors (clockwise): S1 `s < 0.334` · S2 `0.334–0.666` · S3 `s ≥ 0.666`

---

## Findings

| Issue | Notes |
|--------|--------|
| Night / `lamp: "none"` | Night TOD is very dark; no trackside floods |
| Fog / storm | Readability drops in Esses woods — expected |
| Start/finish trackside | Prefer orbit; grandstands pushed to gap 30/28 |
| flatCoplanar 1 | Fleet tyreWall baseline — not loosened |

**Verify:** `node tools/track/verify-track.cjs mosport` · `node tools/track/audit-circuit.cjs mosport`

---

## Panel grid — lap survey (dry · day)

| | | |
|:---:|:---:|:---:|
| ![picker](../../../artifacts/shots/tracks/mosport/00-track-picker-still.jpg)<br>picker still · dry · day | ![lap pit](../../../artifacts/shots/tracks/mosport/lap-pit-orbit-dry-day.jpg)<br>pit orbit · dry · day | ![lap clayton](../../../artifacts/shots/tracks/mosport/lap-clayton-park-dry-day.jpg)<br>Clayton park · dry · day |
| ![lap moss](../../../artifacts/shots/tracks/mosport/lap-moss-orbit-dry-day.jpg)<br>Moss orbit · dry · day | ![lap andretti](../../../artifacts/shots/tracks/mosport/lap-andretti-park-dry-day.jpg)<br>Andretti park · dry · day | ![lap esses](../../../artifacts/shots/tracks/mosport/lap-esses-park-dry-day.jpg)<br>Esses park · dry · day |
| ![lap whites](../../../artifacts/shots/tracks/mosport/lap-whites-orbit-dry-day.jpg)<br>Whites orbit · dry · day | | |

---

## Panel grid — Pit orbit (hero)

| | | |
|:---:|:---:|:---:|
| ![wet](../../../artifacts/shots/tracks/mosport/pit-orbit-wet-day.jpg)<br>pit orbit · **wet** · day | ![rain](../../../artifacts/shots/tracks/mosport/pit-orbit-rain-day.jpg)<br>pit orbit · **rain** · day | ![overcast](../../../artifacts/shots/tracks/mosport/pit-orbit-overcast-day.jpg)<br>pit orbit · **overcast** · day |
| ![fog](../../../artifacts/shots/tracks/mosport/pit-orbit-fog-day.jpg)<br>pit orbit · **fog** · day | ![storm](../../../artifacts/shots/tracks/mosport/pit-orbit-storm-day.jpg)<br>pit orbit · **storm** · day | ![dusk](../../../artifacts/shots/tracks/mosport/pit-orbit-dry-dusk.jpg)<br>pit orbit · dry · **dusk** |
| ![night](../../../artifacts/shots/tracks/mosport/pit-orbit-dry-night.jpg)<br>pit orbit · dry · **night** | | |

---

## Panel grid — Clayton park (hero)

| | | |
|:---:|:---:|:---:|
| ![wet](../../../artifacts/shots/tracks/mosport/clayton-park-wet-day.jpg)<br>Clayton park · **wet** · day | ![rain](../../../artifacts/shots/tracks/mosport/clayton-park-rain-day.jpg)<br>Clayton park · **rain** · day | ![overcast](../../../artifacts/shots/tracks/mosport/clayton-park-overcast-day.jpg)<br>Clayton park · **overcast** · day |
| ![fog](../../../artifacts/shots/tracks/mosport/clayton-park-fog-day.jpg)<br>Clayton park · **fog** · day | ![storm](../../../artifacts/shots/tracks/mosport/clayton-park-storm-day.jpg)<br>Clayton park · **storm** · day | ![dawn](../../../artifacts/shots/tracks/mosport/clayton-park-dry-dawn.jpg)<br>Clayton park · dry · **dawn** |

---

## Panel grid — Moss orbit (hero)

| | | |
|:---:|:---:|:---:|
| ![wet](../../../artifacts/shots/tracks/mosport/moss-orbit-wet-day.jpg)<br>Moss orbit · **wet** · day | ![rain](../../../artifacts/shots/tracks/mosport/moss-orbit-rain-day.jpg)<br>Moss orbit · **rain** · day | ![overcast](../../../artifacts/shots/tracks/mosport/moss-orbit-overcast-day.jpg)<br>Moss orbit · **overcast** · day |
| ![fog](../../../artifacts/shots/tracks/mosport/moss-orbit-fog-day.jpg)<br>Moss orbit · **fog** · day | ![storm](../../../artifacts/shots/tracks/mosport/moss-orbit-storm-day.jpg)<br>Moss orbit · **storm** · day | |

---

## Panel grid — Andretti park (hero)

| | | |
|:---:|:---:|:---:|
| ![wet](../../../artifacts/shots/tracks/mosport/andretti-park-wet-day.jpg)<br>Andretti park · **wet** · day | ![rain](../../../artifacts/shots/tracks/mosport/andretti-park-rain-day.jpg)<br>Andretti park · **rain** · day | ![overcast](../../../artifacts/shots/tracks/mosport/andretti-park-overcast-day.jpg)<br>Andretti park · **overcast** · day |
| ![fog](../../../artifacts/shots/tracks/mosport/andretti-park-fog-day.jpg)<br>Andretti park · **fog** · day | ![storm](../../../artifacts/shots/tracks/mosport/andretti-park-storm-day.jpg)<br>Andretti park · **storm** · day | |

---

## Panel grid — Whites orbit (hero)

| | | |
|:---:|:---:|:---:|
| ![wet](../../../artifacts/shots/tracks/mosport/whites-orbit-wet-day.jpg)<br>Whites orbit · **wet** · day | ![rain](../../../artifacts/shots/tracks/mosport/whites-orbit-rain-day.jpg)<br>Whites orbit · **rain** · day | ![overcast](../../../artifacts/shots/tracks/mosport/whites-orbit-overcast-day.jpg)<br>Whites orbit · **overcast** · day |
| ![fog](../../../artifacts/shots/tracks/mosport/whites-orbit-fog-day.jpg)<br>Whites orbit · **fog** · day | ![storm](../../../artifacts/shots/tracks/mosport/whites-orbit-storm-day.jpg)<br>Whites orbit · **storm** · day | ![night](../../../artifacts/shots/tracks/mosport/whites-orbit-dry-night.jpg)<br>Whites orbit · dry · **night** |
