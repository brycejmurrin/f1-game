# Dijon-Prenois (`dijon`) — circuit survey (2026-10-14)

**Brief:** `docs/tracks/dijon.md` · **Scenery:** `js/circuits/scenery/dijon.js`  
**Shots:** **36** JPEGs in `artifacts/shots/tracks/dijon/` (1280px, q80, `git add -f`)  
**Capture:** `shot.mjs --jpeg --present-timeout 90 --capture-retries 4 --wait 120` (SwiftShader)

## Code map

| Layer | Path |
|--------|------|
| Def | `js/circuits/dijon.js` — OSM centreline, green theme |
| Scenery | `js/circuits/scenery/dijon.js` — landmarks + Burgundy patchwork |
| Landmarks | `tests/data/landmarks/dijon.json` |

## Findings backlog (weather notes)

| ID | Finding |
|----|---------|
| W1 | **Night dry:** very dark; `night: false`, `furniture.lamp: none` — expect no floodlit circuit |
| W2 | Fog/storm soften horizon `farHill` read; presets donor Magny-Cours |
| D2–D6 | Day-dry hedge/crop/clip items unchanged — see prior audit |

## Day · dry — sector coverage (12)

| | | |
|:---:|:---:|:---:|
| ![pit complex](../../../artifacts/shots/tracks/dijon/s1-pit-028-orbit.jpg) | ![pit wall](../../../artifacts/shots/tracks/dijon/s1-pit-028-trackside.jpg) | ![spectator hill](../../../artifacts/shots/tracks/dijon/s1-hill-160-orbit.jpg) |
| orbit · day · dry — pit complex | trackside · day · dry — pit wall | orbit · day · dry — spectator hill |
| | | |
|:---:|:---:|:---:|
| ![Combe cut](../../../artifacts/shots/tracks/dijon/s2-combe-308-orbit.jpg) | ![Combe crest](../../../artifacts/shots/tracks/dijon/s2-combe-308-eye.jpg) | ![open valley](../../../artifacts/shots/tracks/dijon/s2-valley-370-orbit.jpg) |
| orbit · day · dry — Combe cut | eye · day · dry — Combe crest | orbit · day · dry — open valley |
| | | |
|:---:|:---:|:---:|
| ![Prenois ferme](../../../artifacts/shots/tracks/dijon/s2-ferme-424-orbit.jpg) | ![esses](../../../artifacts/shots/tracks/dijon/s2-esses-545-orbit.jpg) | ![Parabolique bank](../../../artifacts/shots/tracks/dijon/s3-parabolique-742-orbit.jpg) |
| orbit · day · dry — Prenois ferme | orbit · day · dry — esses | orbit · day · dry — Parabolique bank |
| | | |
|:---:|:---:|:---:|
| ![Parabolique infield](../../../artifacts/shots/tracks/dijon/s3-parabolique-760-park.jpg) | ![final straight](../../../artifacts/shots/tracks/dijon/s3-approach-955-trackside.jpg) | ![mid-lap farmland](../../../artifacts/shots/tracks/dijon/extra-midlap-500-orbit.jpg) |
| park · day · dry — Parabolique infield | trackside · day · dry — final straight | orbit · day · dry — mid-lap farmland |

## Weather / time-of-day — hero views (24)

