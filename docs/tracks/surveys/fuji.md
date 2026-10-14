# Fuji Speedway — circuit survey (2026-10-14)

**Branch:** `cursor/fuji-survey-fixes-17d3` · **Brief:** `docs/tracks/fuji.md`  
**Shots:** `43` JPEGs in `artifacts/shots/tracks/fuji/` (committed with `git add -f`).

## Code map & findings

See earlier sections in git history; audits: `node tools/track/audit-circuit.cjs fuji`.

**Fix this PR:** Mount Fuji scenery distance **2.5 km** (`fuji-mount-fuji`). **R3:** `surface folds 0` — do not move `path.pts` without re-pinning cedar.

### Backlog (weather / lighting)

| ID | Finding |
|----|---------|
| F2 | Night unlit (`lamp: none`) |
| F3 | Fog stacks with `pal.fogDensity` |
| F9 | Re-capture weather on shared `shot.mjs` after fleet tooling PR (optional polish) |

---

## All frames (43) — 3 per row

| ![s01 pit straight orbit](../../../artifacts/shots/tracks/fuji/s01-pit-straight-orbit__wx-dry__tod-day.jpg) | ![s01 pit straight orbit](../../../artifacts/shots/tracks/fuji/s01-pit-straight-orbit__wx-dry__tod-dusk.jpg) | ![s01 pit straight orbit](../../../artifacts/shots/tracks/fuji/s01-pit-straight-orbit__wx-overcast__tod-day.jpg) |
| **s01 pit straight orbit** · wx=dry · tod=day | **s01 pit straight orbit** · wx=dry · tod=dusk | **s01 pit straight orbit** · wx=overcast · tod=day |
| ![s02 mount fuji west](../../../artifacts/shots/tracks/fuji/s02-mount-fuji-west__wx-dry__tod-dawn.jpg) | ![s02 mount fuji west](../../../artifacts/shots/tracks/fuji/s02-mount-fuji-west__wx-dry__tod-day.jpg) | ![s02 mount fuji west](../../../artifacts/shots/tracks/fuji/s02-mount-fuji-west__wx-dry__tod-dusk.jpg) |
| **s02 mount fuji west** · wx=dry · tod=dawn | **s02 mount fuji west** · wx=dry · tod=day | **s02 mount fuji west** · wx=dry · tod=dusk |
| ![s02 mount fuji west](../../../artifacts/shots/tracks/fuji/s02-mount-fuji-west__wx-dry__tod-night.jpg) | ![s02 mount fuji west](../../../artifacts/shots/tracks/fuji/s02-mount-fuji-west__wx-fog__tod-day.jpg) | ![s02 mount fuji west](../../../artifacts/shots/tracks/fuji/s02-mount-fuji-west__wx-overcast__tod-day.jpg) |
| **s02 mount fuji west** · wx=dry · tod=night | **s02 mount fuji west** · wx=fog · tod=day | **s02 mount fuji west** · wx=overcast · tod=day |
| ![s02 mount fuji west](../../../artifacts/shots/tracks/fuji/s02-mount-fuji-west__wx-rain__tod-day.jpg) | ![s02 mount fuji west](../../../artifacts/shots/tracks/fuji/s02-mount-fuji-west__wx-wet__tod-day.jpg) | ![s03 driver straight](../../../artifacts/shots/tracks/fuji/s03-driver-straight__wx-dry__tod-day.jpg) |
| **s02 mount fuji west** · wx=rain · tod=day | **s02 mount fuji west** · wx=wet · tod=day | **s03 driver straight** · wx=dry · tod=day |
| ![s03 driver straight](../../../artifacts/shots/tracks/fuji/s03-driver-straight__wx-dry__tod-dusk.jpg) | ![s03 driver straight](../../../artifacts/shots/tracks/fuji/s03-driver-straight__wx-dry__tod-night.jpg) | ![s03 driver straight](../../../artifacts/shots/tracks/fuji/s03-driver-straight__wx-rain__tod-day.jpg) |
| **s03 driver straight** · wx=dry · tod=dusk | **s03 driver straight** · wx=dry · tod=night | **s03 driver straight** · wx=rain · tod=day |
| ![s03 driver straight](../../../artifacts/shots/tracks/fuji/s03-driver-straight__wx-wet__tod-day.jpg) | ![s04 hotel paddock](../../../artifacts/shots/tracks/fuji/s04-hotel-paddock__wx-dry__tod-day.jpg) | ![s04 hotel paddock](../../../artifacts/shots/tracks/fuji/s04-hotel-paddock__wx-dry__tod-dusk.jpg) |
| **s03 driver straight** · wx=wet · tod=day | **s04 hotel paddock** · wx=dry · tod=day | **s04 hotel paddock** · wx=dry · tod=dusk |
| ![s04 hotel paddock](../../../artifacts/shots/tracks/fuji/s04-hotel-paddock__wx-overcast__tod-day.jpg) | ![s04 hotel paddock](../../../artifacts/shots/tracks/fuji/s04-hotel-paddock__wx-wet__tod-day.jpg) | ![s05 tgr turn1](../../../artifacts/shots/tracks/fuji/s05-tgr-turn1__wx-dry__tod-day.jpg) |
| **s04 hotel paddock** · wx=overcast · tod=day | **s04 hotel paddock** · wx=wet · tod=day | **s05 tgr turn1** · wx=dry · tod=day |
| ![s06 sector1 aerial](../../../artifacts/shots/tracks/fuji/s06-sector1-aerial__wx-dry__tod-day.jpg) | ![s07 coca cola](../../../artifacts/shots/tracks/fuji/s07-coca-cola__wx-dry__tod-day.jpg) | ![s08 toyopet forest](../../../artifacts/shots/tracks/fuji/s08-toyopet-forest__wx-dry__tod-day.jpg) |
| **s06 sector1 aerial** · wx=dry · tod=day | **s07 coca cola** · wx=dry · tod=day | **s08 toyopet forest** · wx=dry · tod=day |
| ![s09 advan](../../../artifacts/shots/tracks/fuji/s09-advan__wx-dry__tod-day.jpg) | ![s10 120r forest](../../../artifacts/shots/tracks/fuji/s10-120r-forest__wx-dry__tod-day.jpg) | ![s10 120r forest](../../../artifacts/shots/tracks/fuji/s10-120r-forest__wx-dry__tod-dusk.jpg) |
| **s09 advan** · wx=dry · tod=day | **s10 120r forest** · wx=dry · tod=day | **s10 120r forest** · wx=dry · tod=dusk |
| ![s10 120r forest](../../../artifacts/shots/tracks/fuji/s10-120r-forest__wx-fog__tod-day.jpg) | ![s10 120r forest](../../../artifacts/shots/tracks/fuji/s10-120r-forest__wx-wet__tod-day.jpg) | ![s11 sector2 aerial](../../../artifacts/shots/tracks/fuji/s11-sector2-aerial__wx-dry__tod-day.jpg) |
| **s10 120r forest** · wx=fog · tod=day | **s10 120r forest** · wx=wet · tod=day | **s11 sector2 aerial** · wx=dry · tod=day |
| ![s12 300r](../../../artifacts/shots/tracks/fuji/s12-300r__wx-dry__tod-day.jpg) | ![s12 300r](../../../artifacts/shots/tracks/fuji/s12-300r__wx-dry__tod-dusk.jpg) | ![s12 300r](../../../artifacts/shots/tracks/fuji/s12-300r__wx-dry__tod-night.jpg) |
| **s12 300r** · wx=dry · tod=day | **s12 300r** · wx=dry · tod=dusk | **s12 300r** · wx=dry · tod=night |
| ![s12 300r](../../../artifacts/shots/tracks/fuji/s12-300r__wx-fog__tod-day.jpg) | ![s12 300r](../../../artifacts/shots/tracks/fuji/s12-300r__wx-wet__tod-day.jpg) | ![s13 dunlop hairpin](../../../artifacts/shots/tracks/fuji/s13-dunlop-hairpin__wx-dry__tod-day.jpg) |
| **s12 300r** · wx=fog · tod=day | **s12 300r** · wx=wet · tod=day | **s13 dunlop hairpin** · wx=dry · tod=day |
| ![s13 dunlop hairpin](../../../artifacts/shots/tracks/fuji/s13-dunlop-hairpin__wx-dry__tod-night.jpg) | ![s13 dunlop hairpin](../../../artifacts/shots/tracks/fuji/s13-dunlop-hairpin__wx-rain__tod-day.jpg) | ![s13 dunlop hairpin](../../../artifacts/shots/tracks/fuji/s13-dunlop-hairpin__wx-wet__tod-day.jpg) |
| **s13 dunlop hairpin** · wx=dry · tod=night | **s13 dunlop hairpin** · wx=rain · tod=day | **s13 dunlop hairpin** · wx=wet · tod=day |
| ![s14 flick](../../../artifacts/shots/tracks/fuji/s14-flick__wx-dry__tod-day.jpg) | ![s15 panasonic](../../../artifacts/shots/tracks/fuji/s15-panasonic__wx-dry__tod-day.jpg) | ![s15 panasonic](../../../artifacts/shots/tracks/fuji/s15-panasonic__wx-dry__tod-night.jpg) |
| **s14 flick** · wx=dry · tod=day | **s15 panasonic** · wx=dry · tod=day | **s15 panasonic** · wx=dry · tod=night |
| ![s16 pit exit](../../../artifacts/shots/tracks/fuji/s16-pit-exit__wx-dry__tod-day.jpg) |  |  |
| **s16 pit exit** · wx=dry · tod=day |  |  |

