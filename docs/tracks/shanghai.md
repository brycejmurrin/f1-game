# Shanghai International Circuit — Visual Design Brief

**Setting:** DAY · Modern theme · 5.451 km, 16 turns, clockwise

## 1. Setting
Purpose-built Tilke circuit (opened 2004) in Jiading District, Shanghai, on reclaimed marshland / former rice paddies stabilized by 40,000+ stone pillars. The layout is deliberately shaped like the Chinese character **上 (shàng)**, "above / ascend." Sprawling, flat, infrastructure-heavy: huge grandstands, twin wing bridges over the pit straight, broad asphalt run-offs, Yu Garden paddock pavilions in lakes, and a hazy marsh + distant Pudong backdrop.

## 2. Atmosphere & Palette
Frequently hazy, low-contrast sky — pale grey-blue with diffuse white sun, soft long-distance fog dimming the skyline. Modern materials: concrete greys, white steel, dark asphalt, accents of red/yellow signage. Marshland greens around the perimeter.
- Sky: `[0.72, 0.76, 0.80]` (hazy pale blue-grey)
- Fog/haze: `[0.80, 0.82, 0.83]`, thick beyond ~600 m
- Asphalt: `[0.26, 0.27, 0.29]`
- Pale runoff: `[0.58, 0.58, 0.60]`
- Concrete/steel: `[0.70, 0.72, 0.74]`
- Grass/marsh green: `[0.34, 0.45, 0.28]`

## 3. Elevation
Fairly flat overall. Subtle rise on the Turn 1–2 climb and exit of Turn 6 ("winds uphill"); gentle descent through 7–8. Treat as near-flat: +0.5–1.0 m bumps at s≈0.06 (T1-2) and s≈0.30 (T6), otherwise level.

## 4. Landmarks & Surroundings by Lap Position
| s | Side | Distance | Box-model description |
|------|------|----------|------------------------|
| 0.00 | L | near | Twin wing bridges: two slim flat decks (~38 m) on end pillars spanning the pit straight; long white main stand behind (no tower/cantilever/cable stack) |
| 0.00 | L | mid | Yu Garden paddock: white pavilion boxes with red prism roofs sitting in lakes |
| 0.00 | R | near | Pit wall + low garage boxes, white/grey, red-edged |
| 0.04 | L | mid | Start grandstand tiers: stacked grey stepped boxes |
| 0.05–0.11 | R | near | Snail T1–3: coiling pale `runoffApron` pads + dense red/white kerb verge |
| 0.30 | L | far | One hazy Pudong cluster (Pearl + Jin Mao + Shanghai Tower) — no wraparound skyline rings |
| 0.45 | R | mid | Mid-sector grandstand: low stepped grey box bank |
| 0.62 | L | far | Marsh/treeline: flat green mound strips + wetland plane |
| 0.78 | R | near | Long back straight: open flat green/grey verges, sparse signage boxes |
| 0.90 | L | mid | T14 hairpin grandstand: curved bank of stepped grey boxes + pale runoff apron |
| 0.96 | R | near | Pit entry buildings: white boxes returning to main complex |

## 5. Track Features
- **T1–3 snail spiral (s≈0.04–0.10):** tightening decreasing-radius right that coils inward — pale coiling runoff pads + strong kerb rhythm so it reads from the cockpit.
- **Long back straight (s≈0.72–0.88):** ~1.2 km dead-straight, one of F1's longest; open marsh verges (no tower wall).
- **T14 hairpin (s≈0.90):** heavy braking at the straight's end — sharp tight left, pale runoff apron.
- **Kerbs:** red/white striped low boxes on apexes and exits; denser through the snail.

## 6. Modelling Notes
- Lead with the **twin wing decks**: two slim flat boxes bridging the track on pillars at s≈0.00 — collapse any competing roof systems into this gateway.
- Render the **T1–3 spiral** with stepped pale `runoffApron` pads so the "上" gesture is cockpit-readable.
- Keep everything **grey/white/concrete** with marsh-green verges; reserve color for red kerbs, red pavilion roofs, and yellow signage.
- Backdrop = **marsh mounds + one hazed Pudong** — never wraparound glass rings.
- **Yu Garden paddock**: small white pavilion boxes with red roofs in the lakes beside the pit.
- Stack grandstands as **stepped box tiers**; vary height to imply the 200,000-seat scale.
