# Watkins Glen International — Visual Design Brief

**Setting:** DAY, green theme (upstate New York hardwood in autumn). ~5.44 km, 11 turns, clockwise.

## 1. Setting
A hillside above Seneca Lake in the Finger Lakes, home of the United States Grand Prix until 1980. Two things define it. First, the **fall colour**: this is the only circuit in the game where the trees are actively turning, and the scarlet-and-amber hardwood is the whole look. Second, the club-built infrastructure: poured-concrete garages with roll-up doors, an open angle-iron timing tower you can see sky through, and bare timber plank bleachers greyed by upstate winters. The lap's landmarks are the plunging **Esses** and **the Boot**, the long loop added in 1971 that drops away into the woods and climbs back out.

## 2. Atmosphere & palette
Cool clear autumn light with a golden cast. Deep hardwood greens shot through with turning maple and sumac.
- Sky: zenith `[0.28, 0.46, 0.72]`, horizon `[0.76, 0.74, 0.66]`; sun `[1.0, 0.93, 0.76]`
- Fog `[0.72, 0.72, 0.68]`; grass `[0.20, 0.42, 0.19]`
- **Turning maple** `[0.62, 0.24, 0.12]`, scarlet `[0.70, 0.31, 0.10]`, amber `[0.72, 0.50, 0.14]`, oak `[0.48, 0.33, 0.15]`
- Unturned leaf `[0.20, 0.42, 0.19]` / `[0.15, 0.34, 0.16]`; dark conifer behind `[0.10, 0.26, 0.14]`
- Grey maple bark `[0.35, 0.32, 0.30]`; weathered timber `[0.46, 0.36, 0.26]` / greyed `[0.56, 0.54, 0.50]`
- Gravel `[0.66, 0.61, 0.48]`

## 3. Elevation
Large — the circuit runs over a hillside and the Boot is a descent and a climb in one.
- s≈0.11: **9 m climb** out of Turn 1.
- s≈0.30: **12 m drop** down through the Esses.
- s≈0.52: 8 m further down into **the Boot**.
- s≈0.70: **13 m climb** back out of it — the biggest single rise on the lap.
- s≈0.90: 5 m drop to the front straight.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.98 | R | near | **Pit garages**: poured concrete, corrugated roll-up doors with guide rails, flat roof with a parapet and pipe rail — the roof IS the timing stand. No glass, no cladding |
| 0.999 | R | near | **Timing tower**: four legs of angle iron, X-braced all the way up, plywood observation cabin bolted near the top. Open — you see sky through it |
| 0.93–0.96 | R | far | Paddock tech sheds: low, wide, open-sided, bare |
| 0.955–0.045 | L | near | Sponsor hoarding down the front straight |
| 0.00–0.15 | both | near | Bare **timber plank bleachers** on raked post pairs, no roof and no back wall, a guard rail across the back |
| 0.090 | R | near | Turn 1 / the 90: gravel apron + red tyre wall |
| 0.20–0.30 | R | mid | Grass crowd bank above the Esses |
| 0.245 | L | near | **The Esses** gravel + blue tyre wall; 4.5° camber through the drop |
| 0.24–0.34 | both | near | Front rank of **turning sugar maple** — broad lobed low crowns of scarlet on pale grey trunks; staghorn sumac along the verge, the loudest orange in the woods |
| 0.365 | — | over | Timber-and-steel **footbridge** over the circuit on concrete piers |
| 0.45–0.48 | — | — | Entry to **the Boot**, pinched to 6.2 m |
| 0.50–0.60 | L | mid | Crowd bank on the Boot's outside |
| 0.615 | R | near | Toe of the Boot gravel; 3.5° camber |
| 0.72–0.80 | R | mid | Crowd bank on the climb out |
| 0.62/0.74 | both | far | **Woodland camps**: ridge tents and a couple of period trailers in clearings — the Glen's crowd famously camped in the trees |
| 0.900 | L | near | **The Anvil**: gravel apron + yellow tyre wall, 4° banked onto the front straight |
| — | ring | far | Finger Lakes hills: wooded, rolling, closing the horizon in every direction |

## 5. Track features
- The **Esses**: a fast downhill left-right sequence with real camber — the corner the circuit is known for.
- **The Boot**: a long descending-then-climbing loop through the woods, narrowest part of the lap.
- Real gravel and real armco throughout; the crowd stood on banks rather than in stands for most of the lap.
- Wide, old-surface tarmac; kerbs modest, nothing modern or sausage-shaped.

## 6. Modelling notes
- Build the front rank of maples explicitly: three overlapping off-axis lobes in scarlet/amber on a pale grey trunk. The generic twin-cone tree reads as a summer shade tree, which defeats the whole brief. Deeper ranks can stay cheap.
- Mix, don't uniformly recolour: turned scarlet and amber against unturned green with dark conifer behind. A wholly orange forest looks like a filter, not a fall.
- Everything built here is a public-works building that races happen to be run from — concrete, angle iron, plywood, weathered lumber. No glass and no cladding anywhere.
- Stands are open bare timber. Sky through the frame and grey weathering are the point.
- Exaggerate the Esses drop and the climb out of the Boot; those two moves carry the circuit.
- Scatter the woodland camps in clearings well off the racing line — informal, not laid out.


## Research pass — verified, already covered

The Finger Lakes setting is modelled — maples, autumn colour, the lake, Seneca, barns, The Boot. The Watkins Glen gorge is in the state park in town, not visible from the circuit on its hilltop, so it does not belong trackside. **Nothing added.**
