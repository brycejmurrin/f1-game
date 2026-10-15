# Baku City Circuit — survey (2026-10-14)

**Branch:** `cursor/baku-survey-e759` · **Live:** https://brycejmurrin.github.io/f1-game/  
**Theme:** `street_night` · **Shots:** 30 JPEGs in `artifacts/shots/tracks/baku/` (dry only; weather matrix deferred until shared survey tooling lands)

## Code map

| Layer | Path |
|--------|------|
| Def | `js/circuits/baku.js` |
| Scenery | `js/circuits/scenery/baku.js` |
| Brief | `docs/tracks/baku.md` |
| Landmarks | `tests/data/landmarks/baku.json` |

## Audits

```sh
node tools/track/verify-track.cjs baku
node tools/track/audit-circuit.cjs baku
```

Surface folds **0**; ground flatCoplanar **0** after palace portal tweak (within baseline caps). Weather batch (`wet` / `rain` / `overcast` / `fog`) not captured on this branch.

## Sector 1 — s≈0.00–0.30 (dry)

| | | |
|:---:|:---:|:---:|
| ![Start / Government House](../../../artifacts/shots/tracks/baku/s1-00-start-day-orbit.jpg)<br>**Start / Government House** · dry · day · orbit | ![Civic plaza](../../../artifacts/shots/tracks/baku/s1-01-plaza-day-orbit.jpg)<br>**Civic plaza** · dry · day · orbit | ![T2 squeeze](../../../artifacts/shots/tracks/baku/s1-02-t2-day-park.jpg)<br>**T2 left squeeze** · dry · day · park |
| ![Flame Towers](../../../artifacts/shots/tracks/baku/s1-03-flame-towers-day-orbit.jpg)<br>**Flame Towers** · dry · day · orbit | | |

## Sector 2 — s≈0.30–0.62 (dry)

| | | |
|:---:|:---:|:---:|
| ![Old City approach](../../../artifacts/shots/tracks/baku/s2-04-old-city-day-park.jpg)<br>**Old City approach** · dry · day · park | ![İçərişəhər wall](../../../artifacts/shots/tracks/baku/s2-05-icheri-wall-day-trackside.jpg)<br>**İçərişəhər wall** · dry · day · trackside | ![Castle squeeze](../../../artifacts/shots/tracks/baku/s2-06-castle-day-park.jpg)<br>**Castle squeeze** · dry · day · park |
| ![Castle gate](../../../artifacts/shots/tracks/baku/s2-07-castle-gate-day-eye.jpg)<br>**Castle gate towers** · dry · day · eye | ![Shirvanshah Palace](../../../artifacts/shots/tracks/baku/s2-08-palace-day-orbit.jpg)<br>**Shirvanshah Palace** · dry · day · orbit | ![Maiden Tower](../../../artifacts/shots/tracks/baku/s2-09-maiden-tower-day-orbit.jpg)<br>**Maiden Tower** · dry · day · orbit |

## Sector 3 — s≈0.62–1.00 (dry)

| | | |
|:---:|:---:|:---:|
| ![Seafront opens](../../../artifacts/shots/tracks/baku/s3-10-seafront-day-park.jpg)<br>**Seafront opens** · dry · day · park | ![Mid straight](../../../artifacts/shots/tracks/baku/s3-11-straight-mid-day-park.jpg)<br>**Neftchilar mid-straight** · dry · day · park | ![Glass canyon](../../../artifacts/shots/tracks/baku/s3-12-glass-canyon-day-orbit.jpg)<br>**Glass canyon (R)** · dry · day · orbit |
| ![Finish bridge](../../../artifacts/shots/tracks/baku/s3-13-finish-bridge-day-orbit.jpg)<br>**Finish pedestrian bridge** · dry · day · orbit | ![T1 braking](../../../artifacts/shots/tracks/baku/s3-14-t1-braking-day-park.jpg)<br>**T1 braking zone** · dry · day · park | |

## Lighting — Start / finish (s≈0.02)

| | | |
|:---:|:---:|:---:|
| ![day](../../../artifacts/shots/tracks/baku/s1-00-start-day-orbit.jpg)<br>**Start** · dry · **day** | ![dusk](../../../artifacts/shots/tracks/baku/lt-start-dusk-orbit.jpg)<br>**Start** · dry · **dusk** | ![night](../../../artifacts/shots/tracks/baku/lt-start-night-orbit.jpg)<br>**Start** · dry · **night** |

