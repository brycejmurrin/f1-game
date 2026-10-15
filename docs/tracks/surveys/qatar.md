# Qatar (Lusail) — circuit survey

**Circuit id:** `qatar` · **Survey:** 2026-10-15 · **Brief:** [`docs/tracks/qatar.md`](../qatar.md)

## Code map

| Layer | Path |
|--------|------|
| Def | `js/circuits/qatar.js` |
| Scenery | `js/circuits/scenery/qatar.js` |
| Landmarks | `tests/data/landmarks/qatar.json` |

Pit / T1 props use `sl(f)` (racing fraction); mid-lap tables use authored `s`.

## Capture

- **36 JPEGs** — `shot.mjs --batch` with `--jpeg --present-timeout 90 --capture-retries 4 --wait 120` (SwiftShader).
- **Six hero views** × lighting/weather matrix (dry + wet/rain/overcast/fog/storm; dawn/dusk/night).
- Filenames: `<view>__<tod>-<weather>.jpg` — captions match `__apex` `setTimeOfDay` + `weather()`.

## All shots (36)

| | | |
|:---:|:---:|:---:|
| ![lusail hill · dry · dawn](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__dawn-dry.jpg)<br>*lusail hill · dry · dawn* | ![lusail hill · fog · day](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__day-fog.jpg)<br>*lusail hill · fog · day* | ![lusail hill · overcast · day](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__day-overcast.jpg)<br>*lusail hill · overcast · day* |
| ![lusail hill · wet · day](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__day-wet.jpg)<br>*lusail hill · wet · day* | ![lusail hill · dry · dusk](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__dusk-dry.jpg)<br>*lusail hill · dry · dusk* | ![lusail hill · dry · night](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__night-dry.jpg)<br>*lusail hill · dry · night* |
| ![pit straight · dry · dawn](../../../artifacts/shots/tracks/qatar/s1-pit-straight__dawn-dry.jpg)<br>*pit straight · dry · dawn* | ![pit straight · fog · day](../../../artifacts/shots/tracks/qatar/s1-pit-straight__day-fog.jpg)<br>*pit straight · fog · day* | ![pit straight · overcast · day](../../../artifacts/shots/tracks/qatar/s1-pit-straight__day-overcast.jpg)<br>*pit straight · overcast · day* |
| ![pit straight · wet · day](../../../artifacts/shots/tracks/qatar/s1-pit-straight__day-wet.jpg)<br>*pit straight · wet · day* | ![pit straight · dry · dusk](../../../artifacts/shots/tracks/qatar/s1-pit-straight__dusk-dry.jpg)<br>*pit straight · dry · dusk* | ![pit straight · dry · night](../../../artifacts/shots/tracks/qatar/s1-pit-straight__night-dry.jpg)<br>*pit straight · dry · night* |
| ![t1 park · dry · dawn](../../../artifacts/shots/tracks/qatar/s1-t1-park__dawn-dry.jpg)<br>*t1 park · dry · dawn* | ![t1 park · rain · day](../../../artifacts/shots/tracks/qatar/s1-t1-park__day-rain.jpg)<br>*t1 park · rain · day* | ![t1 park · wet · day](../../../artifacts/shots/tracks/qatar/s1-t1-park__day-wet.jpg)<br>*t1 park · wet · day* |
| ![t1 park · dry · dusk](../../../artifacts/shots/tracks/qatar/s1-t1-park__dusk-dry.jpg)<br>*t1 park · dry · dusk* | ![t1 park · dry · night](../../../artifacts/shots/tracks/qatar/s1-t1-park__night-dry.jpg)<br>*t1 park · dry · night* | ![t1 park · storm · night](../../../artifacts/shots/tracks/qatar/s1-t1-park__night-storm.jpg)<br>*t1 park · storm · night* |
| ![horizon landmarks · fog · day](../../../artifacts/shots/tracks/qatar/s2-horizon-landmarks__day-fog.jpg)<br>*horizon landmarks · fog · day* | ![horizon landmarks · overcast · day](../../../artifacts/shots/tracks/qatar/s2-horizon-landmarks__day-overcast.jpg)<br>*horizon landmarks · overcast · day* | ![horizon landmarks · rain · day](../../../artifacts/shots/tracks/qatar/s2-horizon-landmarks__day-rain.jpg)<br>*horizon landmarks · rain · day* |
| ![horizon landmarks · dry · dusk](../../../artifacts/shots/tracks/qatar/s2-horizon-landmarks__dusk-dry.jpg)<br>*horizon landmarks · dry · dusk* | ![horizon landmarks · dry · night](../../../artifacts/shots/tracks/qatar/s2-horizon-landmarks__night-dry.jpg)<br>*horizon landmarks · dry · night* | ![horizon landmarks · storm · night](../../../artifacts/shots/tracks/qatar/s2-horizon-landmarks__night-storm.jpg)<br>*horizon landmarks · storm · night* |
| ![t456 sweep · dry · dawn](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__dawn-dry.jpg)<br>*t456 sweep · dry · dawn* | ![t456 sweep · overcast · day](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__day-overcast.jpg)<br>*t456 sweep · overcast · day* | ![t456 sweep · rain · day](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__day-rain.jpg)<br>*t456 sweep · rain · day* |
| ![t456 sweep · wet · day](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__day-wet.jpg)<br>*t456 sweep · wet · day* | ![t456 sweep · dry · dusk](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__dusk-dry.jpg)<br>*t456 sweep · dry · dusk* | ![t456 sweep · dry · night](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__night-dry.jpg)<br>*t456 sweep · dry · night* |
| ![t16 entry · dry · dawn](../../../artifacts/shots/tracks/qatar/s3-t16-entry__dawn-dry.jpg)<br>*t16 entry · dry · dawn* | ![t16 entry · fog · day](../../../artifacts/shots/tracks/qatar/s3-t16-entry__day-fog.jpg)<br>*t16 entry · fog · day* | ![t16 entry · storm · day](../../../artifacts/shots/tracks/qatar/s3-t16-entry__day-storm.jpg)<br>*t16 entry · storm · day* |
| ![t16 entry · wet · day](../../../artifacts/shots/tracks/qatar/s3-t16-entry__day-wet.jpg)<br>*t16 entry · wet · day* | ![t16 entry · dry · dusk](../../../artifacts/shots/tracks/qatar/s3-t16-entry__dusk-dry.jpg)<br>*t16 entry · dry · dusk* | ![t16 entry · dry · night](../../../artifacts/shots/tracks/qatar/s3-t16-entry__night-dry.jpg)<br>*t16 entry · dry · night* |