---

## Sector 1 — day dry landmarks

| ![s01 pit straight orbit](../../../artifacts/shots/tracks/fuji/s01-pit-straight-orbit__wx-dry__tod-day.jpg) | ![s02 mount fuji west](../../../artifacts/shots/tracks/fuji/s02-mount-fuji-west__wx-dry__tod-day.jpg) | ![s03 driver straight](../../../artifacts/shots/tracks/fuji/s03-driver-straight__wx-dry__tod-day.jpg) |
| **s01 pit straight orbit** · wx=dry · tod=day | **s02 mount fuji west** · wx=dry · tod=day | **s03 driver straight** · wx=dry · tod=day |
| ![s04 hotel paddock](../../../artifacts/shots/tracks/fuji/s04-hotel-paddock__wx-dry__tod-day.jpg) | ![s05 tgr turn1](../../../artifacts/shots/tracks/fuji/s05-tgr-turn1__wx-dry__tod-day.jpg) | ![s06 sector1 aerial](../../../artifacts/shots/tracks/fuji/s06-sector1-aerial__wx-dry__tod-day.jpg) |
| **s04 hotel paddock** · wx=dry · tod=day | **s05 tgr turn1** · wx=dry · tod=day | **s06 sector1 aerial** · wx=dry · tod=day |