| | | |
|:---:|:---:|:---:|
| ![pit — golden hour](../../../artifacts/shots/tracks/dijon/wx-pit-dusk-dry-orbit.jpg) | ![pit — no circuit lamps](../../../artifacts/shots/tracks/dijon/wx-pit-night-dry-orbit.jpg) | ![pit — overcast](../../../artifacts/shots/tracks/dijon/wx-pit-day-overcast-orbit.jpg) |
| orbit · dusk · dry — pit — golden hour | orbit · night · dry — pit — no circuit lamps | orbit · day · overcast — pit — overcast |
| | | |
|:---:|:---:|:---:|
| ![pit — rain](../../../artifacts/shots/tracks/dijon/wx-pit-day-rain-orbit.jpg) | ![Combe — dawn](../../../artifacts/shots/tracks/dijon/wx-combe-dawn-dry-orbit.jpg) | ![Combe — fog](../../../artifacts/shots/tracks/dijon/wx-combe-day-fog-orbit.jpg) |
| orbit · day · rain — pit — rain | orbit · dawn · dry — Combe — dawn | orbit · day · fog — Combe — fog |
| | | |
|:---:|:---:|:---:|
| ![Combe — storm](../../../artifacts/shots/tracks/dijon/wx-combe-day-storm-orbit.jpg) | ![Combe — damp dusk](../../../artifacts/shots/tracks/dijon/wx-combe-dusk-wet-orbit.jpg) | ![valley — golden hour](../../../artifacts/shots/tracks/dijon/wx-valley-dusk-dry-orbit.jpg) |
| orbit · day · storm — Combe — storm | orbit · dusk · wet — Combe — damp dusk | orbit · dusk · dry — valley — golden hour |
| | | |
|:---:|:---:|:---:|
| ![valley — night](../../../artifacts/shots/tracks/dijon/wx-valley-night-dry-orbit.jpg) | ![valley — overcast](../../../artifacts/shots/tracks/dijon/wx-valley-day-overcast-orbit.jpg) | ![valley — rain](../../../artifacts/shots/tracks/dijon/wx-valley-day-rain-orbit.jpg) |
| orbit · night · dry — valley — night | orbit · day · overcast — valley — overcast | orbit · day · rain — valley — rain |
| | | |
|:---:|:---:|:---:|
| ![Parabolique — golden hour](../../../artifacts/shots/tracks/dijon/wx-parabolique-dusk-dry-orbit.jpg) | ![Parabolique — night](../../../artifacts/shots/tracks/dijon/wx-parabolique-night-dry-orbit.jpg) | ![Parabolique — fog](../../../artifacts/shots/tracks/dijon/wx-parabolique-day-fog-orbit.jpg) |
| orbit · dusk · dry — Parabolique — golden hour | orbit · night · dry — Parabolique — night | orbit · day · fog — Parabolique — fog |
| | | |
|:---:|:---:|:---:|
| ![Parabolique — damp dusk](../../../artifacts/shots/tracks/dijon/wx-parabolique-dusk-wet-orbit.jpg) | ![approach — dawn](../../../artifacts/shots/tracks/dijon/wx-approach-dawn-dry-trackside.jpg) | ![approach — rain](../../../artifacts/shots/tracks/dijon/wx-approach-day-rain-trackside.jpg) |
| orbit · dusk · wet — Parabolique — damp dusk | trackside · dawn · dry — approach — dawn | trackside · day · rain — approach — rain |
| | | |
|:---:|:---:|:---:|
| ![approach — storm](../../../artifacts/shots/tracks/dijon/wx-approach-day-storm-trackside.jpg) | ![approach — overcast](../../../artifacts/shots/tracks/dijon/wx-approach-day-overcast-trackside.jpg) | ![esses — golden hour](../../../artifacts/shots/tracks/dijon/wx-esses-dusk-dry-orbit.jpg) |
| trackside · day · storm — approach — storm | trackside · day · overcast — approach — overcast | orbit · dusk · dry — esses — golden hour |
| | | |
|:---:|:---:|:---:|
| ![esses — night](../../../artifacts/shots/tracks/dijon/wx-esses-night-dry-orbit.jpg) | ![esses — fog](../../../artifacts/shots/tracks/dijon/wx-esses-day-fog-orbit.jpg) | ![esses — storm](../../../artifacts/shots/tracks/dijon/wx-esses-day-storm-orbit.jpg) |
| orbit · night · dry — esses — night | orbit · day · fog — esses — fog | orbit · day · storm — esses — storm |