## By sector

### Sector 1

| | | |
|:---:|:---:|:---:|
| ![lusail hill · dry · dawn](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__dawn-dry.jpg)<br>*lusail hill · dry · dawn* | ![lusail hill · fog · day](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__day-fog.jpg)<br>*lusail hill · fog · day* | ![lusail hill · overcast · day](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__day-overcast.jpg)<br>*lusail hill · overcast · day* |
| ![lusail hill · wet · day](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__day-wet.jpg)<br>*lusail hill · wet · day* | ![lusail hill · dry · dusk](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__dusk-dry.jpg)<br>*lusail hill · dry · dusk* | ![lusail hill · dry · night](../../../artifacts/shots/tracks/qatar/s1-lusail-hill__night-dry.jpg)<br>*lusail hill · dry · night* |
| ![pit straight · dry · dawn](../../../artifacts/shots/tracks/qatar/s1-pit-straight__dawn-dry.jpg)<br>*pit straight · dry · dawn* | ![pit straight · fog · day](../../../artifacts/shots/tracks/qatar/s1-pit-straight__day-fog.jpg)<br>*pit straight · fog · day* | ![pit straight · overcast · day](../../../artifacts/shots/tracks/qatar/s1-pit-straight__day-overcast.jpg)<br>*pit straight · overcast · day* |
| ![pit straight · wet · day](../../../artifacts/shots/tracks/qatar/s1-pit-straight__day-wet.jpg)<br>*pit straight · wet · day* | ![pit straight · dry · dusk](../../../artifacts/shots/tracks/qatar/s1-pit-straight__dusk-dry.jpg)<br>*pit straight · dry · dusk* | ![pit straight · dry · night](../../../artifacts/shots/tracks/qatar/s1-pit-straight__night-dry.jpg)<br>*pit straight · dry · night* |
| ![t1 park · dry · dawn](../../../artifacts/shots/tracks/qatar/s1-t1-park__dawn-dry.jpg)<br>*t1 park · dry · dawn* | ![t1 park · rain · day](../../../artifacts/shots/tracks/qatar/s1-t1-park__day-rain.jpg)<br>*t1 park · rain · day* | ![t1 park · wet · day](../../../artifacts/shots/tracks/qatar/s1-t1-park__day-wet.jpg)<br>*t1 park · wet · day* |
| ![t1 park · dry · dusk](../../../artifacts/shots/tracks/qatar/s1-t1-park__dusk-dry.jpg)<br>*t1 park · dry · dusk* | ![t1 park · dry · night](../../../artifacts/shots/tracks/qatar/s1-t1-park__night-dry.jpg)<br>*t1 park · dry · night* | ![t1 park · storm · night](../../../artifacts/shots/tracks/qatar/s1-t1-park__night-storm.jpg)<br>*t1 park · storm · night* |

