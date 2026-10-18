---
name: new-track
description: "Use when adding a track/circuit, editing a layout, changing circuit geometry/metadata/palette/theme/bridges (flyover, figure-8 crossover)/elevation (add a hill, crest or dip), registering a circuit in js/circuits/, or the in-game TRACK DESIGNER (js/editor/, MY CIRCUITS, apex26.customTracks, share codes). Read-only corner/terrain/grade diagnosis → agent-view; picture-driven accuracy → survey-track; scenery(api) and floating/sunken props → scenery-dress."
---

# Author or edit a track

Each circuit is a self-contained IIFE in `js/circuits/<id>.js` that pushes a plain
data object onto the global `window.TrackDefs` list — **the def is the single home
of everything about that circuit**: its real centreline (`path`), curated markings
(`sectors`/`turns`) and dressing rows (`barrier`, `furniture`, `kit`,
`standSet`, `cityStyle`); its `scenery(api)` closure is the second file of the
pair, `js/circuits/scenery/<id>.js`. The engine (`js/track/tracks.js`) reads
`TrackDefs`, builds a Catmull-Rom spline from `path` (a def without one is a build
error naming the circuit — there is no hand-authored fallback), and extrudes the
road, terrain, and prop meshes. **Track files load before `js/track/tracks.js`** in
`index.html`.

## Track-definition schema

Required keys: `id` (= filename), `name`, `gp`, `country`, `night`, `classic`, `theme`,
`lengthKm`, `baseHW`, and `path: { len, pts }` (the real centreline from
`tools/track/import-circuit-path.mjs`). Optional: `reverse`/`startFrac`, `street`, `banked`,
`pal`, `sectors`/`turns` (racing-lap fracs), dressing rows (`furniture`, `kit`, `standSet`,
`barrier`, `cityStyle`), `bridges`, `elevations`. The annotated def with every field →
[references/schema.md](references/schema.md).

The dressing is NOT a def key. It is a second file — the `scenery(api)` closure
lives in `js/circuits/scenery/<id>.js` as
`(window.TrackScenery = window.TrackScenery || {})["<id>"] = function (api) {…}`
and is fetched per build (`LAZY_SCENERY` in `tools/manifest.cjs`). A circuit is
a PAIR of files; see the scenery-dress skill for the closure itself.

Coordinates are +Y up, arc position `s` in metres (0 → `track.total`), lateral
`x` in metres (+ = right of centreline). Orient a trace with `reverse` /
`startFrac`, never by editing `path.pts`; narrow a section with `hwZones`.

---

## Load on demand

- Every def field, annotated → [references/schema.md](references/schema.md).
- Add/edit workflow and the measured gotchas → [references/workflow.md](references/workflow.md). Start at its step 0: check the id is not already registered (madrid is).
- The in-game TRACK DESIGNER (`js/editor/`: custom circuits, share codes, the WYSIWYG validator, themes/props) → [references/editor.md](references/editor.md).
