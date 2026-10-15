# Albert Park — scenery survey (2026-10-14)

Circuit id `albert_park`. Scope: `js/circuits/albert_park.js`, `js/circuits/scenery/albert_park.js` only.

**Capture note:** 25 frames committed as JPEG under `artifacts/shots/tracks/albert_park/` (dry weather, `day` / `dawn` / `dusk` / `night` on four anchor views). **Wet / rain / overcast / fog** batches wait on shared shot tooling ([tools PR](https://github.com/brycejmurrin/f1-game/pulls)) — follow-up rebase will add those panels.

## Code map

| Layer | Path |
|-------|------|
| Def | `js/circuits/albert_park.js` — OSM centreline, `flatTerrain`, `pit: { side: 1 }`, bank zones, `pal` |
| Scenery | `js/circuits/scenery/albert_park.js` — lake, CBD towers, MSAC, Piastri stand, grandstands, kerbs |
| Landmarks | `tests/data/landmarks/albert_park.json` |
| Brief | `docs/tracks/albert_park.md` |

## Audit (post-fix)

| Check | Result |
|-------|--------|
| `verify-track` | OK, 0 surface folds |
| float | 0 |
| ground buried | 1 (jersey post foot in shared `structures.js`, intentional sink) |
| clip severe | 1 @ ~0.784 (at baseline cap) |
| coplanar | 0 |

## Fixes applied

1. Greener `pal.runoff` (less sandy park verge).
2. Boathouse launch ramp +0.06 m on `a.u` (buried props 3 → 1).

## Weather / lighting backlog

| Issue | Seen in | Severity |
|-------|---------|----------|
| Hand-placed lamp masts are geometry only — no `lampPost()` / flood emit | `night` panels | Medium — park reads dark; engine kit lamps may still gate on build `NIGHT` |
| Chicane grandstand internal overlap | `day` chicane orbit | Low — at clip baseline |
| Lake/CBD needs oblique orbit to read; cockpit/trackside miss water | sector panels | Doc/camera, not geometry |
| **Deferred:** wet/rain/overcast/fog survey | — | Blocked on shared `shot.mjs` weather batch |

---

## Track picker

| | | |
|:---:|:---:|:---:|
| ![Track picker — Albert Park card](../../../artifacts/shots/tracks/albert_park/picker-track-card.jpg)<br>**View:** picker · **Wx:** dry · **TOD:** day | | |

---

## Sector tour — dry · day

| | | |
|:---:|:---:|:---:|
| ![S/F orbit](../../../artifacts/shots/tracks/albert_park/s00-sf__day-dry.jpg)<br>**S/F** · orbit · dry · day | ![Piastri trackside](../../../artifacts/shots/tracks/albert_park/s00-sf-ts__day-dry.jpg)<br>**S/F** · trackside · dry · day | ![T1–2](../../../artifacts/shots/tracks/albert_park/s01-t1__day-dry.jpg)<br>**T1–2** · orbit · dry · day |
| ![T3 Hill](../../../artifacts/shots/tracks/albert_park/s02-t3__day-dry.jpg)<br>**T3** · orbit · dry · day | ![MSAC](../../../artifacts/shots/tracks/albert_park/s03-msac__day-dry.jpg)<br>**MSAC** · orbit · dry · day | ![East park](../../../artifacts/shots/tracks/albert_park/s04-east__day-dry.jpg)<br>**East** · orbit · dry · day |
| ![Mid lap](../../../artifacts/shots/tracks/albert_park/s05-mid__day-dry.jpg)<br>**Mid** · cinematic · dry · day | ![Lakeside entry](../../../artifacts/shots/tracks/albert_park/s06-lake-in__day-dry.jpg)<br>**Lakeside in** · orbit · dry · day | ![Lake + CBD](../../../artifacts/shots/tracks/albert_park/s07-lake-cbd__day-dry.jpg)<br>**Lake/CBD** · orbit · dry · day |
| ![Ricciardo](../../../artifacts/shots/tracks/albert_park/s08-ricciardo__day-dry.jpg)<br>**Ricciardo** · trackside · dry · day | ![Lakeside Stadium](../../../artifacts/shots/tracks/albert_park/s09-stadium__day-dry.jpg)<br>**Stadium** · orbit · dry · day | ![Golf fairways](../../../artifacts/shots/tracks/albert_park/s10-golf__day-dry.jpg)<br>**Golf** · orbit · dry · day |
| ![Chicane](../../../artifacts/shots/tracks/albert_park/s11-chicane__day-dry.jpg)<br>**Chicane** · orbit · dry · day | ![Fan hill](../../../artifacts/shots/tracks/albert_park/s12-fanhill__day-dry.jpg)<br>**Fan hill** · orbit · dry · day | ![Pit lake side](../../../artifacts/shots/tracks/albert_park/s13-pitlake__day-dry.jpg)<br>**Pit lake** · orbit · dry · day |

---

## Lighting — S/F anchor (dry)

| | | |
|:---:|:---:|:---:|
| ![S/F day](../../../artifacts/shots/tracks/albert_park/s00-sf__day-dry.jpg)<br>**S/F** · dry · **day** | ![S/F dawn](../../../artifacts/shots/tracks/albert_park/s00-sf__dawn-dry.jpg)<br>**S/F** · dry · **dawn** | ![S/F dusk](../../../artifacts/shots/tracks/albert_park/s00-sf__dusk-dry.jpg)<br>**S/F** · dry · **dusk** |
| ![S/F night](../../../artifacts/shots/tracks/albert_park/s00-sf__night-dry.jpg)<br>**S/F** · dry · **night** | | |

---

## Lighting — Lake / CBD anchor (dry)

| | | |
|:---:|:---:|:---:|
| ![Lake day](../../../artifacts/shots/tracks/albert_park/s07-lake-cbd__day-dry.jpg)<br>**Lake/CBD** · dry · **day** | ![Lake dawn](../../../artifacts/shots/tracks/albert_park/s07-lake-cbd__dawn-dry.jpg)<br>**Lake/CBD** · dry · **dawn** | ![Lake dusk](../../../artifacts/shots/tracks/albert_park/s07-lake-cbd__dusk-dry.jpg)<br>**Lake/CBD** · dry · **dusk** |
| ![Lake night](../../../artifacts/shots/tracks/albert_park/s07-lake-cbd__night-dry.jpg)<br>**Lake/CBD** · dry · **night** | | |

---

## Lighting — Chicane anchor (dry)

| | | |
|:---:|:---:|:---:|
| ![Chicane day](../../../artifacts/shots/tracks/albert_park/s11-chicane__day-dry.jpg)<br>**Chicane** · dry · **day** | ![Chicane dawn](../../../artifacts/shots/tracks/albert_park/s11-chicane__dawn-dry.jpg)<br>**Chicane** · dry · **dawn** | ![Chicane dusk](../../../artifacts/shots/tracks/albert_park/s11-chicane__dusk-dry.jpg)<br>**Chicane** · dry · **dusk** |
| ![Chicane night](../../../artifacts/shots/tracks/albert_park/s11-chicane__night-dry.jpg)<br>**Chicane** · dry · **night** | | |

---

## Verify

```sh
node tools/track/verify-track.cjs albert_park
node tools/track/audit-circuit.cjs albert_park --checks verify,ground,float
```
