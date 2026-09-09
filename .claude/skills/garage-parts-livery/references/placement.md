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
| does it read at racing distance, lit? | `node tools/shot/garage-angles.mjs --team redbull --spine-side logo --views side --zoom 8 --pan 5,0` | ~50 s boot + ~35 s a shot |

`spine-station.mjs` replays the real `buildAtlas` into crest-sweep's recording
context and diffs the flank against the same livery wearing `spineSide: "none"`,
so the box it reports is the design's own ink whatever painted it — no
per-design knowledge in the tool, and a new design is measured the day it is
written. `v` is the axis the complaints are about (0 the shoulder crease, 1 the
sidepod line); `u` runs front to rear, which is how you see a CROWN squeezing a
mark aft without booting anything: `wrap` hands the marks u 0.52–0.95, and that
is the station the rear tyre eats from a side camera.

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
| `wrap` | u 0.52–0.84 | 51 % | 76 % | 7 % | 81 % | 1 % |

`wrap` hangs a metre-long bull over the front two thirds, so `sideFrom` pushes
every flank design into the aft third — which is the tyre's. **Read the camera
column before calling that a defect**: it is 7 % from the hero preset the garage
opens on. `fin-design.test.mjs` ratchets `wrap` at its measured 0.60 and holds
every other crown under 0.20, so the class cannot spread silently.

Validated against a controlled render pair, same plate, same camera, crown the
only variable: forward it is whole, aft it is a sliver at the tyre's leading
edge (`artifacts/occl-check/`, 2026-09-09).

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
