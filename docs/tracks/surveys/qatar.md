# Qatar (Lusail) — circuit survey

**Circuit id:** `qatar` · **Survey:** 2026-10-14 · **Brief:** [`docs/tracks/qatar.md`](../qatar.md)

## Code map

| Layer | Path | Role |
|--------|------|------|
| Def | `js/circuits/qatar.js` | OSM path, `night` + `desert`, `flatTerrain`, `bankZones`, `sceneryStartFrac: 0.8` |
| Scenery | `js/circuits/scenery/qatar.js` | Pit slab, Musco masts, kerbs, green/sand verge, Katara/Stadium, villas |
| Landmarks | `tests/data/landmarks/qatar.json` | Required hero `modelGroup` ids |

**Frames:** Pit straight / T1 use `sl(f)` (racing fraction); mid-lap tables use authored `s`.

## Capture

- **32 JPEGs** in `artifacts/shots/tracks/qatar/` (q≈80, ≤1280 px wide, `git add -f`).
- **Weather:** all **dry** (wet/overcast/fog batch deferred — shared tooling PR).
- **TOD:** `day` · `dawn` · `dusk` · `night` on six key views; extra day/night coverage on orbit, horizon, villas, kerb.

## All shots (32, 3 per row)

| | | |
|:---:|:---:|:---:|
| ![s1-kerb-t1](../../../artifacts/shots/tracks/qatar/s1-kerb-t1__night.jpg)<br>*kerb t1 · dry · night* | ![s1-lusail-hill](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__dawn.jpg)<br>*lusail hill · dry · dawn* | ![s1-lusail-hill](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__day.jpg)<br>*lusail hill · dry · day* |
| ![s1-lusail-hill](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__dusk.jpg)<br>*lusail hill · dry · dusk* | ![s1-lusail-hill](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__night.jpg)<br>*lusail hill · dry · night* | ![s1-pit-orbit](../../../artifacts/shots/tracks/qatar/s1-pit-orbit__day.jpg)<br>*pit orbit · dry · day* |
| ![s1-pit-orbit](../../../artifacts/shots/tracks/qatar/s1-pit-orbit__night.jpg)<br>*pit orbit · dry · night* | ![s1-pit-straight](../../../artifacts/shots/tracks/qatar/s1-pit-straight__dawn.jpg)<br>*pit straight · dry · dawn* | ![s1-pit-straight](../../../artifacts/shots/tracks/qatar/s1-pit-straight__day.jpg)<br>*pit straight · dry · day* |
| ![s1-pit-straight](../../../artifacts/shots/tracks/qatar/s1-pit-straight__dusk.jpg)<br>*pit straight · dry · dusk* | ![s1-pit-straight](../../../artifacts/shots/tracks/qatar/s1-pit-straight__night.jpg)<br>*pit straight · dry · night* | ![s1-t1-park](../../../artifacts/shots/tracks/qatar/s1-t1-park__dawn.jpg)<br>*t1 park · dry · dawn* |
| ![s1-t1-park](../../../artifacts/shots/tracks/qatar/s1-t1-park__day.jpg)<br>*t1 park · dry · day* | ![s1-t1-park](../../../artifacts/shots/tracks/qatar/s1-t1-park__dusk.jpg)<br>*t1 park · dry · dusk* | ![s1-t1-park](../../../artifacts/shots/tracks/qatar/s1-t1-park__night.jpg)<br>*t1 park · dry · night* |
| ![s1-t23](../../../artifacts/shots/tracks/qatar/s1-t23__dawn.jpg)<br>*t23 · dry · dawn* | ![s1-t23](../../../artifacts/shots/tracks/qatar/s1-t23__day.jpg)<br>*t23 · dry · day* | ![s1-t23](../../../artifacts/shots/tracks/qatar/s1-t23__dusk.jpg)<br>*t23 · dry · dusk* |
| ![s1-t23](../../../artifacts/shots/tracks/qatar/s1-t23__night.jpg)<br>*t23 · dry · night* | ![s2-horizon-landmarks](../../../artifacts/shots/tracks/qatar/s2-horizon-landmarks__day.jpg)<br>*horizon landmarks · dry · day* | ![s2-horizon-landmarks](../../../artifacts/shots/tracks/qatar/s2-horizon-landmarks__night.jpg)<br>*horizon landmarks · dry · night* |
| ![s2-mid-marshal](../../../artifacts/shots/tracks/qatar/s2-mid-marshal__day.jpg)<br>*mid marshal · dry · day* | ![s2-t456-sweep](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__dawn.jpg)<br>*t456 sweep · dry · dawn* | ![s2-t456-sweep](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__day.jpg)<br>*t456 sweep · dry · day* |
| ![s2-t456-sweep](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__dusk.jpg)<br>*t456 sweep · dry · dusk* | ![s2-t456-sweep](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__night.jpg)<br>*t456 sweep · dry · night* | ![s3-late-flood](../../../artifacts/shots/tracks/qatar/s3-late-flood__night.jpg)<br>*late flood · dry · night* |
| ![s3-t16-entry](../../../artifacts/shots/tracks/qatar/s3-t16-entry__dawn.jpg)<br>*t16 entry · dry · dawn* | ![s3-t16-entry](../../../artifacts/shots/tracks/qatar/s3-t16-entry__day.jpg)<br>*t16 entry · dry · day* | ![s3-t16-entry](../../../artifacts/shots/tracks/qatar/s3-t16-entry__dusk.jpg)<br>*t16 entry · dry · dusk* |
| ![s3-t16-entry](../../../artifacts/shots/tracks/qatar/s3-t16-entry__night.jpg)<br>*t16 entry · dry · night* | ![s3-villas](../../../artifacts/shots/tracks/qatar/s3-villas__day.jpg)<br>*villas · dry · day* |  |