## Sector 2 — day dry

| ![s07 coca cola](../../../artifacts/shots/tracks/fuji/s07-coca-cola__wx-dry__tod-day.jpg) | ![s08 toyopet forest](../../../artifacts/shots/tracks/fuji/s08-toyopet-forest__wx-dry__tod-day.jpg) | ![s09 advan](../../../artifacts/shots/tracks/fuji/s09-advan__wx-dry__tod-day.jpg) |
| **s07 coca cola** · wx=dry · tod=day | **s08 toyopet forest** · wx=dry · tod=day | **s09 advan** · wx=dry · tod=day |
| ![s10 120r forest](../../../artifacts/shots/tracks/fuji/s10-120r-forest__wx-dry__tod-day.jpg) | ![s11 sector2 aerial](../../../artifacts/shots/tracks/fuji/s11-sector2-aerial__wx-dry__tod-day.jpg) | ![s12 300r](../../../artifacts/shots/tracks/fuji/s12-300r__wx-dry__tod-day.jpg) |
| **s10 120r forest** · wx=dry · tod=day | **s11 sector2 aerial** · wx=dry · tod=day | **s12 300r** · wx=dry · tod=day |

## Sector 3 — day dry

| ![s13 dunlop hairpin](../../../artifacts/shots/tracks/fuji/s13-dunlop-hairpin__wx-dry__tod-day.jpg) | ![s14 flick](../../../artifacts/shots/tracks/fuji/s14-flick__wx-dry__tod-day.jpg) | ![s15 panasonic](../../../artifacts/shots/tracks/fuji/s15-panasonic__wx-dry__tod-day.jpg) |
| **s13 dunlop hairpin** · wx=dry · tod=day | **s14 flick** · wx=dry · tod=day | **s15 panasonic** · wx=dry · tod=day |
| ![s16 pit exit](../../../artifacts/shots/tracks/fuji/s16-pit-exit__wx-dry__tod-day.jpg) |  |  |
| **s16 pit exit** · wx=dry · tod=day |  |  |

