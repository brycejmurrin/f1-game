# Lusail International Circuit — Visual Design Brief

**Location:** Lusail, Qatar (north of Doha) · **Setting:** NIGHT race, desert theme · 5.419 km, 16 corners, clockwise.

## 1. Setting
A fully floodlit circuit on flat, open desert just outside Lusail, north of Doha. The track is ringed by artificial green grass strips (laid to stop blowing sand) and sand run-offs, surrounded by bare flat desert and low dunes. Built features share one sleek architectural language: a long curved main grandstand and the record-length pit building lining the kilometre-plus main straight. The distant glittering Lusail/Doha skyline sits low on the far horizon.

## 2. Atmosphere & palette
Black desert night cut by tall banks of pure white floodlights — the brightest, whitest lighting on the calendar. Asphalt reads as cool grey, framed by green artificial-grass verge and warm sand beyond.
- Sky / horizon: deep indigo-black `[0.03, 0.04, 0.09]`
- Sand / desert ground: warm tan `[0.64, 0.52, 0.36]`, dune highlights `[0.76, 0.64, 0.46]`
- Asphalt: smooth dark grey `[0.17, 0.17, 0.19]`
- Artificial grass verge: muted green `[0.20, 0.42, 0.22]`
- Floodlight pools / lit white structures: bright `[0.95, 0.95, 0.92]`
- Kerbs: red `[0.85, 0.15, 0.15]` / white `[0.95, 0.95, 0.95]`
- Distant skyline glow: cool teal-white pinpricks `[0.55, 0.70, 0.80]`
Fog: very light, clean dry air — long-straight visibility intact, only the far skyline softened.

## 3. Elevation
Effectively flat throughout — a billiard-table desert plain with no meaningful gradient. Model as level; any change is sub-metre and can be ignored.

## 4. Landmarks & surroundings by lap position
| s (0–1) | Side | Dist | Box-model description |
|--------|------|------|------------------------|
| 0.00 | L | close | Pit building: very long low white slab (record length), thin glass-grey stripe |
| 0.00 | R | close | **Main Grandstand**: long curved/crescent stepped slab, ~22 m, dark seating face |
| 0.00 | both | close | Floodlight towers: tall dark poles topped by bright white lamp boxes, ~30 m |
| 0.06 | R | mid | Turn 1 (North) Grandstand: angled stepped grey box, ~18 m |
| 0.10 | L | far | Palm tree cluster: thin dark trunks + small dark-green frond caps, ~8 m |
| 0.18 | R | mid | T2/T3 grandstands: paired low grey slabs, ~14 m |
| 0.28 | L | far | Low sand dunes: rounded tan wedges, 3–6 m |
| 0.40 | both | far | Flowing Turns 4–6 sweep flanked by green-grass verge + flat sand |
| 0.52 | L | far | Distant **Lusail/Doha skyline**: thin pale tower silhouettes low on horizon |
| 0.62 | R | mid | Marshal/timing huts: small white cubes, ~4 m, dark-tan service track |
| 0.74 | both | mid | Repeating floodlight masts + catch-fence: dark verticals, white caps |
| 0.86 | L | far | Sparse palm row + sand flats, near-ground tan plane |
| 0.95 | R | close | Turn 16 grandstand + pit entry: grey arc returning onto main straight |

## 5. Track features
Fast, flowing layout inherited from its MotoGP origins: long medium- and high-speed corners with very few hard stops. Signature beats: **Turn 1** sweeping right (heavy braking off the long straight, prime overtake), the tight **Turn 2** left, the **Turns 4–5–6** high-speed double-apex sweeps that punish front tyres, and a flat-out final sequence onto the 1.07 km straight. Smooth resurfaced asphalt, bold red-white sawtooth kerbs at every apex, green artificial-grass strips, and wide sand/asphalt run-offs.

## 6. Modelling notes
- Light from above: bake bright top faces and white floodlight pools so the track reads as a lit ribbon against pure black sky.
- The single hero silhouette is the long curved/crescent **main grandstand + record-length pit building** spanning the start/finish straight.
- Repeat tall dark floodlight masts with bright white lamp boxes densely around the lap — they are the defining "Qatar night" motif.
- Frame asphalt with a thin green artificial-grass verge box, then warm tan sand and a few rounded dune wedges beyond.
- Scatter sparse palm trees (thin trunk box + dark-green frond cap) and a faint low skyline of pale tower slivers on the far horizon.
- Keep corners long and gently curved with continuous red-white kerb boxes to evoke the flowing, motorcycle-style layout.