## By sector

### Sector 1 — pit, T1, T2/T3

| | | |
|:---:|:---:|:---:|
| ![s1-kerb-t1](../../../artifacts/shots/tracks/qatar/s1-kerb-t1__night.jpg)<br>*kerb t1 · dry · night* | ![s1-lusail-hill](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__dawn.jpg)<br>*lusail hill · dry · dawn* | ![s1-lusail-hill](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__day.jpg)<br>*lusail hill · dry · day* |
| ![s1-lusail-hill](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__dusk.jpg)<br>*lusail hill · dry · dusk* | ![s1-lusail-hill](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__night.jpg)<br>*lusail hill · dry · night* | ![s1-pit-orbit](../../../artifacts/shots/tracks/qatar/s1-pit-orbit__day.jpg)<br>*pit orbit · dry · day* |
| ![s1-pit-orbit](../../../artifacts/shots/tracks/qatar/s1-pit-orbit__night.jpg)<br>*pit orbit · dry · night* | ![s1-pit-straight](../../../artifacts/shots/tracks/qatar/s1-pit-straight__dawn.jpg)<br>*pit straight · dry · dawn* | ![s1-pit-straight](../../../artifacts/shots/tracks/qatar/s1-pit-straight__day.jpg)<br>*pit straight · dry · day* |
| ![s1-pit-straight](../../../artifacts/shots/tracks/qatar/s1-pit-straight__dusk.jpg)<br>*pit straight · dry · dusk* | ![s1-pit-straight](../../../artifacts/shots/tracks/qatar/s1-pit-straight__night.jpg)<br>*pit straight · dry · night* | ![s1-t1-park](../../../artifacts/shots/tracks/qatar/s1-t1-park__dawn.jpg)<br>*t1 park · dry · dawn* |
| ![s1-t1-park](../../../artifacts/shots/tracks/qatar/s1-t1-park__day.jpg)<br>*t1 park · dry · day* | ![s1-t1-park](../../../artifacts/shots/tracks/qatar/s1-t1-park__dusk.jpg)<br>*t1 park · dry · dusk* | ![s1-t1-park](../../../artifacts/shots/tracks/qatar/s1-t1-park__night.jpg)<br>*t1 park · dry · night* |
| ![s1-t23](../../../artifacts/shots/tracks/qatar/s1-t23__dawn.jpg)<br>*t23 · dry · dawn* | ![s1-t23](../../../artifacts/shots/tracks/qatar/s1-t23__day.jpg)<br>*t23 · dry · day* | ![s1-t23](../../../artifacts/shots/tracks/qatar/s1-t23__dusk.jpg)<br>*t23 · dry · dusk* |
| ![s1-t23](../../../artifacts/shots/tracks/qatar/s1-t23__night.jpg)<br>*t23 · dry · night* |  |  |

### Sector 2 — mid-lap