## Lighting variants (dry wx)

| ![s01 pit straight orbit](../../../artifacts/shots/tracks/fuji/s01-pit-straight-orbit__wx-dry__tod-dusk.jpg) | ![s02 mount fuji west](../../../artifacts/shots/tracks/fuji/s02-mount-fuji-west__wx-dry__tod-dawn.jpg) | ![s02 mount fuji west](../../../artifacts/shots/tracks/fuji/s02-mount-fuji-west__wx-dry__tod-dusk.jpg) |
| **s01 pit straight orbit** · wx=dry · tod=dusk | **s02 mount fuji west** · wx=dry · tod=dawn | **s02 mount fuji west** · wx=dry · tod=dusk |
| ![s02 mount fuji west](../../../artifacts/shots/tracks/fuji/s02-mount-fuji-west__wx-dry__tod-night.jpg) | ![s03 driver straight](../../../artifacts/shots/tracks/fuji/s03-driver-straight__wx-dry__tod-dusk.jpg) | ![s03 driver straight](../../../artifacts/shots/tracks/fuji/s03-driver-straight__wx-dry__tod-night.jpg) |
| **s02 mount fuji west** · wx=dry · tod=night | **s03 driver straight** · wx=dry · tod=dusk | **s03 driver straight** · wx=dry · tod=night |
| ![s04 hotel paddock](../../../artifacts/shots/tracks/fuji/s04-hotel-paddock__wx-dry__tod-dusk.jpg) | ![s10 120r forest](../../../artifacts/shots/tracks/fuji/s10-120r-forest__wx-dry__tod-dusk.jpg) | ![s12 300r](../../../artifacts/shots/tracks/fuji/s12-300r__wx-dry__tod-dusk.jpg) |
| **s04 hotel paddock** · wx=dry · tod=dusk | **s10 120r forest** · wx=dry · tod=dusk | **s12 300r** · wx=dry · tod=dusk |
| ![s12 300r](../../../artifacts/shots/tracks/fuji/s12-300r__wx-dry__tod-night.jpg) | ![s13 dunlop hairpin](../../../artifacts/shots/tracks/fuji/s13-dunlop-hairpin__wx-dry__tod-night.jpg) | ![s15 panasonic](../../../artifacts/shots/tracks/fuji/s15-panasonic__wx-dry__tod-night.jpg) |
| **s12 300r** · wx=dry · tod=night | **s13 dunlop hairpin** · wx=dry · tod=night | **s15 panasonic** · wx=dry · tod=night |

## Weather variants (day tod unless noted)

