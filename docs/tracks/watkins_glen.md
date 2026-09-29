# Watkins Glen International — Visual Design Brief

**Setting:** DAY, green theme (upstate New York hardwood in autumn). ~5.44 km, 11 turns, clockwise. GP-era Boot layout (`lengthKm` 5.4); do not swap in the NASCAR short-course Bus Stop geometry.

## 1. Setting
A hillside above Seneca Lake in the Finger Lakes, home of the United States Grand Prix until 1980. Two things define it. First, the **fall colour**: this is the only circuit in the game where the trees are actively turning, and the scarlet-and-amber hardwood is the whole look. Second, the club-built infrastructure: poured-concrete garages with roll-up doors, an open angle-iron **2006 control tower** with contiguous officials / timing / broadcast booths, Nazareth Speedway timber stands relocated as the **Pit Terrace**, and bare plank bleachers greyed by upstate winters. The lap's landmarks are the plunging **Esses** (Sahlen hillside spectators) and **the Boot**, the long loop added in 1971 that drops away into the woods and climbs back out.

## 2. Atmosphere & palette
Cool clear autumn light with a golden cast. Deep hardwood greens shot through with turning maple and sumac.
- Sky: zenith `[0.28, 0.46, 0.72]`, horizon `[0.76, 0.74, 0.66]`; sun `[1.0, 0.93, 0.76]`
- Fog `[0.72, 0.72, 0.68]`; grass `[0.20, 0.42, 0.19]`
- **Turning maple** `[0.62, 0.24, 0.12]`, scarlet `[0.70, 0.31, 0.10]`, amber `[0.72, 0.50, 0.14]`, oak `[0.48, 0.33, 0.15]`
- Unturned leaf `[0.20, 0.42, 0.19]` / `[0.15, 0.34, 0.16]`; dark conifer behind `[0.10, 0.26, 0.14]`
- Grey maple bark `[0.35, 0.32, 0.30]`; weathered timber `[0.46, 0.36, 0.26]` / greyed `[0.56, 0.54, 0.50]`
- Gravel `[0.66, 0.61, 0.48]`

## 3. Elevation
Large — the circuit runs over a hillside and the Boot is a descent and a climb in one. Keep real hills; no knife-edge grade spikes.
- s≈0.11: **9 m climb** out of Turn 1.
- s≈0.30: **12 m drop** down through the Esses.
- s≈0.52: 8 m further down into **the Boot**.
- s≈0.70: **13 m climb** back out of it — the biggest single rise on the lap.
- s≈0.90: 5 m drop to the front straight.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.98 | R | near | **Pit garages**: poured concrete, corrugated roll-up doors with guide rails, flat roof with a parapet and pipe rail — the roof IS the timing stand. No glass cladding on the bays |
| 0.999 | R | near | **2006 control tower** (`glen-timing-tower`): four legs of angle iron, X-braced, three contiguous booth cabins (officials / timing / TV) with glass facing the ribbon, PA antenna on the roof. Source: Wikipedia facility rebuild 2006 |
| 0.975 | R | mid | **Pit Terrace** (`glen-pit-terrace`): Nazareth Speedway stands (installed 2005) — scaffold posts + weathered plank rows rising away from the track above the pit lane. Source: Wikipedia; theglen.com facility maps |
| 0.93–0.96 | R | far | Paddock tech sheds: low, wide, open-sided, bare |
| 0.955–0.045 | L | near | Sponsor hoarding down the front straight |
| 0.00–0.15 | both | near | Bare **timber plank bleachers** on raked post pairs, no roof and no back wall, a guard rail across the back |
| 0.090 | R | near | Turn 1 / the 90: gravel apron + red tyre wall |
| 0.20–0.30 | R | mid | **Sahlen Esses hillside** — `spectatorHill` grass bank (positive rise) plus timber `glen-esses-hill` stand. Sources: theglen.com / TheGlenRace.com Sahlen Esses Grandstand |
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
- **The Boot**: a long descending-then-climbing loop through the woods, narrowest part of the lap (GP layout; NASCAR short course omitted).
- Real gravel and real armco throughout; the crowd stood on banks rather than in stands for most of the lap.
- Wide, old-surface tarmac; kerbs modest, nothing modern or sausage-shaped.

## 6. Modelling notes
- Build the front rank of maples explicitly: three overlapping off-axis lobes in scarlet/amber on a pale grey trunk. The generic twin-cone tree reads as a summer shade tree, which defeats the whole brief. Deeper ranks can stay cheap.
- Mix, don't uniformly recolour: turned scarlet and amber against unturned green with dark conifer behind. A wholly orange forest looks like a filter, not a fall.
- Everything built here is a public-works building that races happen to be run from — concrete, angle iron, plywood, weathered lumber. Booth glass on the 2006 tower only.
- Stands are open bare timber or Nazareth scaffold. Sky through the frame and grey weathering are the point. Rows must rise away from the track (positive slope).
- Exaggerate the Esses drop and the climb out of the Boot; those two moves carry the circuit.
- Scatter the woodland camps in clearings well off the racing line — informal, not laid out. Seat tents on local `terrainYAt`; do not lift a whole clearing to its high corner (that floats the fire pit).

## Research pass — sourced vs uncertain

**Sourced (built):**
- 2006 control tower booths for officials / timing / TV / PA — https://en.wikipedia.org/wiki/Watkins_Glen_International
- Nazareth Speedway grandstands installed 2005; Pit Terrace on facility maps — Wikipedia; https://www.theglen.com/facility-maps/ ; https://www.theglen.com/fanguide/
- Sahlen Esses Grandstand / hillside GA — https://www.theglenrace.com/en/grandstands-map-4 ; facility maps
- Boot added 1971; GP length ~5.4 km — Wikipedia; track guide https://racetrackdriving.com/track-guide/watkins-glen/

**UNCERTAIN / do not build as fact:**
- NASCAR short-course Bus Stop geometry — def stays on the GP Boot layout.
- Seneca Lake is not visible from most of the circuit — a distant waterBand backdrop may remain for atmosphere, but do not add a lakeside shore as a trackside landmark.
- Exact booth count / tower storey height — silhouette only; three contiguous cabins are a readable stand-in, not a measured survey.
- Exact Nazareth bay inventory on the Pit Terrace — bay count is compositional.
- Watkins Glen gorge is in the state park in town, not visible from the circuit hilltop — does not belong trackside.