| | | |
|:---:|:---:|:---:|
| ![s2-horizon-landmarks](../../../artifacts/shots/tracks/qatar/s2-horizon-landmarks__day.jpg)<br>*horizon landmarks · dry · day* | ![s2-horizon-landmarks](../../../artifacts/shots/tracks/qatar/s2-horizon-landmarks__night.jpg)<br>*horizon landmarks · dry · night* | ![s2-mid-marshal](../../../artifacts/shots/tracks/qatar/s2-mid-marshal__day.jpg)<br>*mid marshal · dry · day* |
| ![s2-t456-sweep](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__dawn.jpg)<br>*t456 sweep · dry · dawn* | ![s2-t456-sweep](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__day.jpg)<br>*t456 sweep · dry · day* | ![s2-t456-sweep](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__dusk.jpg)<br>*t456 sweep · dry · dusk* |
| ![s2-t456-sweep](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__night.jpg)<br>*t456 sweep · dry · night* |  |  |

### Sector 3 — late lap, pit entry

| | | |
|:---:|:---:|:---:|
| ![s3-late-flood](../../../artifacts/shots/tracks/qatar/s3-late-flood__night.jpg)<br>*late flood · dry · night* | ![s3-t16-entry](../../../artifacts/shots/tracks/qatar/s3-t16-entry__dawn.jpg)<br>*t16 entry · dry · dawn* | ![s3-t16-entry](../../../artifacts/shots/tracks/qatar/s3-t16-entry__day.jpg)<br>*t16 entry · dry · day* |
| ![s3-t16-entry](../../../artifacts/shots/tracks/qatar/s3-t16-entry__dusk.jpg)<br>*t16 entry · dry · dusk* | ![s3-t16-entry](../../../artifacts/shots/tracks/qatar/s3-t16-entry__night.jpg)<br>*t16 entry · dry · night* | ![s3-villas](../../../artifacts/shots/tracks/qatar/s3-villas__day.jpg)<br>*villas · dry · day* |

## By time of day (6 key views)

| View | Day (dry) | Dusk (dry) | Night (dry) | Dawn (dry) |
|------|-----------|------------|-------------|------------|
| Pit straight | ![d](../../../artifacts/shots/tracks/qatar/s1-pit-straight__day.jpg) | ![u](../../../artifacts/shots/tracks/qatar/s1-pit-straight__dusk.jpg) | ![n](../../../artifacts/shots/tracks/qatar/s1-pit-straight__night.jpg) | ![a](../../../artifacts/shots/tracks/qatar/s1-pit-straight__dawn.jpg) |
| T1 | ![d](../../../artifacts/shots/tracks/qatar/s1-t1-park__day.jpg) | ![u](../../../artifacts/shots/tracks/qatar/s1-t1-park__dusk.jpg) | ![n](../../../artifacts/shots/tracks/qatar/s1-t1-park__night.jpg) | ![a](../../../artifacts/shots/tracks/qatar/s1-t1-park__dawn.jpg) |
| Lusail Hill | ![d](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__day.jpg) | ![u](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__dusk.jpg) | ![n](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__night.jpg) | ![a](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__dawn.jpg) |
| T2/T3 | ![d](../../../artifacts/shots/tracks/qatar/s1-t23__day.jpg) | ![u](../../../artifacts/shots/tracks/qatar/s1-t23__dusk.jpg) | ![n](../../../artifacts/shots/tracks/qatar/s1-t23__night.jpg) | ![a](../../../artifacts/shots/tracks/qatar/s1-t23__dawn.jpg) |
| T4–6 | ![d](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__day.jpg) | ![u](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__dusk.jpg) | ![n](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__night.jpg) | ![a](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__dawn.jpg) |
| T16 | ![d](../../../artifacts/shots/tracks/qatar/s3-t16-entry__day.jpg) | ![u](../../../artifacts/shots/tracks/qatar/s3-t16-entry__dusk.jpg) | ![n](../../../artifacts/shots/tracks/qatar/s3-t16-entry__night.jpg) | ![a](../../../artifacts/shots/tracks/qatar/s3-t16-entry__dawn.jpg) |

## Findings & backlog

| ID | Sev | Issue | Action |
|----|-----|-------|--------|
| F1 | low | Buried dune skirts | Fixed: terrainYAt seating (+0.35 m) |
| F2 | low | RC mast unsupported | Fixed: roof box vs 7 m aerial |
| F3 | low | Bleacher coplanar | Within baseline; optional setback |
| F4 | info | Near horizon landmarks | Documented; optional Fuji push |
| F5 | todo | Weather matrix | Rebase shared tooling; wet/fog/overcast |

## Verification

```text
node tools/track/verify-track.cjs qatar → OK
node tools/track/audit-circuit.cjs qatar → ok (buried 7, unsupported 0, flatCoplanar 2)
```