### Sector 2

| | | |
|:---:|:---:|:---:|
| ![horizon landmarks · fog · day](../../../artifacts/shots/tracks/qatar/s2-horizon-landmarks__day-fog.jpg)<br>*horizon landmarks · fog · day* | ![horizon landmarks · overcast · day](../../../artifacts/shots/tracks/qatar/s2-horizon-landmarks__day-overcast.jpg)<br>*horizon landmarks · overcast · day* | ![horizon landmarks · rain · day](../../../artifacts/shots/tracks/qatar/s2-horizon-landmarks__day-rain.jpg)<br>*horizon landmarks · rain · day* |
| ![horizon landmarks · dry · dusk](../../../artifacts/shots/tracks/qatar/s2-horizon-landmarks__dusk-dry.jpg)<br>*horizon landmarks · dry · dusk* | ![horizon landmarks · dry · night](../../../artifacts/shots/tracks/qatar/s2-horizon-landmarks__night-dry.jpg)<br>*horizon landmarks · dry · night* | ![horizon landmarks · storm · night](../../../artifacts/shots/tracks/qatar/s2-horizon-landmarks__night-storm.jpg)<br>*horizon landmarks · storm · night* |
| ![t456 sweep · dry · dawn](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__dawn-dry.jpg)<br>*t456 sweep · dry · dawn* | ![t456 sweep · overcast · day](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__day-overcast.jpg)<br>*t456 sweep · overcast · day* | ![t456 sweep · rain · day](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__day-rain.jpg)<br>*t456 sweep · rain · day* |
| ![t456 sweep · wet · day](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__day-wet.jpg)<br>*t456 sweep · wet · day* | ![t456 sweep · dry · dusk](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__dusk-dry.jpg)<br>*t456 sweep · dry · dusk* | ![t456 sweep · dry · night](../../../artifacts/shots/tracks/qatar/s2-t456-sweep__night-dry.jpg)<br>*t456 sweep · dry · night* |

### Sector 3

| | | |
|:---:|:---:|:---:|
| ![t16 entry · dry · dawn](../../../artifacts/shots/tracks/qatar/s3-t16-entry__dawn-dry.jpg)<br>*t16 entry · dry · dawn* | ![t16 entry · fog · day](../../../artifacts/shots/tracks/qatar/s3-t16-entry__day-fog.jpg)<br>*t16 entry · fog · day* | ![t16 entry · storm · day](../../../artifacts/shots/tracks/qatar/s3-t16-entry__day-storm.jpg)<br>*t16 entry · storm · day* |
| ![t16 entry · wet · day](../../../artifacts/shots/tracks/qatar/s3-t16-entry__day-wet.jpg)<br>*t16 entry · wet · day* | ![t16 entry · dry · dusk](../../../artifacts/shots/tracks/qatar/s3-t16-entry__dusk-dry.jpg)<br>*t16 entry · dry · dusk* | ![t16 entry · dry · night](../../../artifacts/shots/tracks/qatar/s3-t16-entry__night-dry.jpg)<br>*t16 entry · dry · night* |

## Findings & fixes

| In PR | Backlog |
|-------|---------|
| Dune `terrainYAt` seating | Bleacher coplanar (baseline) |
| RC roof mast (unsupported→0) | Horizon landmark distance |

## Verification

```text
node tools/track/verify-track.cjs qatar → OK
node tools/track/audit-circuit.cjs qatar → ok
```
