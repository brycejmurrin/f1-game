# Visor Lab authoring sources

`optics.html` compares one untouched captured frame with the same frame using the
current game visor and water code. The divider clips full-viewport layers; its
native range supports keyboard input and the visible divider supports dragging.
The eight `images/*--off.webp` originals are sufficient for this animated view.

From the game checkout run `node tools/shot/visor-lab-export.mjs /absolute/path/to/existing/site/dist` to
copy these authoring files and originals into an existing Site output directory.
The exporter refreshes runtime aliases `visor-options.js`, `visor-droplets.js`
and `visor-optics.css` from the actual game source; do not maintain copies here.
It retains the destination's full captured gallery images. No hosting identity or
credentials are required in source.

`index.html`, `app.js`, `style.css` and `shots.json` preserve the original static
112-shot comparison gallery. Its additional full-resolution and thumbnail images
are capture output and are not duplicated in this directory. Export into the
existing gallery directory to retain them; exporting to an empty directory alone
does not reconstruct those captured variants. Animated optics remains usable
with the eight originals after runtime aliases have been exported.

Scene images decode before either side changes. Older asynchronous loads cannot
overwrite a newer selection. Reduced-motion users start with stationary water;
the animation checkbox enables or freezes motion explicitly. Both sides use the
same aspect-preserving crop, including narrow portrait screens.

Wet-weather refreshes are listed under `shots.json` → `patches`. Their capture
records include the rendered surface wetness and post-processing reflection
inputs: wet uses 0.5, rain/storm use 1. The capture pins the surface through the
existing light tuner; this does not alter normal gameplay's wetness transition.
`ssrQuality: 0` means the full reflection budget. Rainfall itself can still be
ramping when these frozen scenes are captured; animated visor rain uses the
selected weather's target instead of claiming to replay the captured moment.

Visor reflections are procedural shield highlights, and refraction is a radial
screen-space approximation. They do not sample reflected track geometry or
simulate refraction through each individual bead. The settings deliberately
separate these effects from the game's actual wet-road reflections.

## Capture or import any A/B pair

`ab-gallery.mjs` produces `comparisons.html`, `comparisons.json`, its JS/CSS and
immutable lossless WebP images. It appends pairs; reusing an ID replaces that pair
without removing others. Imports require equal pixel dimensions so the divider
never compares stretched images. A lock rejects simultaneous writers. Failed
imports leave the existing index intact. Serve the output over HTTP.

Capture a real matched game view (one browser, one frozen camera for A and B):

```sh
node tools/shot/ab-gallery.mjs --capture examples/visor-lab/capture-example.json --gallery /absolute/path/to/site/dist
```

Copy the recipe and add pairs for any track, native camera, lap fraction,
weather or time of day. Each pair shares its scene; its `a` and `b` objects
select labels and visor settings. Settings reset independently for each side.
The example compares Original with Strong refraction/reflections. Helmet rain
is seeded as stationary water for stills; these captures do not measure motion.
Capture reports and PNG originals are retained in `artifacts/ab-capture-*`.

Import screenshots from different code revisions or any other experiment:

```sh
node tools/shot/ab-gallery.mjs --add --a /path/before.png --b /path/after.png --id wet-road --title "Wet-road reflections" --a-label Before --b-label After --gallery /absolute/path/to/site/dist
```

The input may be PNG, JPEG or WebP. No browser is launched for imports. The
viewer offers a shot selector, hide/show controls, full-resolution downloads,
keyboard and touch wipe, atomic image loading and per-pair capture details.
`--help` lists the recipe schema. Tools work locally without Site credentials;
publication is a separate step. Existing Site galleries retain all prior assets.

## Selector metadata and lens studies

Every captured pair automatically adds race/circuit, time of day, weather,
camera, track position and lens-effect choices to the viewer. For imported
images, supply `--race monza --timing night --weather dry --camera helmet
--effect reflections --position 0.18 --note "Only lens reflections change"`.
Existing captures derive scene fields from their provenance; untagged imports
appear as Unspecified. The dependent selectors offer only available captures.

Use `capture-lens-study.json` for controlled lens comparisons across dry night,
dry daylight and dawn fog. Both sides use Clear, with tint and visor rain off;
only reflection strength OR refraction changes. Night shots cover Light,
Medium and Strong. The viewer's Inspect selector crops the left, right or
upper lens edge at 4×, identically on A and B. Reflections here are the shield's
procedural coating highlights; they do not claim reflected scene geometry.

```sh
node tools/shot/ab-gallery.mjs --capture examples/visor-lab/capture-lens-study.json --gallery /absolute/path/to/site/dist
```

Consecutive recipes sharing a scene reuse the same frozen render, so optics
levels are compared against identical lighting and camera pixels.
