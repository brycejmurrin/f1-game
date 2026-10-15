# Monaco circuit survey — 2026-10-14 (updated)

**Circuit id:** `monaco` · **Theme:** `street_day` · **PR:** [monaco: survey + fixes](https://github.com/brycejmurrin/f1-game/pull/1887)

**36 committed survey JPEGs** under `artifacts/shots/tracks/monaco/` (`git add -f`). Captured with shared `shot.mjs` (`--jpeg --present-timeout 90 --capture-retries 4 --wait 120`), SwiftShader / TLX default.

**Code fix:** `terraceStack` pastel rotation (`hash(seedK)`) in `js/circuits/scenery/monaco.js`.

**Audit:** `node tools/track/audit-circuit.cjs monaco` — ok; `verify-track` OK.

---

## Sector coverage — dry · day · midday

| **Pit / start** · orbit · dry · day | **Casino Square** · orbit · dry · day | **Fairmont hairpin** · orbit · dry · day |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/monaco/s1-01-pit-start-day.jpg) | ![](../../../artifacts/shots/tracks/monaco/s1-04-casino-square-day.jpg) | ![](../../../artifacts/shots/tracks/monaco/s2-02-fairmont-hairpin-day.jpg) |

| **Tunnel exit** · orbit · dry · day | **Port Hercule** · orbit wide · dry · day | **Tabac** · orbit · dry · day |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/monaco/s2-05-tunnel-exit-day.jpg) | ![](../../../artifacts/shots/tracks/monaco/s3-01-harbour-wide-day.jpg) | ![](../../../artifacts/shots/tracks/monaco/s3-02-tabac-day.jpg) |

---

## Hero — Casino Square (frac 0.22 · orbit)

| **Casino** · orbit · overcast · day | **Casino** · orbit · rain · day | **Casino** · orbit · wet · day |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/monaco/hero-casino-day-overcast.jpg) | ![](../../../artifacts/shots/tracks/monaco/hero-casino-day-rain.jpg) | ![](../../../artifacts/shots/tracks/monaco/hero-casino-day-wet.jpg) |

| **Casino** · orbit · dry · dusk | **Casino** · orbit · dry · night | |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/monaco/hero-casino-dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/monaco/hero-casino-night-dry.jpg) | |

---

## Hero — Port Hercule (frac 0.65 · orbit wide)

| **Harbour** · orbit wide · overcast · day | **Harbour** · orbit wide · rain · day | **Harbour** · orbit wide · wet · day |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/monaco/hero-harbour-day-overcast.jpg) | ![](../../../artifacts/shots/tracks/monaco/hero-harbour-day-rain.jpg) | ![](../../../artifacts/shots/tracks/monaco/hero-harbour-day-wet.jpg) |

| **Harbour** · orbit wide · dry · dusk | **Harbour** · orbit wide · dry · night | |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/monaco/hero-harbour-dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/monaco/hero-harbour-night-dry.jpg) | |

---

## Hero — Tabac (frac 0.71 · orbit)

| **Tabac** · orbit · overcast · day | **Tabac** · orbit · rain · day | **Tabac** · orbit · wet · day |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/monaco/hero-tabac-day-overcast.jpg) | ![](../../../artifacts/shots/tracks/monaco/hero-tabac-day-rain.jpg) | ![](../../../artifacts/shots/tracks/monaco/hero-tabac-day-wet.jpg) |

| **Tabac** · orbit · dry · dusk | **Tabac** · orbit · dry · night | |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/monaco/hero-tabac-dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/monaco/hero-tabac-night-dry.jpg) | |

---

## Hero — Tunnel exit (frac 0.55 · orbit)

| **Tunnel exit** · orbit · overcast · day | **Tunnel exit** · orbit · rain · day | **Tunnel exit** · orbit · wet · day |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/monaco/hero-tunnel-exit-day-overcast.jpg) | ![](../../../artifacts/shots/tracks/monaco/hero-tunnel-exit-day-rain.jpg) | ![](../../../artifacts/shots/tracks/monaco/hero-tunnel-exit-day-wet.jpg) |

| **Tunnel exit** · orbit · dry · dusk | **Tunnel exit** · orbit · dry · night | |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/monaco/hero-tunnel-exit-dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/monaco/hero-tunnel-exit-night-dry.jpg) | |

---

## Hero — Fairmont hairpin (frac 0.38 · orbit)

| **Fairmont** · orbit · overcast · day | **Fairmont** · orbit · rain · day | **Fairmont** · orbit · wet · day |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/monaco/hero-fairmont-day-overcast.jpg) | ![](../../../artifacts/shots/tracks/monaco/hero-fairmont-day-rain.jpg) | ![](../../../artifacts/shots/tracks/monaco/hero-fairmont-day-wet.jpg) |

| **Fairmont** · orbit · dry · dusk | **Fairmont** · orbit · dry · night | |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/monaco/hero-fairmont-dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/monaco/hero-fairmont-night-dry.jpg) | |

---

## Hero — Nouvelle chicane (frac 0.64 · orbit)

| **Chicane** · orbit · overcast · day | **Chicane** · orbit · rain · day | **Chicane** · orbit · wet · day |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/monaco/hero-chicane-day-overcast.jpg) | ![](../../../artifacts/shots/tracks/monaco/hero-chicane-day-rain.jpg) | ![](../../../artifacts/shots/tracks/monaco/hero-chicane-day-wet.jpg) |

| **Chicane** · orbit · dry · dusk | **Chicane** · orbit · dry · night | |
|:---:|:---:|:---:|
| ![](../../../artifacts/shots/tracks/monaco/hero-chicane-dusk-dry.jpg) | ![](../../../artifacts/shots/tracks/monaco/hero-chicane-night-dry.jpg) | |

---

## Findings (summary)

| Topic | Severity | Notes |
|-------|----------|-------|
| Road / audit | — | 0 folds; float 0; clip/coplanar at baseline |
| `terraceStack` pastels | fixed | `hash(seedK)` per stack |
| Hillside blocks vs terrain shelf | medium | Casino orbit — amphitheatre shelf |
| Rain / wet | visual | Streaks read on harbour and Tabac; wet road darkening visible |
| Overcast / fog | visual | Overcast mutes sun; fog panel omitted from 36-cap set (re-add with storm on follow-up if needed) |
| Night | visual | WINLIT bands on hotels; quay lamps sparse |

## Ranked backlog

1. Seat terrace bases on `terrainYAt` (medium, scenery only)
2. Add fog + storm hero frames when raising shot cap (low)
3. Harbour water polygon vs more `waterField` stations (high, engine)
