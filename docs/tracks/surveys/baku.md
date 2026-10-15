# Baku City Circuit — survey (2026-10-14)

**Branch:** `cursor/baku-survey-e759` (on shared shot tooling) · **Live:** https://brycejmurrin.github.io/f1-game/  
**Theme:** `street_night` · **Shots:** 36 JPEGs in `artifacts/shots/tracks/baku/`

## Audits

```sh
node tools/track/verify-track.cjs baku
node tools/track/audit-circuit.cjs baku
```

## Sector anchors (dry · day)

| | | |
|:---:|:---:|:---:|
| ![Start](../../../artifacts/shots/tracks/baku/sec-start-day-dry-orbit.jpg)<br>**Start / Government House** · dry · day · orbit | ![Flame Towers](../../../artifacts/shots/tracks/baku/sec-flame-day-dry-orbit.jpg)<br>**Flame Towers** · dry · day · orbit | ![Castle squeeze](../../../artifacts/shots/tracks/baku/sec-castle-day-dry-park.jpg)<br>**Castle squeeze** · dry · day · park |
| ![Maiden Tower](../../../artifacts/shots/tracks/baku/sec-maiden-day-dry-orbit.jpg)<br>**Maiden Tower** · dry · day · orbit | ![Mid straight](../../../artifacts/shots/tracks/baku/sec-straight-day-dry-park.jpg)<br>**Neftchilar mid-straight** · dry · day · park | ![T1 braking](../../../artifacts/shots/tracks/baku/sec-t1-day-dry-park.jpg)<br>**T1 braking** · dry · day · park |

## Weather — Start / Government House (day)

| | | |
|:---:|:---:|:---:|
| ![wet](../../../artifacts/shots/tracks/baku/wx-start-day-wet-orbit.jpg)<br>**Start** · **wet** · day · orbit | ![rain](../../../artifacts/shots/tracks/baku/wx-start-day-rain-orbit.jpg)<br>**Start** · **rain** · day · orbit | ![overcast](../../../artifacts/shots/tracks/baku/wx-start-day-overcast-orbit.jpg)<br>**Start** · **overcast** · day · orbit |
| ![fog](../../../artifacts/shots/tracks/baku/wx-start-day-fog-orbit.jpg)<br>**Start** · **fog** · day · orbit | ![storm](../../../artifacts/shots/tracks/baku/wx-start-day-storm-orbit.jpg)<br>**Start** · **storm** · day · orbit | |

## Weather — Flame Towers (day)

| | | |
|:---:|:---:|:---:|
| ![wet](../../../artifacts/shots/tracks/baku/wx-flame-day-wet-orbit.jpg)<br>**Flame Towers** · **wet** · day · orbit | ![rain](../../../artifacts/shots/tracks/baku/wx-flame-day-rain-orbit.jpg)<br>**Flame Towers** · **rain** · day · orbit | ![overcast](../../../artifacts/shots/tracks/baku/wx-flame-day-overcast-orbit.jpg)<br>**Flame Towers** · **overcast** · day · orbit |
| ![fog](../../../artifacts/shots/tracks/baku/wx-flame-day-fog-orbit.jpg)<br>**Flame Towers** · **fog** · day · orbit | ![storm](../../../artifacts/shots/tracks/baku/wx-flame-day-storm-orbit.jpg)<br>**Flame Towers** · **storm** · day · orbit | |

## Weather — Castle squeeze (day)

| | | |
|:---:|:---:|:---:|
| ![wet](../../../artifacts/shots/tracks/baku/wx-castle-day-wet-park.jpg)<br>**Castle squeeze** · **wet** · day · park | ![rain](../../../artifacts/shots/tracks/baku/wx-castle-day-rain-park.jpg)<br>**Castle squeeze** · **rain** · day · park | ![overcast](../../../artifacts/shots/tracks/baku/wx-castle-day-overcast-park.jpg)<br>**Castle squeeze** · **overcast** · day · park |
| ![fog](../../../artifacts/shots/tracks/baku/wx-castle-day-fog-park.jpg)<br>**Castle squeeze** · **fog** · day · park | ![storm](../../../artifacts/shots/tracks/baku/wx-castle-day-storm-park.jpg)<br>**Castle squeeze** · **storm** · day · park | |

## Weather — Neftchilar mid-straight (day)

| | | |
|:---:|:---:|:---:|
| ![wet](../../../artifacts/shots/tracks/baku/wx-straight-day-wet-park.jpg)<br>**Mid straight** · **wet** · day · park | ![rain](../../../artifacts/shots/tracks/baku/wx-straight-day-rain-park.jpg)<br>**Mid straight** · **rain** · day · park | ![overcast](../../../artifacts/shots/tracks/baku/wx-straight-day-overcast-park.jpg)<br>**Mid straight** · **overcast** · day · park |
| ![fog](../../../artifacts/shots/tracks/baku/wx-straight-day-fog-park.jpg)<br>**Mid straight** · **fog** · day · park | ![storm](../../../artifacts/shots/tracks/baku/wx-straight-day-storm-park.jpg)<br>**Mid straight** · **storm** · day · park | |

## Time of day — dry (hero views)

| | | |
|:---:|:---:|:---:|
| ![start dusk](../../../artifacts/shots/tracks/baku/lt-start-dusk-dry-orbit.jpg)<br>**Start** · dry · **dusk** · orbit | ![start night](../../../artifacts/shots/tracks/baku/lt-start-night-dry-orbit.jpg)<br>**Start** · dry · **night** · orbit | ![flame dusk](../../../artifacts/shots/tracks/baku/lt-flame-dusk-dry-orbit.jpg)<br>**Flame Towers** · dry · **dusk** · orbit |
| ![flame night](../../../artifacts/shots/tracks/baku/lt-flame-night-dry-orbit.jpg)<br>**Flame Towers** · dry · **night** · orbit | ![flame dawn](../../../artifacts/shots/tracks/baku/lt-flame-dawn-dry-orbit.jpg)<br>**Flame Towers** · dry · **dawn** · orbit | ![castle dusk](../../../artifacts/shots/tracks/baku/lt-castle-dusk-dry-park.jpg)<br>**Castle squeeze** · dry · **dusk** · park |
| ![castle night](../../../artifacts/shots/tracks/baku/lt-castle-night-dry-park.jpg)<br>**Castle squeeze** · dry · **night** · park | ![straight dusk](../../../artifacts/shots/tracks/baku/lt-straight-dusk-dry-park.jpg)<br>**Mid straight** · dry · **dusk** · park | ![straight night](../../../artifacts/shots/tracks/baku/lt-straight-night-dry-park.jpg)<br>**Mid straight** · dry · **night** · park |
| ![straight dawn](../../../artifacts/shots/tracks/baku/lt-straight-dawn-dry-park.jpg)<br>**Mid straight** · dry · **dawn** · park | | |

## Weather / lighting notes

| Issue | Where | Notes |
|--------|--------|--------|
| Wet sheen on tarmac | `wx-*-wet`, `wx-*-rain` | Readable on straight; castle walls stay matte |
| Fog / storm horizon | `wx-*-fog`, `wx-*-storm` | Caspian void collapses to flat grey; Flame LED bands still visible |
| Forced **day** on `street_night` | `sec-*-day` | Lamps/neon subdued vs **night** / **dusk** panels |

## Scenery fixes (branch)

- Shirvanshah palace portal proud + hall width → flatCoplanar 0 (within baseline).  
- Government House courtyard wash uses `terrainYAt`.

## Backlog

- Government House clip severe @ s≈0.01 · Baku Eye ferris unsupported over water · castle plinth clips.
