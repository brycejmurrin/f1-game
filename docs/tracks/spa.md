# Circuit de Spa-Francorchamps — Visual Design Brief

**Setting:** DAY, green theme (Ardennes forest). ~7.0 km, 20 turns, clockwise.

## 1. Setting
Carved into the hilly Ardennes forest of eastern Belgium. Roads thread through dense pine and deciduous woodland on steep terrain. Notoriously changeable weather — often misty, damp, and wet even when one part of the track is dry.

## 2. Atmosphere & palette
Moody, overcast-leaning daylight (`ATM.dampArdennes`). Walls of dark forest green crowding the asphalt, damp grey-blue tarmac and concrete. Heavier fog than most tracks; let distant boxes fade early. **No mountain snowcaps** — summer Ardennes forest hills only.
- Sky/haze: grey zenith/horizon (`[0.42, 0.48, 0.52]` / `[0.58, 0.62, 0.64]`)
- Forest canopy: `[0.10, 0.32, 0.14]` deep, `[0.18, 0.42, 0.20]` mid
- Tarmac: `[0.26, 0.27, 0.29]`; concrete/runoff: `[0.55, 0.55, 0.52]`
- Kerbs: red `[0.78, 0.12, 0.12]` / white `[0.88, 0.88, 0.88]`
- Fog tint: `[0.55, 0.60, 0.62]`, dense (`fogDensity` ≈ 0.0032).

## 3. Elevation
Huge ~102 m total elevation change — the defining feature.
- s≈0.00–0.04: La Source hairpin, then a downhill plunge toward the valley floor.
- s≈0.05–0.09: **Eau Rouge** (left, low point) flicking into **Raidillon** — a steep ~17% climb over a blind crest.
- s≈0.09–0.18: continued climb up the **Kemmel** straight to a high plateau at Les Combes.
- s≈0.18–0.85: rolling descent and climbs through forest corners down to Stavelot, then back up.
- s≈0.85–1.00: fast Blanchimont, drop into Bus Stop, climb back to start/finish.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.00 | L | near | Modern pit/paddock: long low white-grey box, repeated garage bays |
| 0.00 | R | mid | Main grandstand: tiered grey slab box facing pit straight |
| 0.02 | R | near | La Source hairpin grandstand: short steep stack of seat-boxes |
| 0.05 | both | far | Forest ridgelines: jagged green box silhouettes rising on both sides |
| 0.06 | L | near | Eau Rouge: thickened concrete wall at valley base, red/white kerb strip |
| 0.07–0.09 | R | mid | **Gold 3** Raidillon amphitheatre: large dual-bay concrete stand + jumbotron + stepped banking slabs |
| 0.10 | L | far | Old pit building: weathered cream/grey long box on the original straight |
| 0.16 | R | mid | Les Combes grandstand: open tiered box, forest wall directly behind |
| 0.40 | both | far | Dense forest banks: continuous dark-green box masses hemming the track |
| 0.55 | L | near | Pouhon marshal posts: small orange-capped pole-boxes |
| 0.78 | R | mid | Stavelot run-off + barrier boxes against treeline |
| 0.92 | R | near | Bus Stop grandstand: grey tiered box at the chicane braking zone |
| 0.97 | both | near | Marshal posts: small white/orange boxes flanking pit entry |

## 5. Track features
- Eau Rouge/Raidillon: signature left-right-uphill compression — exaggerate the vertical box rise.
- Kemmel: long, gently climbing straight — clean, open, sparse trackside boxes.
- Fast forced forest sweepers (Pouhon, Blanchimont) — wide green walls close to the edge.
- Generous red/white kerbs and grey run-off boxes at corner exits.

## 6. Modelling notes
- Lean on verticality: stack and tilt box rows to read Eau Rouge's climb and the valley dip.
- Crowd the track with tall dark-green forest boxes; the green theme should dominate every horizon.
- Keep tarmac/concrete cool grey, kept dull to sell the damp, overcast mood.
- Use heavier fog and earlier box fade than other tracks to evoke Ardennes mist.
- Cluster grandstand seat-boxes at La Source, Les Combes, Bus Stop, pit straight, and the oversized Raidillon Gold-3 amphitheatre; leave mid-forest sections bare.
- Contrast the modern white pit/paddock box against the lone weathered old pit building for history.
- Pouhon: orange marshal-post cluster on the left; Stavelot: grey runoff apron + tyre/armco against the treeline.

## 7. Research pass — the old circuit, and the village

Spa was already well dressed for the Ardennes (forest walls, the Raidillon
amphitheatre, the old pit building, cabin hamlets, damp overcast palette). Two
things research says belong here that the circuit had no trace of:

**The old course, carrying straight on at Les Combes.** Until 1970 this was a
14 km triangle of public road: the course did *not* turn right at Les Combes,
it went straight on and plunged down through Burnenville and Malmedy to the
Masta kink and Stavelot before climbing back. That road is still there — it is
the N62 — and from the modern right-hander you can see it carrying on into the
trees, narrower and older than the track you are on, with its own armco still
standing. Modelled as a diverging ribbon leaving on the Kemmel tangent while
the racing line turns away, so the two separate naturally over ~230 m: narrow
1960s two-lane asphalt, pale edge lines, period armco on posts (left side only
— the right drops into the trees, exactly as it does now), a stone marker where
the courses part, and forest closing in behind.

**Francorchamps village.** The circuit is named after a village and ran through
it, and the outfield above La Source was cabins and forest. Ardennes building
is unmistakable and cheap to read: rough grey limestone walls under **steep**
dark-slate roofs with deep eaves, small windows, ridge chimneys — and a slate
church spire, the only thing that breaks the treeline from the track.

> **Trap worth recording.** The church is built inside a `modelGroup`, and
> `modelGroup` **fails closed silently** — a rejected or throwing group commits
> nothing and `verify-track` still prints `OK`. The first version called
> `addPyramid` without destructuring it from `api`, so the church simply did
> not exist while every check passed. The tell was the vertex count: adding the
> destructure moved props from 490,538 to 490,664. **Check the vert delta after
> adding scenery** — an `OK` alone does not prove your geometry landed.
