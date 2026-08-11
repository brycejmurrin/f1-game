# Albert Park Circuit — Visual Design Brief

Game setting: **DAY**, **green theme (parkland)**. Render as procedural colored boxes, no textures.

## 1. Setting
A semi-permanent street circuit looping clockwise around **Albert Park Lake**, a few km south of Melbourne's CBD. Public park roads close to host the race: wide, smooth tarmac threading through manicured parkland, lake frontage, palm avenues, and temporary grandstands, with the distant **city skyline** rising beyond the water on the lake side. Length ~5.28 km, 14 corners — fast and flowing with tight chicane-like complexes.

## 2. Atmosphere & palette
Bright, high Australian autumn sky — clear pale blue `[0.55, 0.78, 0.95]`, strong overhead sun, crisp shadows. Parkland dominates: mown grass `[0.32, 0.62, 0.28]`, **eucalyptus** grey-green canopy `[0.30, 0.42, 0.28]` (no pine). Lake water a calm steel-blue `[0.20, 0.45, 0.62]`. Tarmac mid-grey `[0.28, 0.30, 0.32]`. Fog: minimal — thin warm haze on the horizon softening the CBD towers; keep near-field clear.

## 3. Elevation
Essentially **flat** — a lakeside park. Treat the racing surface as level throughout (no meaningful gradient at any s). Visual depth comes from horizontal layering (lake, trees, skyline), not height.

## 4. Landmarks & surroundings by lap position
Start/finish (s=0.0) on the pit straight between final corner and Turn 1.

| s | Side | Distance | Box-modelling description |
|------|------|----------|---------------------------|
| 0.00 | R | near | Pit building + garages: long low white box row, dark roof slab |
| 0.00 | L | near | Main grandstand: tiered stepped grey box, speckled crowd tint `[0.7,0.6,0.55]` |
| 0.04 | both | near | Turn 1–2: **bold red/white sausage kerbs**, armco + catch fence, tyre walls |
| 0.20 | both | mid | Eucalyptus parkland: taller grey-green broadleaf clusters |
| 0.40–0.50 | L | far | **Lake + Melbourne CBD coplanar**: water planes, then 3–5 hero towers (Eureka-like spire + dark Australia 108 slab) beyond the far shore |
| 0.55 | L | mid | Lakeside Drive: low palm-tree boxes framing the water/skyline sightline |
| 0.62 | R | mid | Spectator grandstand + marquees: stepped grey box, white tent caps |
| 0.78 | both | near | Chicane complex: dense red/white kerbs, temporary armco + fence both sides |
| 0.90 | R | mid | Lakeside grass banking + fan hill: sloped green wedge boxes |
| 0.97 | L | near | Pit entry / paddock: white container-stack boxes, fencing |

## 5. Track features
Semi-permanent parkland circuit on public roads. Fast, flowing layout with long flat-out runs into high-speed corners (Lakeside Drive), broken by tight chicane sequences. Heavy red-and-white **kerbs** at T1 and chicanes; temporary **armco + catch fence** denser than a permanent GP; white painted edge lines; tyre-stack barriers at street-section corners; green grass run-off elsewhere.

## 6. Modelling notes
- Lead with **grey-green eucalyptus** parkland (`pineFrac: 0`); avoid Alpine pine silhouette.
- Place **one coplanar lakeside frame**: water slabs mid-lap (s≈0.40–0.55 L) with **3–5 hero CBD towers beyond** the far shore — not a dense opposite-side skyline wall.
- Palms = thin tall box + small green cube on top; scatter sparsely along Lakeside Drive for locale flavor.
- Use bright, saturated kerb boxes (red `[0.80,0.15,0.15]` / white) densely at T1 and the chicane complex.
- Keep everything level — convey speed and openness through wide run-offs and long sightlines, not elevation.
- Crowd-tint grandstands with a warm speckle so they read as packed banks against the green.

## Research pass — findings (not yet built)

- **The Melbourne CBD skyline is the backdrop**, and F1.com leads with it — a
  cluster of genuinely tall towers ~3 km north, seen across the lake. It should
  read as one dense clump in ONE direction, not a ring: the other horizons are
  low suburban Melbourne and Port Phillip Bay.
- **Albert Park Lake** is the thing the circuit is wrapped around; the track
  runs Aughtie Drive and Lakeside Drive *around* it. Water on the infield side
  for a large part of the lap.
- **Albert Park Golf Course** occupies part of the parkland — open mown
  fairways, scattered specimen trees, bunkers.
- Parkland planting is the Melbourne mix: mature **Moreton Bay figs**, gums and
  rows of **palms** along the drives — not northern-European broadleaf.
