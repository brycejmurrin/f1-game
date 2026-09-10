# Seeing a livery design — which surface answers which question

A cover design has two failure modes and they need different instruments. It
can fail to SEPARATE from what it lands on (a colour question, per team), and it
can land somewhere nothing will ever see (a geometry question, per design). The
first has been guarded for a while. The second was not, and this is how it is
answered now.

## The colour half is in CI

`tests/unit/cover-legibility.test.mjs` measures the atlas: for every shipped
default it takes the colour covering most of the crown and flank and scores it
against the cover it lands on. That is the half that VARIES per team — team
paint against a `liv.cover` override — and it earned its place by catching a
white saddle on Ferrari's pale cover and teal stripes on Mercedes' silver one,
both already merged, in about a second.

It is blind to PLACEMENT, by construction. Audi's `twin` stripes score 17
against black and are invisible anyway, because they sit on the shoulders where
the cover curves away from a rear three-quarter camera. No colour metric can
see that.

## Shoot the cheapest surface that can answer the question

Placement is a property of the DESIGN, not the team — the geometry is identical
on all twelve cars — so it is answered once per design rather than per livery.
Three surfaces can answer it and the first is ~2000x cheaper than the last:

| question | tool | cost |
|---|---|---|
| where on the flank does this land? | `node tools/car/spine-station.mjs --team=redbull` | 0.2 s |
| does the CAR hide it? | the same, `--occlude` (or `flank-occlusion.mjs` for the map) | 1 s |
| what does the flat art look like? | the same, `--png=artifacts/spine` | 0.3 s |
| does it read at racing distance, lit? | `node tools/shot/garage-angles.mjs --preset=flank --team=redbull --spineSide=logo` (or `--fast --preset=quick`) | ~25 s boot + ~12–18 s a shot (~8 s with `--fast`) |

`spine-station.mjs` replays the real `buildAtlas` into crest-sweep's recording
context and diffs the flank against the same livery wearing `spineSide: "none"`,
so the box it reports is the design's own ink whatever painted it — no
per-design knowledge in the tool, and a new design is measured the day it is
written. `v` is the axis the complaints are about (0 the shoulder crease, 1 the
sidepod line); `u` runs front to rear, which is how you saw a CROWN squeezing a
mark aft without booting anything: `wrap` used to hand the marks u 0.52–0.95,
which is the station the rear tyre eats from a side camera.

Two things the diff CANNOT see, both because of its own premise. The first is a
crown whose flank content depends on `spineSide`: under `wrap` a team with no
traced bull yields its filler badge to the side design, so the base ("none")
carries a badge the design's frame does not, and the diff reports the badge's
REMOVAL as part of the design's ink — measured 0.11 of v low on McLaren. Sweep a
team with a traced bull (`redbull`, `racingbulls`) whenever the crown is `wrap`.

The second is the CROWN's own graphic, which is in both samples and therefore in
no row — the biggest thing on the flank, invisible to the instrument built to
watch the flank. That is the `(crown)` row now: sampled with no side design, so
everything in the region is the crown's, minus the SUN, which is the one thing
the crown paints there that is a field rather than a mark. Translucency is what
tells them apart, and it is the painter's own distinction — the disc goes down
at alpha 0.97 and every mark is opaque. (Filtering on the fill RULE reads
tidier, and silently measured nothing for the two teams whose crest paints
nonzero.) `--team=all` runs one crown across the grid, which is the survey.

Two caveats it prints but you should know before reading a PNG. Lettering
renders as its METRIC BOX, not as glyphs, because that is what the recording
context keeps — exact for placement, silent on legibility. And a team whose
crest is a loaded image draws through `drawImage`, which records no geometry, so
those fall back to the traced crest: the same box, different art.

The vertical half of the question is now in CI. `fin-design.test.mjs` sweeps
every crown x mark and fails at `vMid >= 0.5`, in 123 ms. It reproduces the
2026-09-09 report — `logo/number` centred at v 0.574 — against the pre-fix tree,
which is the only reason to believe it would catch the next one.

## Occlusion is geometry, so it is also offline

`flank-occlusion.mjs` projects the REAL body mesh and the four wheels at their
game.js anchors through one garage camera and asks, per station, whether
anything nearer covers it. The station's 3D point comes off the real decal mesh
(`CarMesh.carDecalData` emits the spineSide quad with its UVs, so a region
coordinate interpolates straight onto the skin) — nothing about the cover
profile is reimplemented here, so it cannot drift from the car.

The number it produces is not intuitive and that is the point. The rear tyre
sits at z -1.6 with a 0.38 m radius; the flank band runs z -0.66 to -1.90. The
band's aft HALF is alongside the tyre and half a metre inboard of it, so from a
side camera the tyre projects straight over the cover. Measured on the marks:

| crown | station | side (4.6 m) | side (11.2 m) | hero 3/4 | rear | top |
|---|---|---|---|---|---|---|
| every crown but `wrap` | u 0.03–0.35 | 0 % | 0 % | 1 % | 0 % | 0 % |
| `wrap`, BEFORE the fix | u 0.52–0.84 | 51 % | 76 % | 7 % | 81 % | 1 % |
| `wrap`, after | u 0.22–0.54 | 0 % | — | — | — | — |

