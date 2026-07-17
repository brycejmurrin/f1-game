# Hungaroring — Visual Design Brief

**Mode:** DAY · **Theme:** GREEN (hilly amphitheatre) · 4.381 km, 14 turns, run clockwise.

## 1. Setting
A tight, twisty permanent circuit carved into a natural valley basin in the dusty hills outside Budapest. The track snakes along the valley floor and up its grassy slopes, with spectator hills forming a continuous natural amphitheatre. "Monaco without the walls" — slow, technical, hemmed in by green banking rather than barriers. Open sky, low tree lines, sun-baked grass.

## 2. Atmosphere & palette
Hot, hazy summer afternoon. Pale washed-out blue sky, strong overhead sun, dry heat shimmer. Grass hills are dry straw-olive, not lush lawn — `ATM.dustyBowl`: grass `[0.42, 0.40, 0.22]`, runoff `[0.58, 0.50, 0.34]`, fog `[0.72, 0.68, 0.55]`. Amphitheatre banking stays slightly greener G-dominant (`[0.48, 0.54, 0.28]`) so mounds still read as rounded hills. Tarmac dark; kerb red/white and white walls pop against straw.

## 3. Elevation
Undulating valley, ~36 m total relief (authored cosine bumps ≈38 m peak-to-trough). Start/finish sits high on a plateau (`rise: +14` at s≈0); the lap plunges DOWN into the basin at Turn 1 / T2–4 (`rise: −22` at s≈0.12). Gradual CLIMB back up through the twisty middle sector, cresting near Turns 10–11 (`rise: +16` at s≈0.52), then rolling home.

## 4. Landmarks & surroundings by lap position

| s | Side | Distance | Box-model description |
|------|------|----------|------------------------|
| 0.00 | L | near | New (2024) pit building: long low white/grey slab boxes, tiered VIP terrace stacked on top |
| 0.00 | R | near | Main grandstand: big covered stepped wedge, dark roof box over pale tiered seating |
| 0.02 | L | near | Pit wall + garage row: thin white box strip with red kerb trim |
| 0.06 | R | mid | Turn 1 downhill braking zone: tall stacked spectator banking, green stepped boxes |
| 0.08 | R | far | Small lake/pond in the valley floor: flat dark blue-green box below banking |
| 0.12 | L | mid | Grass amphitheatre hill, sun-bleached green, dotted dark tree-cube clumps |
| 0.18 | R | mid | Low grandstand bleacher: pale tiered box facing the slow complex |
| 0.30 | L | far | Tree line mass: cluster of dark green cubes along ridge |
| 0.40 | R | mid | Mid-sector grass banking, spectator hill with sparse stand boxes |
| 0.55 | L | mid | Twisty-sector grandstand: small stepped seating wedge |
| 0.62 | R | far | Crest tree clumps + distant haze-tinted hill boxes |
| 0.75 | L | mid | Open grass run-off bank, dry yellow-green slope |
| 0.90 | R | mid | Approach grandstand: tiered box leading back to the line |

## 5. Track features
Famously twisty and slow with very few overtaking spots — pole and clean air dominate. The downhill heavy-braking Turn 1 right-hander is the prime passing zone. A tight low-speed Turn 2–4 complex, then a relentless flowing middle sector of medium corners with no real straights. Aggressive red/white kerbs at apexes and exits; generous grass/asphalt run-off (no walls) ringed by green banking.

## 6. Modelling notes
- Sell the AMPHITHEATRE: line nearly the whole lap with stepped green banking boxes so the track sits in a bowl of grass.
- Use dry yellow-green grass, not vivid lawn — it reads as hot Hungarian summer.
- Make Turn 1 dramatic with a clear DOWN drop and tall banking + a small dark lake box in the basin.
- Cluster dark-green tree cubes along ridge lines for a low forested horizon.
- Anchor s=0 with the bright modern pit slab (L) facing the big covered grandstand wedge (R).
- Keep palette warm and slightly hazy; fade far hills toward the fog tint for depth.

Sources: [Wikipedia](https://en.wikipedia.org/wiki/Hungaroring), [TrackTitan](https://www.tracktitan.io/post/hungaroring-track-guide), [Motorsport.com](https://www.motorsport.com/f1/news/huge-renovation-work-almost-complete-at-hungaroring-ahead-of-f1-hungarian-gp/10734732/), [F1 Technical](https://www.f1technical.net/news/25005), [Driver61](https://driver61.com/circuit-guide/hungaroring/)