| ![s01 pit straight orbit](../../../artifacts/shots/tracks/fuji/s01-pit-straight-orbit__wx-dry__tod-dusk.jpg) | ![s01 pit straight orbit](../../../artifacts/shots/tracks/fuji/s01-pit-straight-orbit__wx-overcast__tod-day.jpg) | ![s02 mount fuji west](../../../artifacts/shots/tracks/fuji/s02-mount-fuji-west__wx-dry__tod-dawn.jpg) |
| **s01 pit straight orbit** · wx=dry · tod=dusk | **s01 pit straight orbit** · wx=overcast · tod=day | **s02 mount fuji west** · wx=dry · tod=dawn |
| ![s02 mount fuji west](../../../artifacts/shots/tracks/fuji/s02-mount-fuji-west__wx-dry__tod-dusk.jpg) | ![s02 mount fuji west](../../../artifacts/shots/tracks/fuji/s02-mount-fuji-west__wx-dry__tod-night.jpg) | ![s02 mount fuji west](../../../artifacts/shots/tracks/fuji/s02-mount-fuji-west__wx-fog__tod-day.jpg) |
| **s02 mount fuji west** · wx=dry · tod=dusk | **s02 mount fuji west** · wx=dry · tod=night | **s02 mount fuji west** · wx=fog · tod=day |
| ![s02 mount fuji west](../../../artifacts/shots/tracks/fuji/s02-mount-fuji-west__wx-overcast__tod-day.jpg) | ![s02 mount fuji west](../../../artifacts/shots/tracks/fuji/s02-mount-fuji-west__wx-rain__tod-day.jpg) | ![s02 mount fuji west](../../../artifacts/shots/tracks/fuji/s02-mount-fuji-west__wx-wet__tod-day.jpg) |
| **s02 mount fuji west** · wx=overcast · tod=day | **s02 mount fuji west** · wx=rain · tod=day | **s02 mount fuji west** · wx=wet · tod=day |
| ![s03 driver straight](../../../artifacts/shots/tracks/fuji/s03-driver-straight__wx-dry__tod-dusk.jpg) | ![s03 driver straight](../../../artifacts/shots/tracks/fuji/s03-driver-straight__wx-dry__tod-night.jpg) | ![s03 driver straight](../../../artifacts/shots/tracks/fuji/s03-driver-straight__wx-rain__tod-day.jpg) |
| **s03 driver straight** · wx=dry · tod=dusk | **s03 driver straight** · wx=dry · tod=night | **s03 driver straight** · wx=rain · tod=day |
| ![s03 driver straight](../../../artifacts/shots/tracks/fuji/s03-driver-straight__wx-wet__tod-day.jpg) | ![s04 hotel paddock](../../../artifacts/shots/tracks/fuji/s04-hotel-paddock__wx-dry__tod-dusk.jpg) | ![s04 hotel paddock](../../../artifacts/shots/tracks/fuji/s04-hotel-paddock__wx-overcast__tod-day.jpg) |
| **s03 driver straight** · wx=wet · tod=day | **s04 hotel paddock** · wx=dry · tod=dusk | **s04 hotel paddock** · wx=overcast · tod=day |
| ![s04 hotel paddock](../../../artifacts/shots/tracks/fuji/s04-hotel-paddock__wx-wet__tod-day.jpg) | ![s10 120r forest](../../../artifacts/shots/tracks/fuji/s10-120r-forest__wx-dry__tod-dusk.jpg) | ![s10 120r forest](../../../artifacts/shots/tracks/fuji/s10-120r-forest__wx-fog__tod-day.jpg) |
| **s04 hotel paddock** · wx=wet · tod=day | **s10 120r forest** · wx=dry · tod=dusk | **s10 120r forest** · wx=fog · tod=day |
| ![s10 120r forest](../../../artifacts/shots/tracks/fuji/s10-120r-forest__wx-wet__tod-day.jpg) | ![s12 300r](../../../artifacts/shots/tracks/fuji/s12-300r__wx-dry__tod-dusk.jpg) | ![s12 300r](../../../artifacts/shots/tracks/fuji/s12-300r__wx-dry__tod-night.jpg) |
| **s10 120r forest** · wx=wet · tod=day | **s12 300r** · wx=dry · tod=dusk | **s12 300r** · wx=dry · tod=night |
| ![s12 300r](../../../artifacts/shots/tracks/fuji/s12-300r__wx-fog__tod-day.jpg) | ![s12 300r](../../../artifacts/shots/tracks/fuji/s12-300r__wx-wet__tod-day.jpg) | ![s13 dunlop hairpin](../../../artifacts/shots/tracks/fuji/s13-dunlop-hairpin__wx-dry__tod-night.jpg) |
| **s12 300r** · wx=fog · tod=day | **s12 300r** · wx=wet · tod=day | **s13 dunlop hairpin** · wx=dry · tod=night |
| ![s13 dunlop hairpin](../../../artifacts/shots/tracks/fuji/s13-dunlop-hairpin__wx-rain__tod-day.jpg) | ![s13 dunlop hairpin](../../../artifacts/shots/tracks/fuji/s13-dunlop-hairpin__wx-wet__tod-day.jpg) | ![s15 panasonic](../../../artifacts/shots/tracks/fuji/s15-panasonic__wx-dry__tod-night.jpg) |
| **s13 dunlop hairpin** · wx=rain · tod=day | **s13 dunlop hairpin** · wx=wet · tod=day | **s15 panasonic** · wx=dry · tod=night |

---

## Verification

```text
node tools/track/verify-track.cjs fuji → surface folds 0
node tools/track/audit-circuit.cjs fuji → ok
```
