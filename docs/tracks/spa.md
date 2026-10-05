# Circuit de Spa-Francorchamps — Visual Design Brief

**Setting:** DAY, green theme (Ardennes forest). 2025 FIA layout: 7.004 km, 19 numbered corners, clockwise; the game currently has 20 curated markers.

## Accuracy references and placement limits

The [official circuit overview](https://www.spa-francorchamps.be/en/the-circuit)
shows rolling wooded Ardennes terrain. Backdrop relief and colors should follow
that character; the procedural mountain emitter still classifies its upper
faces as rock even when their color is forest green. Mixed broadleaf/conifer
woodland should replace existing placements, with bounded deterministic recipes.

The [Spa Grand Prix seating guide](https://www.spagrandprix.com/en/news/16_where-to-sit-at-the-belgian-grand-prix)
and [ELMS's January 12, 2022 report](https://www.europeanlemansseries.com/en/news/all-change-at-spa-francorchamps-61df2080cd561e2412cb7b04/11259)
identify the permanent covered Raidillon stand. The current scenery registers
the Gold 3 stand row at authored fractions .142/.154/.166 on the outside-right
of the descent, with its jumbotron at .159 and a grass spectator bank spanning
.146–.170. These correspond approximately to racing fractions .10–.13. The
inside-left Raidillon terrace is authored at .200 (racing about .158), and the
brook follows authored .176–.191 through the valley. The earlier Gold 3 calls
at .075/.085/.105 placed the stands near rendered La Source and are obsolete.
This registration follows the game's road trace and new valley profile; stand
dimensions, roof form and spectator banks remain artistic approximations,
not independently surveyed footprints.

The 2025 FIA event map lists 7004 m and 19 corners; the game retains 20 curated
markers. The current source describes its 64-knot elevation profile as a fit
to SRTM 30 m samples of the imported road trace, with canopy smoothing and an
authored Raidillon climb. That coarse fit improves the valley registration;
it does not establish surveyed grades or exact trackside elevations. Confirm
plan scale, road heights and landmark footprints independently before making
survey-level accuracy claims.

Spa opts into `terrainFalloffStart: 54` at its existing 90 m terrain-ribbon
width. Beyond 54 m from the road edge, the shared surface profile distributes
the descent toward the distant floor across the remaining ribbon instead of
reserving it for the final 18%. The near-road profile, lateral rail count,
pit flattening and 64 road-elevation knots remain unchanged. This is a bounded
visual terrain approximation, not an off-track survey. The 54 m start preserves
the middle foreground pine ranks; nearby road-channel
clipping still takes precedence and can leave steep faces at crossing legs.
Wider ribbons require separate grounding and overlap measurements.
Existing campsite units and chalets sample their own footprints when seating
on this terrain. Raised floors carry stone supports down to the hillside,
and their declared bounds include each complete support and embedded foot;
locations, colors and campsite layouts remain authored approximations.
The La Source campsite moves from authored .075 to .065, keeping its 40 m
gap, side and eight-unit layout. Its original .075 source node still keys
unit choices, colors and IDs. This bounded clearance adjustment keeps the
units outside the nearby road's footprint; the location is an authored
estimate, not a surveyed campsite position.

The two existing mixed Pouhon belts opt into lobed broadleaf crowns, limited
to 30 accepted substitutions per side. Their pine fraction, height ranges,
spacing and placement hashes stay unchanged; rejected or excess candidates
use the legacy tree. The existing Blanchimont marshal shelter opts into
opaque structural detail within its original placement and envelope. These
are procedural detail pilots, not surveyed species or building reconstructions.

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
Approximately 102 m of real-world relief is a defining feature. The current
source intends about 101 m of relief; the positions below are approximate
**racing-lap fractions**, distinct from the authored scenery fractions in §4.

- s≈0.035: La Source, followed by the descent toward the valley floor.
- s≈0.14: **Eau Rouge** low point; **Raidillon** climbs toward its blind crest around s≈0.165. The source targets a peak grade near 18% with an authored climb.
- s≈0.165–0.36: **Kemmel** rises toward the Les Combes summit.
- s≈0.36–0.71: rolling descent through Bruxelles and Pouhon to the Stavelot low area.
- s≈0.71–1.00: climb back through Blanchimont and Bus Stop to start/finish.

## 4. Landmarks & surroundings by lap position

This table uses **authored scenery fractions**. Updated valley entries describe
the current placement; the remaining visual brief is not a surveyed map.

| s | Side | Distance | Box description |
|------|------|----------|-----------------|
| 0.00 | L | near | Modern pit/paddock: long low white-grey box, repeated garage bays |
| 0.00 | R | mid | Main grandstand: tiered grey slab box facing pit straight |
| 0.02 | R | near | La Source hairpin grandstand: short steep stack of seat-boxes |
| 0.05 | both | far | Forest ridgelines: jagged green box silhouettes rising on both sides |
| 0.172–0.192 | L | near | Eau Rouge valley wall, brook and service crossing |
| 0.142–0.170 | R | mid | **Gold 3**: roofed stand row, dual-bay jumbotron and grass spectator bank |
| 0.200 | L | mid | Raidillon inside-bank timber terrace |
| 0.10 | L | far | Old pit building: weathered cream/grey long box on the original straight |
| 0.068 | R | near | La Source exit grandstand |
| 0.40 | both | far | Dense forest banks: continuous dark-green box masses hemming the track |
| 0.55 | L | near | Pouhon marshal posts: small orange-capped pole-boxes |
| 0.78 | R | mid | Stavelot run-off + barrier boxes against treeline |
| 0.92 | R | near | Bus Stop grandstand: grey tiered box at the chicane braking zone |
| 0.97 | both | near | Marshal posts: small white/orange boxes flanking pit entry |

## 5. Track features
- Eau Rouge/Raidillon: signature left-right-uphill compression — align the valley and climb with the elevation profile.
- Kemmel: long, gently climbing straight — clean, open, sparse trackside boxes.
- Fast forced forest sweepers (Pouhon, Blanchimont) — wide green walls close to the edge.
- Generous red/white kerbs and grey run-off boxes at corner exits.

## 6. Modelling notes
- Lean on verticality: stack and tilt box rows to read Eau Rouge's climb and the valley dip.
- Crowd the track with tall dark-green forest boxes; the green theme should dominate every horizon.
- Keep tarmac/concrete cool grey, kept dull to sell the damp, overcast mood.
- Use heavier fog and earlier box fade than other tracks to evoke Ardennes mist.
- Cluster grandstand seat-boxes at La Source, Les Combes, Bus Stop, pit straight, and Raidillon Gold 3; keep woodland clear of spectator banks.
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
