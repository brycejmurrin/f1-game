# Circuit Gilles Villeneuve — Visual Design Brief

**Theme:** `island_park_day` (green) · **Time:** DAY · **Render:** procedural colored boxes, no textures

## 1. Setting
A semi-permanent racetrack laid across **Île Notre-Dame**, a man-made island built for Expo 67 in the St. Lawrence River, just off downtown Montreal. The circuit sits inside Parc Jean-Drapeau: leafy parkland, paved cycle paths, the long Olympic rowing basin, and Expo-era pavilions. Water is everywhere — the island is ringed by the river and laced with canals. Walls hug the track tightly with almost no run-off; trees and grass fill the gaps. The Montreal skyline rises across the water to the north.

## 2. Atmosphere & palette
Bright early-summer day, clear sky, soft greens of mid-June foliage, calm water. Light haze over the river for depth — no heavy fog.
- Sky: `[0.50, 0.70, 0.93]` clear blue
- Tarmac: `[0.33, 0.34, 0.36]` clean grey asphalt
- River/canal: `[0.08, 0.55, 0.62]` bright basin teal (`COL.basinTeal`)
- Olympic Basin water: `[0.08, 0.55, 0.62]` flat rowing-lake teal (`COL.basinTeal`)
- Grass/parkland: `[0.30, 0.55, 0.28]` park green
- Trees: `[0.18, 0.42, 0.22]` deep foliage green
- Concrete walls/barriers: `[0.78, 0.79, 0.80]` pale grey

## 3. Elevation
Essentially **flat** — a reclaimed island with no real gradient. Keep the ground plane level across the whole lap; convey speed and rhythm through corner spacing and wall proximity, not hills. Optional faint rise onto bridges near s≈0.55. The def still carries three gentle cosine bumps (≤ ~3.3 m peak-to-trough); do not add knife-edge steps.

## 4. Landmarks & surroundings by lap position
Clockwise; s=0.0 at start/finish on the main straight.
| s | Side | Dist | Landmark — box-modelling note |
|------|------|------|-------------------------------|
| 0.02 | R | close | Pit wall & grandstand — long low grey box, thin railing boxes |
| 0.04 | both | close | Senna S (T1–2) chicane — angled wall boxes, red/white kerb slabs |
| 0.10 | L | mid | Olympic Basin rowing lake — wide flat teal plane behind low wall |
| 0.15 | both | mid | Parkland trees — clusters of green cube canopies on brown trunk boxes |
| 0.274 | R | 47–143 m | **Casino de Montréal** (`montreal-casino`, required) — 4 stacked pale tiers ~44 m with glint prisms + gold Quebec annex; built on dry ground (the river `waterBand` starts at s≈0.3125). Approach plaza cue at s 0.255 |
| 0.30 | L | far | **Biosphère** (`montreal-biosphere`) — 76 m Ø / 62 m high geodesic dome on Île Sainte-Hélène |
| 0.38 | L | far | Montreal skyline across river — distant grey tower boxes of varied height |
| 0.45 | R | close | Casino corner (T8–9) + footbridge — grey box spanning over the track |
| 0.52–0.58 | both | close | **L'Épingle** (`montreal-hairpin-grandstands`) — 3 outside stands + GS 34 inside |
| 0.60 | L | mid | Casino Straight flanked by Olympic Basin — long teal water plane to left |
| 0.92 | both | close | Final chicane (T13–14) — red/white kerb boxes, tight wall funnel |
| 0.97 | both | close | **Wall of Champions** (`montreal-wall-of-champions-stand`) — GS 16 + Bienvenue panel |
| all | both | close | Continuous concrete walls — thin pale-grey boxes lining both edges |

## 5. Track features
- Long flat-out straights (main + Casino Straight) broken by sharp chicanes — a stop-go rhythm.
- **Wall of Champions**: taller pale concrete wall on the final-chicane exit with a Bienvenue/Québec panel (no lettering at this scale).
- Tight concrete walls everywhere — minimal run-off, walls define the racing corridor.
- Aggressive red-and-white kerbs at every chicane and the hairpin.
- Hairpin spectator rank: outside GS 15 / 21 / 24 (Lance Stroll = **GS 24**, not 21) + inside GS 34.

