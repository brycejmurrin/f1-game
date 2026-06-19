# Circuit Gilles Villeneuve — Visual Design Brief

**Theme:** `island_park_day` (green) · **Time:** DAY · **Render:** procedural colored boxes, no textures

## 1. Setting
A semi-permanent racetrack laid across **Île Notre-Dame**, a man-made island built for Expo 67 in the St. Lawrence River, just off downtown Montreal. The circuit sits inside Parc Jean-Drapeau: leafy parkland, paved cycle paths, the long Olympic rowing basin, and Expo-era pavilions. Water is everywhere — the island is ringed by the river and laced with canals. Walls hug the track tightly with almost no run-off; trees and grass fill the gaps. The Montreal skyline rises across the water to the north.

## 2. Atmosphere & palette
Bright early-summer day, clear sky, soft greens of mid-June foliage, calm water. Light haze over the river for depth — no heavy fog.
- Sky: `[0.50, 0.70, 0.93]` clear blue
- Tarmac: `[0.33, 0.34, 0.36]` clean grey asphalt
- River/canal: `[0.22, 0.45, 0.58]` cool St. Lawrence blue
- Olympic Basin water: `[0.20, 0.50, 0.60]` flat rowing-lake teal
- Grass/parkland: `[0.30, 0.55, 0.28]` park green
- Trees: `[0.18, 0.42, 0.22]` deep foliage green
- Concrete walls/barriers: `[0.78, 0.79, 0.80]` pale grey

## 3. Elevation
Essentially **flat** — a reclaimed island with no real gradient. Keep the ground plane level across the whole lap; convey speed and rhythm through corner spacing and wall proximity, not hills. Optional faint rise onto bridges near s≈0.55.

## 4. Landmarks & surroundings by lap position
Clockwise; s=0.0 at start/finish on the main straight.
| s | Side | Dist | Landmark — box-modelling note |
|------|------|------|-------------------------------|
| 0.02 | R | close | Pit wall & grandstand — long low grey box, thin railing boxes |
| 0.04 | both | close | Senna S (T1–2) chicane — angled wall boxes, red/white kerb slabs |
| 0.10 | L | mid | Olympic Basin rowing lake — wide flat teal plane behind low wall |
| 0.15 | both | mid | Parkland trees — clusters of green cube canopies on brown trunk boxes |
| 0.25 | R | far | Casino de Montréal (Expo pavilion) — tall faceted pale block, glassy tint |
| 0.30 | L | far | Biosphère dome — big light-grey hemisphere approximated as stacked boxes |
| 0.38 | L | far | Montreal skyline across river — distant grey tower boxes of varied height |
| 0.45 | R | close | Casino corner (T8–9) + footbridge — grey box spanning over the track |
| 0.55 | both | close | L'Épingle hairpin (T10) — tight U of wall boxes, grandstand backdrop |
| 0.60 | L | mid | Casino Straight flanked by Olympic Basin — long teal water plane to left |
| 0.92 | both | close | Final chicane (T13–14) — red/white kerb boxes, tight wall funnel |
| 0.96 | R | close | **Wall of Champions** — unbroken pale concrete wall box, "Bienvenue" graphic |
| all | both | close | Continuous concrete walls — thin pale-grey boxes lining both edges |

## 5. Track features
- Long flat-out straights (main + Casino Straight) broken by sharp chicanes — a stop-go rhythm.
- **Wall of Champions**: signature unbroken concrete wall right on the final-chicane exit, inches from the line.
- Tight concrete walls everywhere — minimal run-off, walls define the racing corridor.
- Aggressive red-and-white kerbs at every chicane and the hairpin.

## 6. Modelling notes
- Lead with the contrast of **grey tarmac + pale walls against green park and blue water** — that read says Montreal instantly.
- Place the long flat **teal Olympic Basin plane** along the left of the Casino Straight as the signature water motif.
- Keep the whole island dead flat; use wall proximity and chicane kerbs, not elevation, for drama.
- Dot green cube-canopy trees and grass strips between walls to sell the island-park setting.
- Make the **Wall of Champions** a clean, prominent, unbroken pale box at the final chicane — a recognizable beat.
- Background skyline (distant grey tower boxes) and the Biosphère hemisphere across the water give the island scale and identity.