## Lighting — Flame Towers (s≈0.22)

| | | |
|:---:|:---:|:---:|
| ![day](../../../artifacts/shots/tracks/baku/s1-03-flame-towers-day-orbit.jpg)<br>**Flame Towers** · dry · **day** | ![dusk](../../../artifacts/shots/tracks/baku/lt-flame-dusk-orbit.jpg)<br>**Flame Towers** · dry · **dusk** | ![night](../../../artifacts/shots/tracks/baku/lt-flame-night-orbit.jpg)<br>**Flame Towers** · dry · **night** |
| ![dawn](../../../artifacts/shots/tracks/baku/lt-flame-dawn-orbit.jpg)<br>**Flame Towers** · dry · **dawn** | | |

## Lighting — Castle squeeze (s≈0.44)

| | | |
|:---:|:---:|:---:|
| ![day](../../../artifacts/shots/tracks/baku/s2-06-castle-day-park.jpg)<br>**Castle squeeze** · dry · **day** | ![dusk](../../../artifacts/shots/tracks/baku/lt-castle-dusk-park.jpg)<br>**Castle squeeze** · dry · **dusk** | ![night](../../../artifacts/shots/tracks/baku/lt-castle-night-park.jpg)<br>**Castle squeeze** · dry · **night** |
| ![dawn](../../../artifacts/shots/tracks/baku/lt-castle-dawn-park.jpg)<br>**Castle squeeze** · dry · **dawn** | | |

## Lighting — Maiden Tower (s≈0.52)

| | | |
|:---:|:---:|:---:|
| ![day](../../../artifacts/shots/tracks/baku/s2-09-maiden-tower-day-orbit.jpg)<br>**Maiden Tower** · dry · **day** | ![dusk](../../../artifacts/shots/tracks/baku/lt-maiden-dusk-orbit.jpg)<br>**Maiden Tower** · dry · **dusk** | ![night](../../../artifacts/shots/tracks/baku/lt-maiden-night-orbit.jpg)<br>**Maiden Tower** · dry · **night** |

## Lighting — Neftchilar straight (s≈0.72)

| | | |
|:---:|:---:|:---:|
| ![day](../../../artifacts/shots/tracks/baku/s3-11-straight-mid-day-park.jpg)<br>**Mid straight** · dry · **day** | ![dusk](../../../artifacts/shots/tracks/baku/lt-straight-dusk-park.jpg)<br>**Mid straight** · dry · **dusk** | ![night](../../../artifacts/shots/tracks/baku/lt-straight-night-park.jpg)<br>**Mid straight** · dry · **night** |
| ![dawn](../../../artifacts/shots/tracks/baku/lt-straight-dawn-park.jpg)<br>**Mid straight** · dry · **dawn** (orbit framing; park timed out in capture) | | |

## Lighting — Seafront accents (dusk)

| | | |
|:---:|:---:|:---:|
| ![Glass canyon dusk](../../../artifacts/shots/tracks/baku/lt-glass-dusk-orbit.jpg)<br>**Glass canyon** · dry · **dusk** · orbit | ![Finish bridge dusk](../../../artifacts/shots/tracks/baku/lt-bridge-dusk-orbit.jpg)<br>**Finish bridge** · dry · **dusk** · orbit | |

## Backlog (ranked)

| Pri | Issue | Lighting / weather notes |
|-----|--------|-------------------------|
| P1 | Government House clip severe @ s≈0.01 | Worse in **day** (flat ambient) |
| P2 | Castle plinth 1.2 m clips @ s≈0.36–0.40 | Neutral |
| P3 | Baku Eye `ferrisWheel` 2.2 m unsupported over water | Silhouette OK at **night** |
| P4 | `night: true` brief vs real GP daylight | **day** shots look like noon, not sun |
| P5 | Weather matrix not shot | Blocked until shared `shot.mjs` `--wx` batch |
| P6 | **Night** capture flakes | `awaitSoftPresent` timeout on some park/dawn frames — retried |

## Scenery fixes on branch

- Shirvanshah palace portal proud + hall width → flatCoplanar cleared.  
- Government House courtyard wash uses `terrainYAt`.
