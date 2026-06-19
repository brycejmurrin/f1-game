# Marina Bay Street Circuit — Singapore

**Setting:** NIGHT race · **Theme:** street_night

## 1. Setting
A floodlit night street race threading the public roads around Marina Bay in downtown Singapore. Cars run anticlockwise past harbourside boulevards, low road bridges, and a wall of illuminated skyscrapers reflected in black bay water. Dense, humid, neon-soaked, and hemmed in by concrete barriers on every side.

## 2. Atmosphere & palette
Near-black sky `[0.02, 0.02, 0.06]` with no stars (light pollution). Buildings glow as grids of lit windows in cool blues/whites `[0.6, 0.7, 0.95]` accented by saturated neon signage (magenta, cyan, amber). Track surface is bright under warm floodlights `[1.0, 0.92, 0.7]`. Add faint warm haze near lights to read as tropical humidity. Bay water is a dark mirror catching colored reflections `[0.05, 0.08, 0.15]`.

## 3. Elevation
Essentially flat (sea-level reclaimed land). Only gentle ramps: a slight rise/dip crossing Anderson Bridge (~s 0.62) and the underpass beneath the Benjamin Sheares Bridge (~s 0.10). No meaningful gradient elsewhere.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box-modelling description |
|------|------|----------|----------------------------|
| 0.00 | both | near | Pit straight: low pit building L, grandstand R as stepped box rows |
| 0.06 | L | mid | CBD skyscrapers, tall lit-window boxes clustered behind barrier |
| 0.10 | both | near | Dark flat overpass box (Sheares Bridge) cars pass under |
| 0.18 | R | far | **Marina Bay Sands**: 3 tall leaning slab boxes + one long flat "skypark" box bridging their tops |
| 0.26 | R | far | **Gardens by the Bay Supertrees**: cluster of slim tapered cones, magenta/violet glow caps |
| 0.34 | L | mid | Mixed mid-rise hotel boxes, bright billboard panels (emissive quads) |
| 0.45 | R | far | Open bay water gap; distant skyline box band on horizon |
| 0.55 | L | near | **Fullerton Hotel**: wide low classical block, warm uplit `[1.0,0.85,0.55]` |
| 0.62 | both | near | **Anderson Bridge**: pale arched truss boxes flanking road over river |
| 0.66 | L | mid | **Esplanade theatre**: two spiky dome boxes (faceted/low-poly) |
| 0.70 | L | mid | The Padang: dark flat open box (field) behind low rail |
| 0.80 | R | mid | **Helix Bridge**: white spiraling lattice tube box arcing over water |
| 0.86 | R | near | **Singapore Flyer**: large vertical ring box (Ferris wheel), rim lit cyan `[0.4,0.8,1.0]` |
| 0.92 | both | near | Illuminated billboards + barrier walls funnel back to start |

## 5. Track features
Tight 90-degree street corners and slow left-right-left complexes (Sheares T1-3). Bumpy, low-grip asphalt over road seams. Unforgiving concrete barrier walls right at the edge everywhere; bright sawtooth kerbs (red/white box strips). One long straight (post-2023) replaces the old final chicane. Section runs under a grandstand near the lap's end.

## 6. Modelling notes
- Build a continuous **barrier wall** of grey boxes on both sides — the defining street-circuit element; never leave open runoff.
- Skyline = layered bands of tall boxes at varying depths; vary height/width and stipple lit-window emissive faces for a city wall.
- Treat hero landmarks as silhouettes: Sands = 3 slabs + cap, Flyer = ring, Supertrees = cones, Helix = curved tube. Recognizable by shape alone.
- Lean hard on **emissive faces** (windows, signage, kerbs, floodlight pools) against the dark sky — light, not texture, sells the night.
- Keep ground/sky nearly black so colored boxes pop; mirror a few bright reflections onto bay-water boxes (s 0.18–0.45, 0.80–0.86).
- Punctuate straights with tall emissive **billboard quads** in shifting neon hues.
