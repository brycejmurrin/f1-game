# Miami International Autodrome — Visual Design Brief

**Setting:** DAY race · theme `modern` · ~5.41 km, 19 corners, clockwise.

## 1. Setting
A purpose-built temporary circuit wrapping the Hard Rock Stadium (home of the Miami Dolphins) on a closed campus in Miami Gardens, Florida. The lap threads stadium parking lots, perimeter roads, and engineered sections, with the great stadium bowl as a constant visual anchor on the north side by the pit/paddock complex. Pure South Florida spectacle: yachts, palms, and bright pastels under a hazy tropical sky.

## 2. Atmosphere & Palette
Bright, high-sun daylight with a soft humid haze flattening the horizon. Lush palm greens, sun-bleached concrete, and vibrant Miami pastels (teal, coral, flamingo pink) against deep blue sky.
- Sky: `[0.45, 0.70, 0.95]`, haze band near horizon `[0.80, 0.88, 0.92]`
- Asphalt: `[0.28, 0.28, 0.30]`
- Palm green: `[0.20, 0.55, 0.25]`
- Miami pastels: teal `[0.20, 0.80, 0.78]`, coral `[1.0, 0.55, 0.45]`, pink `[1.0, 0.65, 0.80]`

## 3. Elevation
Essentially flat (built on level reclaimed land). The only real change is the engineered tech sector under the Florida Turnpike overpasses (~s 0.62–0.72): the track dips under two bridges, then rises ~11 ft over a crest in the T14–15 chicane before dropping back to T16. Model as a flat plane everywhere except a single subtle hump there.

## 4. Landmarks & Surroundings by Lap Position

| s (0–1) | Side | Distance | Box-model description |
|---------|------|----------|------------------------|
| 0.00 | R | near | Hard Rock Stadium: huge curved bowl faked as a tiered ring of grey-white boxes with coral/teal rim accents |
| 0.00 | L | near | Pit/paddock buildings: long low flat white box block, glass-grey faces |
| 0.06 | R | mid | T1 grandstand: tiered seating box with bright multicolor crowd flecks |
| 0.15 | both | near | Concrete barriers + debris fence: continuous low grey box wall |
| 0.20 | L | mid | Palm tree cluster: thin brown box trunks topped with green fan-blob boxes |
| 0.30 | R | near | Mia Marina (T6–8): flat painted "water" slab `[0.15,0.45,0.60]` with white yacht boxes (hulls + cabin stacks) standing on it |
| 0.32 | R | near | Faux superyacht hospitality: long white multi-deck box with teal-tinted glass band |
| 0.45 | L | mid | Stadium-lot grandstands + tropical-pastel hospitality cubes |
| 0.50 | R | mid | Palm rows + low signage boxes lining the T11 braking zone |
| 0.62 | both | near | Florida Turnpike overpass: grey concrete deck box spanning the track (drive-under), pillar boxes flanking |
| 0.67 | both | near | Second overpass + crest: angled grey deck box over the T14–15 chicane hump |
| 0.78 | L | mid | Back-straight grandstands: long tiered box bank, dense crowd flecks (DRS zone) |
| 0.90 | R | mid | Paddock/team-building cluster: clean white modern box blocks, flat roofs |
| 0.96 | both | near | Final-corner barrier walls + kerbs flanking the run to S/F |

## 5. Track Features
- **Fast straights / DRS:** pit straight (s 0.00), the run off T8 to the T11 braking zone (~s 0.42–0.52), and the long T16→T17 straight (~s 0.72–0.80) — widest, longest box corridors.
- **Marina complex (T6–8, ~s 0.28–0.36):** triple-apex left-hand sweep hugging the fake marina slab.
- **Tech section under the bridges (T13–16, ~s 0.60–0.72):** tight, twisty, low-grip box chicane with the overpass dip and crest — the signature awkward sector.
- **Kerbs:** red/white striped low boxes at every apex; aggressive sausage kerbs at the chicane.
- **Walls:** continuous concrete barrier boxes — temporary-circuit feel, minimal run-off in the tech sector.

## 6. Modelling Notes
- Hero landmark is the Hard Rock Stadium: oversize the curved bowl as a tiered box ring at S/F so the track reads as "Miami" instantly.
- Sell the gimmick marina: a flat blue-tinted slab (no reflection) with crisp white yacht boxes standing on it — the joke is they obviously aren't floating.
- Keep it bright and saturated: high-key daylight, pastel hospitality cubes, vivid palm greens; fade far boxes into the pale haze band for tropical depth.
- Palms are cheap and everywhere: thin trunk box + green fan-blob, scattered in rows along straights and the marina.
- Use the overpass decks as the only vertical drama — grey concrete boxes spanning overhead with a subtle track hump beneath.
- Contrast clean modern white paddock/stadium boxes (geometric, flat-roofed) against the lush organic palm greenery.