## 6. Modelling notes
- Lead with the contrast of **grey tarmac + pale walls against green park and blue water** — that read says Montreal instantly.
- Place the long flat **teal Olympic Basin plane** (`COL.basinTeal`) along the Casino Straight and as the river surround.
- Keep the whole island dead flat; use wall proximity and chicane kerbs, not elevation, for drama.
- Dot green cube-canopy trees and grass strips between walls to sell the island-park setting.
- Make the **Wall of Champions** a tall pale hero wall at s≈0.955–0.99 R with a Québec-blue painted panel (no glyphs).
- Casino = Expo 67 French-pavilion mass, built as a stepped 4-tier stack ~44 m tall (supersedes the earlier ~25–35 m note: a 30 m mass vanishes at the 95 m gap this site needs; height is a styling choice, unverified against the real pavilion) — not a glass skyscraper. Glint prisms must sit clear of the façade (flatCoplanar).
  Placement: the footprint (plinth 72 x 58 m + 21 x 36 m annex) cannot fit the 70 m terrain ribbon, so it stands at s 0.274, gap 95 m, mostly on
  the grass floor (its inboard edge touches the ribbon); nothing may stand on the `montreal-river-*` water bands (s 5/16–11/16 on this side). Verified headless: a 3 m grid over the footprint hits 0 water-mesh samples.
  Evidence: Wikipedia places the casino on Île Notre-Dame beside the Olympic Basin; the exact bearing/distance is UNVERIFIED (the def's OSM trace is the circuit only, no building footprint).
- Background skyline (distant grey tower boxes) and the Biosphère hemisphere across the water give the island scale and identity.

## Wave 6 — sourced vs uncertain (2026-09-29)

**Sourced / built as fact**
- Circuit: 4.361 km, 14 turns, Île Notre-Dame, L'Épingle (T10), Casino Straight, Wall of Champions on final-chicane exit — [Wikipedia: Circuit Gilles Villeneuve](https://en.wikipedia.org/wiki/Circuit_Gilles_Villeneuve), [formula1.com circuit guide](https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-circuit-gilles-villeneuve.5RUqO9YE80jmCiuODWNX9g).
- Hairpin stands GS 15/21/24 outside + GS 34 inside — [grandprixgrandtours.com Canada guide](https://www.grandprixgrandtours.com/canada-circuit-guide/), [motorsporttickets.com grandstand guide](https://motorsporttickets.com/blog/where-to-sit-for-canadian-grand-prix/).
- GS 24 is the Lance Stroll Grandstand (named opposite GS 21) — same guides; [canada.gp Grandstand 21](https://www.canada.gp/en/ticket-info/grandstand-21) lists "Grandstand 24 (Lance Stroll Grandstand)" in the neighbouring-stands nav.
- GS 16 opposite Main = Wall of Champions / pit entry — grandprixgrandtours.com.
- Biosphère: 76 m diameter, 62 m high geodesic dome on Île Sainte-Hélène — [Wikipedia: Montreal Biosphere](https://en.wikipedia.org/wiki/Montreal_Biosphere), [ArchDaily](https://www.archdaily.com/572135/ad-classics-montreal-biosphere-buckminster-fuller), [Canadian Encyclopedia](https://thecanadianencyclopedia.ca/en/article/montreal-biosphere).

**Uncertain / not asserted as fact**
- Biosphère bearing from the hairpin is a **sight-line**, not adjacency — the dome is on the neighbouring island; placement stays on the far-bank strip at s≈0.30.
- Exact 2026 seat counts / roof coverage per GS number — stands are stepped open banks, not surveyed bay-for-bay replicas.
- Whether any stand is still marketed under a sponsor name in a given season — we use the published GS numbers above, not ephemeral sponsor titles.

## Research pass — Expo setting

The circuit is on **Île Notre-Dame**, an artificial island in the St Lawrence
built for **Expo 67**, inside Parc Jean-Drapeau. That origin is the key to the
setting — everything around it is either Expo-era architecture or a rowing
venue, not a normal paddock landscape:

- **The Olympic Rowing Basin** (1976) runs alongside the circuit — the largest
  artificial rowing basin in North America. Long, dead-straight, still water.
- **The Biosphère** — Buckminster Fuller's geodesic dome from Expo 67, on the
  neighbouring Île Sainte-Hélène. A steel sphere lattice with nothing else like
  it on the calendar.
- **Casino de Montréal** — the former French and Quebec Expo 67 pavilions,
  right on Île Notre-Dame.
- **Downtown Montreal's skyline** across the St Lawrence.
- Parc Jean-Drapeau is **lush gardens and public artworks**, so the infield
  should read as landscaped parkland rather than service compound.

## Outcome

Built required landmarks: `montreal-hairpin-grandstands`, `montreal-wall-of-champions-stand`,
`montreal-biosphere`, `montreal-casino`, plus earlier `montreal-calder-trois-disques`, `montreal-habitat67`,
and the casino footbridge pair.

**Calder's *Trois disques* (1967)** — commissioned for Expo 67, formally
*Trois disques*, universally called *L'Homme*. Parc Jean-Drapeau is full of
public art and the circuit had none of it; this is the piece that is a landmark
in its own right. It stands on the Île Sainte-Hélène side, so it reads across
the water. Two things make it recognisable and both are easy to get wrong:
- It is built from **flat plates splaying outward from a narrow waist**. With
  no arbitrary-axis rotation available, each leg is stepped outward as it
  descends; at this distance the stagger reads as a lean.
- It is **unpainted stainless steel** — *not* the vermilion or black most
  Calder stabiles wear. A red one here would be the wrong sculpture.
- The three discs are flat cylinders standing on edge, with the basis permuted
  so they read as plates rather than drums.

**The Jardins des Floralies** — the infield of Île Notre-Dame is not service
compound, it is a formal ornamental garden laid out for the 1980 Floralies
Internationales, with canals, footbridges and massed bedding. The thing that
must read is that the planting is **geometric**: rectangular parterres in
blocks of single strong colour, edged in clipped green, on gravel walks.
Scattered bushes would say *park*; blocks say *Floralies*.

## DETAIL pass — 2026-10-05 (sheet-04)

Local densify only (no shared `city.js` / water core / `flatTerrain` change):
- Closed pit-end shells at garage-row entry/exit (RAW `seat.box`; modelGroups are superseded by the pit complex).
- Olympic Basin near-shore lip + quay kerb + sparse reeds (local waterBand/boxes).
- Island midfield: service paths, low park sheds, tree/bush variety, casino plaza cue.
- Hairpin stand end fascias + Canadian GP billboards; S/F bay `endWalls` where missing.

