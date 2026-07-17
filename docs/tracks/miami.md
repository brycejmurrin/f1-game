# Miami International Autodrome — Visual Design Brief

**Setting:** DAY race · theme `modern` · ~5.41 km, 19 corners, clockwise.

## 1. Setting
A purpose-built temporary circuit wrapping the Hard Rock Stadium (home of the Miami Dolphins) on a closed campus in Miami Gardens, Florida. The lap threads stadium parking lots, perimeter roads, and engineered sections, with the great stadium bowl as a constant visual anchor on the north side by the pit/paddock complex. Pure South Florida spectacle: yachts, palms, and bright pastels under a hazy tropical sky — not downtown South Beach Art Deco on-site.

## 2. Atmosphere & Palette
Bright, high-sun daylight with a soft humid haze flattening the horizon. Lush palm greens, sun-bleached concrete, and vibrant Miami pastels (teal, coral, flamingo pink) against deep blue sky. Signature **Dolphins aqua runoff** under every heavy-brake apron.
- Sky: zenith `[0.22, 0.50, 0.88]`, haze horizon `[0.80, 0.86, 0.90]`
- Asphalt: `[0.28, 0.28, 0.30]`
- Palm green: `[0.20, 0.55, 0.25]`
- Runoff (aqua): `[0.12, 0.72, 0.78]` (`COL.aquaRunoff`)
- Miami pastels: teal `[0.20, 0.80, 0.78]`, coral `[1.0, 0.55, 0.45]`, pink `[1.0, 0.65, 0.80]`

## 3. Elevation
Essentially flat (built on level reclaimed land). The only real change is the engineered tech sector under the Florida Turnpike overpasses (~s 0.62–0.72): the track dips under two bridges, then rises ~11 ft over a crest in the T14–15 chicane before dropping back to T16. Model as a flat plane everywhere except a single subtle hump centred under the overpasses (~s 0.66).

## 4. Landmarks & Surroundings by Lap Position

| s (0–1) | Side | Distance | Box-model description |
|---------|------|----------|------------------------|
| 0.00 | R | near | Hard Rock Stadium: huge curved bowl — tiered grey-white ring, coral/teal rim + aqua accent stripe, tall flood masts |
| 0.00 | L | near | Pit/paddock buildings: long low flat white box block, glass-grey faces |
| 0.06 | R | mid | T1 grandstand: tiered seating box with bright multicolor crowd flecks |
| 0.06–0.96 | both | near | Aqua runoff aprons at brake zones (Dolphins identity under the car) |
| 0.15 | both | near | Concrete barriers + debris fence: continuous low grey box wall |
| 0.20 | L | mid | Palm tree cluster: thin brown box trunks topped with green fan-blob boxes |
| 0.30 | R | near | Mia Marina (T5–9): flat painted vinyl "water" slab with a few large white yacht boxes |
| 0.32 | R | near | MSC Yacht Club: multi-deck white hospitality mass (~50 ft / ~80 m) with teal/coral glass bands + helipad |
| 0.45 | L | mid | Stadium-lot grandstands + tropical-pastel hospitality cubes + car-park lots |
| 0.52 | R | mid | Hard Rock Beach Club (T11–13): sand deck, teal pool, DJ cabana, parasols |
| 0.50 | R | mid | Palm rows + low signage boxes lining the T11 braking zone |
| 0.635 | both | near | Florida Turnpike overpass: grey concrete deck box spanning the track (drive-under) |
| 0.685 | both | near | Second overpass + crest: angled grey deck box over the T14–15 chicane hump |
| 0.78 | L | mid | Back-straight grandstands: long tiered box bank, dense crowd flecks (DRS zone) |
| 0.90 | L | mid | Paddock/team-building cluster: clean white modern box blocks, flat roofs |
| 0.96 | both | near | Final-corner barrier walls + kerbs flanking the run to S/F |
| far | — | horizon | Soft hazed downtown skyline (secondary to stadium — campus first) |

## 5. Track Features
- **Fast straights / DRS:** pit straight (s 0.00), the run off T8 to the T11 braking zone (~s 0.42–0.52), and the long T16→T17 straight (~s 0.72–0.80) — widest, longest box corridors.
- **Marina complex (T5–9, ~s 0.27–0.38):** triple-apex left-hand sweep hugging the fake marina + MSC Yacht Club hero.
- **Tech section under the bridges (T13–16, ~s 0.60–0.72):** tight, twisty, low-grip box chicane with the overpass dip and crest — the signature awkward sector.
- **Kerbs:** red/white striped low boxes at every apex; aggressive sausage kerbs at the chicane.
- **Walls:** continuous concrete barrier boxes — temporary-circuit feel, minimal run-off in the tech sector.

## 6. Modelling Notes
- Hero landmark is the Hard Rock Stadium: oversize the curved bowl as a tiered box ring at S/F so the track reads as "Miami" instantly; downtown skyline stays far/hazed.
- Sell the gimmick marina: a flat blue-tinted slab (no reflection) with one MSC multi-deck mass + a few large yacht boxes — the joke is they obviously aren't floating.
- Aqua runoff under the car is the chase-cam identity cue — `pal.runoff` + `runoffApron` pads at brake zones.
- Beach Club belongs at T11–13 (not early infield).
- Keep it bright and saturated: high-key daylight, pastel hospitality cubes, vivid palm greens; fade far boxes into the pale haze band for tropical depth.
- Palms are cheap and everywhere: thin trunk box + green fan-blob, scattered in rows along straights and the marina.
- Use the overpass decks as the only vertical drama — grey concrete boxes spanning overhead with a subtle track hump beneath.
- Contrast clean modern white paddock/stadium boxes (geometric, flat-roofed) against the lush organic palm greenery.
