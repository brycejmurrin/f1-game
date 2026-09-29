# Albert Park Circuit — Visual Design Brief

Game setting: **DAY**, **green theme (parkland)**. Render as procedural colored boxes, no textures.

## 1. Setting
A semi-permanent street circuit looping **anticlockwise** around **Albert Park Lake**, a few km south of Melbourne's CBD. Public park roads close to host the race: wide, smooth tarmac threading through manicured parkland, lake frontage, palm avenues, and temporary grandstands, with the distant **city skyline** rising beyond the water on the lake side. Length 5.278 km, 14 corners (after the 2022 removal of the T9/10 chicane) — fast and flowing.

Sources: [Formula 1 circuit guide 2026](https://www.formula1.com/en/latest/article/circuit-guide-2026-australian-grand-prix-albert-park.19zPlhKhMbTaVNFIPKAAMa); [Wikipedia — Albert Park Circuit](https://en.wikipedia.org/wiki/Albert_Park_Circuit).

## 2. Atmosphere & palette
Bright, high Australian autumn sky — clear pale blue `[0.55, 0.78, 0.95]`, strong overhead sun, crisp shadows. Parkland dominates: mown grass `[0.32, 0.62, 0.28]`, **eucalyptus** grey-green canopy `[0.30, 0.42, 0.28]` (no pine). Lake water a calm steel-blue `[0.20, 0.45, 0.62]`. Tarmac mid-grey `[0.28, 0.30, 0.32]`. Fog: minimal — thin warm haze on the horizon softening the CBD towers; keep near-field clear.

## 3. Elevation
Essentially **flat** — a lakeside park. Treat the racing surface as level throughout (no meaningful gradient at any s). Visual depth comes from horizontal layering (lake, trees, skyline), not height.

## 4. Landmarks & surroundings by lap position
Start/finish (s=0.0) on the pit straight between final corner and Turn 1. Pit complex is **side +1** (`def.pit`); main-straight spectator stands are **side −1** opposite the pits.

| s | Side | Distance | Box-modelling description |
|------|------|----------|---------------------------|
| 0.00 | R (+1) | near | Pit building + garages (engine `TrackPit`) |
| 0.00 | L (−1) | near | **Piastri** grandstand (new 2026) — premium S/F seats opposite pits |
| 0.96 | L (−1) | near | **Fangio** — same bank toward T14 (shrunk for 2026 to make room for Piastri) |
| 0.04 | both | near | T1–2: **Brabham** (L) / **Jones** (R), bold red/white kerbs, armco + fence |
| 0.12 | R | mid | **Hill** (T3 area, approx) |
| 0.20–0.27 | both | mid | Eucalyptus parkland |
| 0.40–0.58 | L | far | **Lake + Melbourne CBD**: water planes, hero towers beyond far shore (bearings visual estimates, not surveyed) |
| 0.42–0.58 | L | mid | Lakeside Drive: palms + temporary container stacks on the lake side, kept off the road |
| 0.55 | L | mid | **Ricciardo** lakeside bank |
| 0.145 | L | mid | **MSAC** (Melbourne Sports and Aquatic Centre) — permanent civic hall |
| 0.645 | R | mid | **Lakeside Stadium** shell + pitch |
| 0.78 | both | near | Chicane complex: dense kerbs, temporary armco + fence |
| 0.90 | R | mid | Fan hill / grass banking |

### 2026 grandstand map (sourced)
Fangio (main straight), **Piastri** (new, opposite pits from 2026), Brabham/Jones/Moss (T1–2), Ricciardo (infield T3–4), Hill (T3), Clark (beyond T8, outside), Button (T8), Waite (T9–10), Lauda (T12), Schumacher/Senna (T13–14).

Sources: [grandprix.com.au — Piastri Grandstand debut](https://www.grandprix.com.au/fan-zone/news/piastri-grandstand-to-debut-at-albert-park-in-2026); [oversteer48 — Piastri](https://oversteer48.com/piastri-grandstand-australian-grand-prix/); [oversteer48 — Fangio](https://oversteer48.com/fangio-grandstand/); [FIA GP26 press kit](https://www.fia.com/sites/default/files/gp26_press_kit.pdf); travel.grandprix.com.au / keithprowsetravel.com grandstand guides.

### UNCERTAIN — do not build as fact
- **Prost** stand location: one source says main straight, another T13–14 — **not built**.
- **Piastri** exact bay length / section widths — new for 2026; placed opposite the pit building and marked approximate (~72 m).
- CBD tower (Rialto/Eureka) bearings are visual estimates, not surveyed.

## 5. Track features
Semi-permanent parkland circuit on public roads (Aughtie Drive + Lakeside Drive). Concrete barriers annually along the Lakeside Drive curve where the lake leaves no run-off ([Wikipedia](https://en.wikipedia.org/wiki/Albert_Park_Circuit)). Heavy red-and-white **kerbs** at T1 and chicanes; temporary **armco + catch fence**; tyre-stack barriers at street-section corners; green grass run-off elsewhere.

## 6. Modelling notes
- Lead with **grey-green eucalyptus** parkland (`pineFrac: 0`); avoid Alpine pine silhouette.
- Place **one coplanar lakeside frame**: water slabs mid-lap (s≈0.40–0.55 L) with **3–5 hero CBD towers beyond** the far shore — not a dense opposite-side skyline wall.
- Palms along Lakeside Drive on the lake side; temporary container stacks further out (race-week logistics).
- Use bright, saturated kerb strips (red `[0.80,0.15,0.15]` / white) at T1 and the chicane complex via `bankedKerbStrip` (seated on the ribbon — not sunk `place()` flashes).
- Keep everything level — convey speed and openness through wide run-offs and long sightlines, not elevation.
- Crowd-tint grandstands with a warm speckle so they read as packed banks against the green.

## Required landmarks (wave 6)
| id | Role |
|----|------|
| `albert-piastri-stand` | 2026 Piastri grandstand, side −1 at S/F, opposite pits |
| `albert-msac` | Melbourne Sports and Aquatic Centre |
| `albert-lakeside-stadium` | Lakeside Stadium shell |

## Outcome
Melbourne CBD skyline reads as a clump across the lake; Albert Park Lake dominates the infield; golf fairways/bunkers and Melbourne planting (eucalyptus, figs, palms) are present. MSAC is the permanent civic mass. Wave 6 adds the **Piastri** stand, corrects Fangio/Brabham placement against the 2026 map, dresses Lakeside Drive with palms + temporary containers, and grounds previously buried kerb flashes / unsupported stadium roof.
