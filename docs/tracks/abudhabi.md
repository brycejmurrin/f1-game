# Yas Marina Circuit — Abu Dhabi, UAE

**Setting:** NIGHT / dusk race · **Theme:** desert_marina_night

## 1. Setting
A showcase circuit on flat, reclaimed Yas Island — a modern leisure-and-marina development out in the desert. Cars run anticlockwise on smooth, wide tarmac through long straights and tight corners, threading past a yacht marina and sliding directly *under* the colour-shifting Yas Hotel near the line. The race starts at dusk and finishes under floodlights: a day-to-night spectacle of warm desert sky over cool LED architecture.

## 2. Atmosphere & palette
Sunset-to-night gradient sky: warm orange-pink low band fading to deep indigo overhead `[0.95,0.45,0.25]` → `[0.06,0.05,0.14]`. Marina water = dark mirror catching warm dock lights `[0.04,0.06,0.12]` with amber speckle. Cool-white floodlit track surface `[0.88,0.92,1.0]`. Warm marina/dock and hotel-base lighting `[1.0,0.72,0.38]`. Hero accent: the Yas Hotel's animated LED shell cycling teal→magenta→amber `[0.2,0.8,0.9]` / `[0.9,0.2,0.7]` / `[1.0,0.6,0.2]`. Ferrari World roof red `[0.85,0.08,0.10]`. Desert sand floor far out `[0.7,0.55,0.35]`.

## 3. Elevation
Essentially **flat** — sea-level reclaimed land, no real gradient. Only camber to note: the banked Turn 9 (~s 0.42) and the swept Marsa curve (~s 0.78). Model as subtle tilt, not hills.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box-modelling description |
|------|------|----------|----------------------------|
| 0.00 | both | near | Pit straight: long low pit-garage box R, tall Main Grandstand box-rows L, gantry over line |
| 0.05 | L | near | Turn 1 left + flowing esses; bright sawtooth kerb strips |
| 0.18 | R | far | **Ferrari World**: huge low red roof box + central white/yellow logo disc, desert behind |
| 0.28 | both | near | **North Hairpin**: tight U-turn ringed by curved North Grandstand box-bank (sun-tower stand) |
| 0.34 | both | near | Long back straight: thin LED light-tower boxes (dark pole + bright cap) at intervals |
| 0.42 | L | near | Banked Turn 9 cambered tarmac; runoff + grandstand boxes |
| 0.55 | R | mid | **Marina opens**: flat dark water box, rows of slim white yacht-hull boxes + mast spikes |
| 0.62 | R | mid | **Marina Hotel**: mid-rise lit-window slab box, warm uplighting at base |
| 0.70 | R | near | Marina-side grandstand + amber dock-lamp dot row reflecting on water |
| 0.78 | L | near | **Marsa swept curve**: long gentle box-chain, cool kerbs |
| 0.88 | over | over | **W Abu Dhabi Yas Hotel**: twin curved towers L+R joined by a *gridshell arch box straddling the track*, animated colour-shift LED faces |
| 0.95 | both | near | Final left-right under the glow; barriers funnel back to start/finish |

## 5. Track features
Two long straights (a 1km+ run) punctuated by tight hairpins and chicane-tight corners — a stop-and-go rhythm. The signature is the **hotel-straddle**: the Yas Hotel's LED lattice arches *over* the track near the finish. A working **marina** of moored yachts lines the second half (Monaco-vibe). Wide tarmac runoff (not walls) at most corners; crisp red/white sawtooth kerbs throughout.

## 6. Modelling notes
- Make the **Yas Hotel** the hero: two curved tower boxes flanking the track joined by an overhead arch/lattice box, all faced with emissive panels that cycle colour — visible from far out and unmistakable at the line.
- Sell **dusk-to-night** with a vertical sky gradient (warm bottom, indigo top) and lean hard on emissive faces: floodlit tarmac, lit windows, dock lamps, kerbs.
- Build the **marina** as a flat black water box with repeated slim hull boxes + vertical mast spikes and a scatter of warm reflection specks.
- Contrast geometry: long clean straight box-chains vs. abrupt tight-hairpin clusters reads as Yas's stop-go layout.
- Drop **Ferrari World** as one big red roof box + logo disc on the desert side mid-lap; keep the rest of the horizon flat sand under a glowing sky.
- Ring the lap with tall **light-tower boxes** (dark pole, bright cap) to justify the night lighting.
