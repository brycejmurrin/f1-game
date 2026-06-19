# Albert Park Circuit — Visual Design Brief

Game setting: **DAY**, **green theme (parkland)**. Render as procedural colored boxes, no textures.

## 1. Setting
A semi-permanent street circuit looping clockwise around **Albert Park Lake**, a few km south of Melbourne's CBD. Public park roads close to host the race: wide, smooth tarmac threading through manicured parkland, lake frontage, palm avenues, and temporary grandstands, with the distant **city skyline** rising to the north. Length ~5.28 km, 14 corners — fast and flowing with tight chicane-like complexes.

## 2. Atmosphere & palette
Bright, high Australian autumn sky — clear pale blue `[0.55, 0.78, 0.95]`, strong overhead sun, crisp shadows. Parkland dominates: mown grass `[0.32, 0.62, 0.28]`, darker tree masses `[0.16, 0.40, 0.20]`. Lake water a calm steel-blue `[0.20, 0.45, 0.62]`. Tarmac mid-grey `[0.28, 0.30, 0.32]`. Fog: minimal — thin warm haze on the horizon softening the CBD towers; keep near-field clear.

## 3. Elevation
Essentially **flat** — a lakeside park. Treat the racing surface as level throughout (no meaningful gradient at any s). Visual depth comes from horizontal layering (lake, trees, skyline), not height.

## 4. Landmarks & surroundings by lap position
Start/finish (s=0.0) on the pit straight between final corner and Turn 1.

| s | Side | Distance | Box-modelling description |
|------|------|----------|---------------------------|
| 0.00 | R | near | Pit building + garages: long low white box row, dark roof slab |
| 0.00 | L | near | Main grandstand: tiered stepped grey box, speckled crowd tint `[0.7,0.6,0.55]` |
| 0.04 | R | mid | Turn 1–2 right/left sweep: green grass run-off boxes, white kerb strips |
| 0.20 | both | mid | Parkland trees: clustered dark-green cuboids of varied height |
| 0.30 | R | far | **Melbourne CBD skyline**: cluster of tall thin blue-grey boxes on horizon |
| 0.45 | L | far | **Albert Park Lake**: broad flat blue slab `[0.20,0.45,0.62]` to the horizon |
| 0.55 | L | mid | Lakeside Drive fast section: low palm-tree boxes (thin trunk + green top cube) |
| 0.62 | R | mid | Spectator grandstand + marquees: stepped grey box, white tent caps |
| 0.78 | both | near | Chicane complex: tight clustered red/white kerb boxes, low barriers |
| 0.90 | R | mid | Lakeside grass banking + fan hill: sloped green wedge boxes |
| 0.97 | L | near | Pit entry / paddock: white container-stack boxes, fencing |

## 5. Track features
Semi-permanent parkland circuit on public roads. Fast, flowing layout with long flat-out runs into high-speed corners (Lakeside Drive), broken by tight chicane sequences. Heavy red-and-white **kerbs** at apexes and exits; white painted edge lines; concrete walls and tyre-stack barriers at the street-section corners; green grass run-off elsewhere.

## 6. Modelling notes
- Lead with **green**: lay parkland grass and tree-clusters as the default trackside fill, with the grey ribbon cutting through.
- Place one **horizontal blue lake slab** mid-lap (s≈0.40–0.55) and a **distant CBD tower cluster** (s≈0.30) — two signature silhouettes that read instantly.
- Palms = thin tall box + small green cube on top; scatter sparsely along Lakeside Drive for locale flavor.
- Use bright, saturated kerb boxes (red `[0.80,0.15,0.15]` / white) to mark the chicanes and corner apexes.
- Keep everything level — convey speed and openness through wide run-offs and long sightlines, not elevation.
- Crowd-tint grandstands with a warm speckle so they read as packed banks against the green.
