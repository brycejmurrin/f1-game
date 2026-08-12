# Silverstone Circuit (UK) — Visual Design Brief

**Setting:** DAY · Green theme (English countryside)

## 1. Setting
Silverstone sits on a former WWII RAF bomber airfield (RAF Silverstone, opened 1943) straddling the Northamptonshire/Buckinghamshire border, 16 km SW of Northampton. The classic triangular concrete runways still echo in the track outline. It is flat, open farmland: wide grass infield, hedgerow-divided fields, scattered tree copses (Chapel Copse, Cheese Copse), and the village of Silverstone nearby. Expansive, low-rise, agricultural — big sky, few tall structures except grandstands and The Wing.

## 2. Atmosphere & palette
Variable British summer sky: pale grey-blue overcast (`ATM.britishOvercast`), soft diffuse light — not harsh.
- Sky / overcast: `[0.55, 0.62, 0.72]` zenith → `[0.72, 0.76, 0.82]` horizon
- Grass / verges: `[0.16, 0.40, 0.18]` lush English green
- Airfield runoff aprons: `[0.48, 0.46, 0.42]` gravel-asphalt
- Tarmac track: `[0.22, 0.22, 0.24]` dark grey
- Tree copses / hedgerows: `[0.12, 0.36, 0.16]` deep green
Light ground fog; gentle distance haze fading greens toward grey.

## 3. Elevation
Very flat — total change ~15–20 m. Subtle dips around Abbey/Farm (s≈0.55) and a slight rise through Maggotts/Becketts (s≈0.10–0.15). Treat as near-level; use gentle grade only, no dramatic climbs.

## 4. Landmarks & surroundings by lap position
S=0.0 at start/finish on the National pit straight; racing direction into Copse.

| Landmark | s | Side | Dist | Box-modelling note |
|---|---|---|---|---|
| Copse corner (fast R) | 0.04 | R | close | Vast `runoffApron`; low grandstand boxes outside |
| Maggotts/Becketts (S-esses) | 0.12 | both | mid | Snaking green verge + `runoffApron` both sides |
| Tree copses (Chapel/Cheese) | 0.15 | L | far | Cluster of tall dark-green cuboids |
| Hangar Straight (open) | 0.18–0.28 | both | mid | Thin forest; barrel WWII hangar silhouettes ~95–112 m |
| Stowe corner (R) | 0.30 | R | mid | Big grey `runoffApron`; grandstand bank |
| Club corner (R) | 0.40 | R | close | Long sweeping kerb; `runoffApron`; tiered seating |
| The Wing (pit/paddock building) | 0.45 | R | close | Long low sweeping white-grey slab, dark glass band, thin roof fin |
| Silverstone Wing grandstands | 0.46 | R | close | Tall stepped seating boxes flanking The Wing |
| BRDC clubhouse | 0.48 | R | mid | Modest pale rectangular building set back |
| Abbey corner (fast R) | 0.55 | R | mid | Wide `runoffApron`; advertising hoarding boxes |
| Hedgerow-divided fields | 0.60 | both | far | Long low green strips gridding flat farmland |
| Village / The Loop (hairpin) | 0.66 | L | mid | Tight kerbed apex; small grandstand |
| Brooklands / Luffield | 0.85 | L | mid | Sweeping kerbs, low grass banks, seating |
| Woodcote (pre-S/F) | 0.95 | R | close | Pit-wall boxes, start gantry overhead |

## 5. Track features
Fast, flowing, high-speed flat-out sweeps (Copse, Maggotts/Becketts, Abbey) define the character. Generous red/white sawtooth kerbs at every apex, plus extra "sausage" kerbs. Vast paved grey run-off aprons (`runoffApron`) at Copse / Maggotts / Stowe / Club / Abbey — former airfield space, wide and forgiving. Hangar Straight stays open (thin forest 0.18–0.28) with mid-distance barrel hangar silhouettes.

## 6. Modelling notes
- Keep it FLAT and OPEN: low horizon, broad green verges, minimal vertical clutter.
- Lead with lush grass via `ATM.britishOvercast` — pale overcast sky + green aprons framing dark tarmac.
- Hangar Straight: cull dense outfield forest 0.18–0.28; place barrel hangars at mid-distance so they read as silhouettes.
- The Wing is the signature: one long low white-grey slab with a dark glazing band, far longer than it is tall.
- Repeat red/white kerb boxes (`[0.85,0.15,0.15]` / `[0.92,0.92,0.92]`) at every apex.
- Scatter dark-green copse clusters and thin hedgerow strips to grid the distant fields.
- Pale grey overcast sky and soft fog in hollows; mute distant greens toward grey for depth.

## 7. Research pass — the campsites

Silverstone was already dressed with the airfield inheritance (The Wing, the
hangar-line on Hangar Straight, the old runways, the museum, farm buildings,
silos and hedgerows). The gap research turned up was **the weekend itself**.

The British Grand Prix is a camping festival with a race attached. Woodlands,
Whittlebury and the rest put tens of thousands of people in the fields around
the circuit, and from the track the outfield horizon is tents, caravans and
flags. Dressing the outfield only in farmland is correct for a Tuesday in
February and wrong for race weekend — it left every wide shot looking like an
empty airfield.

Four fields are modelled, sited where the real ones sit relative to the lap:

| s | Side | Gap | Field |
|---|---|---|---|
| 0.055–0.135 | R | 138 m | Copse / Maggotts side |
| 0.300–0.395 | L | 152 m | Hangar Straight / Stowe — **Woodlands** |
| 0.470–0.560 | R | 146 m | Vale / Club overflow |
| 0.760–0.860 | L | 134 m | Brooklands / Luffield — **Whittlebury** |

Modelling rules that matter:
- **Beyond the farmland band** (gap 130–210), so the hedgerow/field structure
  still reads first and the campsites sit on the horizon where they belong.
- **A ridge tent is one prism.** That is the whole budget argument — ~780 tents
  across four fields costs ~17 k verts. Caravans (with pull-out awnings) are
  ~14 % of pitches, and each field gets one white catering marquee, which is
  what distinguishes an organised site from a lay-by.
- **Pitch spacing is in metres, not nodes.** A first cut derived the column
  count from the node count and put one column every ~90 m — 30 tents per
  field, which reads as a lay-by. `span * n * ds` is the field's arc length.
- Note `terrainOuter` is 110 m here, so these sit outside the rendered ribbon
  (as the existing far hedgerows at 150–165 m already do). The ⚠ terrain step
  the survey flags at 110 m on frac 0.35 is **pre-existing** — the ribbon's
  outer edge — not caused by the campsites.