**Read the camera column before calling a number a defect** — the row above was
7 % from the hero preset the garage opens on. It was still a defect, and a
shipped one: Red Bull's default is crown `wrap` + side `duo`, and the same push
put 92 % of its sponsor names, 95 % of a wordmark and 100 % of the then-`slash`
side behind the wheel. `sideFrom` started the band aft of the BULL, the bull ends at u 0.58
and `FLANK_SEEN` is 0.62, so "behind the animal" and "behind the wheel" were one
instruction.

The fix is the rule this file is really about. A band may run to the tail of the
flank; CONTENT may not — a stripe's aft end behind the wheel is a stripe, a
sponsor name's is half a word. So `liverytex.js` carries two axes, `su` for
bands and `sc` clamped to `FLANK_SEEN` for content; the band clears the SUN
(a hard disc, `sunReach`) and SHARES the bull (a silhouette, and every mark
carries a keyline, halo or plate); `SIDE_FILL` puts flat fills UNDER the crown's
flank graphic and lettering over it, so a solid colour fill (`band`/`sash`; the
culled `split` was the same class) cannot erase the bull's
legs and the bull cannot erase a sponsor; and `BULL.top` drops the animal clear
of the crease strip the lettering rides. Everything that has to be read now
measures 0 % from the side, and `fin-design.test.mjs` holds content — marks AND
lettering — under 0.40 on every crown.

### …and then the bull paid for it

Dropping it was the next defect, because **the flank's bottom corner is not on
camera either**. Below v ~0.81 forward of u 0.2 the sidepod eats the band, so an
animal standing on the sidepod line (top 0.26, h 0.74, reaching v 0.99) lost
19 % of its ink and **36 % of its HEAD** — the head is the low forward part of a
charging silhouette, so what went was the half that makes it a bull. Nothing
caught it: the side rows were all 0 %, and the animal was not in them.

`BULL` is now `{ h: 0.52, u0: 0.05, top: 0.30 }` — half the area, its centre
0.09 of the flank further forward, its lowest hoof at v 0.81, 2 % hidden. Both
ends of the constant answer to a different edge (`top` to the lettering strip
above, `h` to the sidepod below) and neither is free. The same station carries
the badge a bull-less crest yields to, so the survey moved with it: Mercedes
23 % hidden → 2 %, Haas 21 → 1, Ferrari 18 → 1, Racing Bulls 16 → 0, and the
five already-clear teams unchanged at 0-2 %.

The oracle was validated against a controlled render pair before any of that,
same plate, same camera, crown the only variable: forward it is whole, aft it is
a sliver at the tyre's leading edge (`artifacts/occl-check/`, 2026-09-09).

### The crease strip was not empty

Freeing it was only half the move, because **the CAR can spoil a design without
hiding it, and no ray-cast will tell you** — the occluders it tests are things
in FRONT of the flank, and the cover's own trim is ON it. `car3d.js` puts an
accent pinstripe and up to four grey service hatches on that skin, and both
were stationed to sit aft of a flank mark at f 0.19, which is where every crown
except `wrap` leaves one. Move the design into the mid-flank and the trim is
inside it: the pinstripe crossed the first sponsor row and a hatch took the last
two letters of the second, white ink on a lit metal plate (garage, u 0.51–0.62 /
v 0.25–0.50). The cooling-outlet louvres cross it too and are FINE — white on
near-black carbon reads; a lit metal plate is what kills a name.

So `trimAft` derives both stations from `LiveryTex.FLANK_SEEN` instead of a
third hand-picked literal, and where the design and a hatch want the same
station **the hatch is what moves**: it is detail, and aft of `FLANK_SEEN` it
still reads from hero/top/rear while a sponsor name only ever reads from the
side. Guarded in `fin-design.test.mjs` by diffing the body with and without a
`spineSide` — that diff IS the trim, so the guard needs no per-feature
knowledge — and mutation-checked by pinning `trimAft` back to 0.

When you move content on the flank, shoot it and LOOK, or enumerate the
bodywork at that station first; the atlas raster shows none of this.

## What still needs a browser

Foreshortening on a curved band, lighting, and whether a graphic survives
downscaling: none of it exists in a flat atlas or a silhouette test. **A 430 px
atlas crop flatters a graphic that a race camera renders as forty pixels of
mud** — `carbon` and `bigmark` both passed every test and every atlas review,
and neither existed at racing distance.

Racing distance is `shot.mjs --team`. The garage's own read is
`garage-angles.mjs`, whose presets frame the WHOLE car (SIDE sits at 11.2 m), so
a flank mark arrives forty pixels wide unless you pass `--zoom`/`--pan`. Those
are counted clicks on the shipped `#cs-view-in` / `#cs-pan-*` controls, applied
AFTER the preset because `setSetupView` is absolute and drops both the stored
distance and the pan — so a framing that reads well there is one a player can
reach. `--zoom 8` bottoms out at the 4.6 m zoom floor; `--pan 5,0` walks aft
along the flank.

Scripting the studio instead? `CARVIEW.set({livery})` takes an id OR a livery
object; an id that matches nothing warns and renders the default rather than
pretending. It silently ignored objects until 2026-09-09, which is worth
knowing if you find an old script that varies a field and photographs the same
car every time.
