# Local survey gallery

The reusable builder is integrated from `cursor/survey-gallery-fix-a1` at
`78c61cf70` (including `da050a90d` filename/CLI fixes). Its large generated
survey archive remains on the assets branch.

```sh
node tools/track/build-gallery.cjs --input artifacts/captures --circuit spa --out artifacts/gallery/spa
```

`--input` reads images from one local directory, without GitHub calls or fetches.
When present, adjacent `image.png.capture.json` files from `shot.mjs` provide
circuit, camera, weather, time of day, lap fraction and renderer metadata.
Otherwise canonical survey filenames are parsed, with `--circuit` as a fallback.
The output directory must not exist: rebuilding never deletes earlier evidence.
Choose a new output path for each run. Outputs default to `artifacts/gallery/tracks`.

Open the generated `index.html` locally. Captures, captions and camera metadata
are rendered into the document before it opens. Circuit links and image expansion
use native HTML and CSS; no JavaScript or server is needed. Select an image to
enlarge it and select it again to close. Capture details expand separately. The
original aspect ratio is preserved. Share the entire output folder, including
its media files, rather than only its `index.html`.

Without `--input`, legacy survey-branch aggregation remains available. Generated
survey images belong on `track-survey-assets`, never the game deployment branch.

Native disclosure and circuit navigation follow:
https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/details
https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/:target

For a single downloadable file, add `--standalone`. Share `gallery.html` from
that output directory: its compressed WebP viewing copies are embedded once.
No image server or adjacent media folder is needed. `index.html` remains the
folder-based alternative. Images load lazily; standalone files still include
all encoded image bytes, so prefer the folder version for large archives.
`--standalone` rejects `--skip-images`.

## Choose views before a large capture batch

The existing survey tool already reuses a track session. Start with four views
instead of the twelve-view scenery preset; inspect them before adding weather
variants. Resume avoids recapturing completed shots in an interrupted survey.

```sh
node tools/shot/shot-survey.mjs --tracks spa --preset quick --label scout --dry-run
node tools/shot/shot-survey.mjs --tracks spa --preset quick --label scout --resume
```

For a deliberate angle study, hold the lap position and weather fixed while
changing the camera. This recipe contrasts elevated near and reverse views
with a wide overhead view; it is a starting plan, not a claim of verified
landmark framing. Preview locally before multiplying it across conditions.

```sh
node tools/shot/shot-survey.mjs --tracks spa --preset custom --label angles --dry-run --plan-json '{"shots":[{"name":"near","frac":0.075,"cam":"orbit","az":40,"el":24,"dist":75},{"name":"reverse","frac":0.075,"cam":"orbit","az":220,"el":30,"dist":75},{"name":"overhead","frac":0.075,"cam":"orbit","az":40,"el":65,"dist":110}]}'
```

Remove `--dry-run` to capture. Use a new label/output directory for a different
plan. For `shot.mjs` jobs, `--profile preview` uses 640×360 JPEG while
`--profile comparison` uses 1280×720 PNG. These are existing quality controls,
not measured speed guarantees. Keep frame-readiness checks enabled; running
multiple software-rendered browsers competes for CPU and can slow captures.

## Named scenarios and preview-to-final workflow

`shot-survey.mjs --list-locations` lists the shared location registry and six
camera recipes. Initial Spa locations use the brief's **racing-space** fractions;
these are source-located, not surveyed or automatically visually verified.
Eau Rouge is approximately .14; .075 is not its registered location. Geometry
changes require rechecking the framing. Custom recipes remain portable JSON.

```sh
node tools/shot/shot-survey.mjs --tracks spa --location spa/eau-rouge --angles overview,reverse,overhead --weathers dry,rain --profile preview --seed 2391 --save-plan artifacts/spa-plan.json --out artifacts/spa-preview
node tools/track/build-gallery.cjs --input artifacts/spa-preview --circuit spa --standalone --out artifacts/spa-review
node tools/shot/shot-survey.mjs --tracks spa --plan-file artifacts/spa-plan.json --select spa-eau-rouge-overview-dry --profile comparison --seed 2391 --out artifacts/spa-finals
```

Each capture and circuit has a prebuilt JSON recipe download when job metadata
is present. Pass that file to `--plan-file`; use `--select` to choose specific
shot names. Large circuits are split into plans of at most 32 shots, with unique
names so repeated captures cannot overwrite each other. Circuit groups place views side by side for review. Script-only
search, selection export and comparison sliders are not part of the portable
page.
The original camera, source identity and timings remain in `manifest.json` and
per-image `.capture.json` receipts. FOV and world-space target overrides work
with debug cameras; lateral offset and look-at lap fraction require `eye`.
Trackside `h` is now an explicit eye height. Presets do not persist player settings.

`--resume` only reuses images with matching source revision/diff, shot settings,
profile, seed and requested GL stack. An existing mismatched image refuses the
run rather than overwriting evidence. Preview JPEG and final PNG are separate
profiles; use different output directories. Receipts are written after each
successful image so completed captures survive interruption.

`session.json` records boot/build timing and browser diagnostics; each image
records scene mutation, readiness, capture, pixel evidence and file-write times.
Capture time includes browser encoding and transfer; it is not GPU frame time.
Keep hardware, source, settings and host load comparable for performance claims.
The existing `capture-benchmark.mjs` provides repeated serial cold-start samples;
use repeated warm survey runs for angle/weather costs. No concurrency increase
or readiness-check removal is part of this workflow.

The same options are exposed through `apex_shot_survey` (`location`, `angles`,
`weathers`, `profile`, `seed`, `camera`). Named/profile/resume surveys use the
background job runner so CLI and MCP use the same receipts and capture lifecycle.
Legacy synchronous surveys retain their existing interface. Shared recipes can
be exported for car, replay and animation probes, but track locations apply only
to track scenery; this does not add a fake replay or garage scene adapter.

API references checked during implementation:
- https://playwright.dev/docs/screenshots
- https://nodejs.org/api/perf_hooks.html

## Target a turn on any circuit

`apex_locations {"track":"monaco"}` lists authored turn markers, start/finish
and sector boundaries alongside any curated named scenery. The same catalog is
available with `shot-survey.mjs --list-locations --track monaco`. All 52 circuit
definitions supply turn markers in racing-lap coordinates. For example:

```sh
bash tools/mcp/apex-tools-mcp.sh call apex_locations '{"track":"monaco","search":"turn-1"}'
bash tools/mcp/apex-tools-mcp.sh call apex_shot_survey '{"track":"monaco","location":"monaco/turn-1","angles":["entry","apex","exit"],"dryRun":true}'
```

Turn numbers are the game's authored marker indices, not official corner names.

## Target an emitted landmark on any circuit

`apex_locations {"track":"singapore","search":"merlion"}` finds a required
scenery model that actually emitted. The catalog generator builds each circuit
in a VM and reads the model's emitted bounds. A source-backed viewing station
is used where the scenery code or circuit brief provides one; otherwise the
model centre is projected to the nearest point on the built racing lap. This
avoids confusing source/scenery fractions with racing fractions on reversed or
shifted circuits. `stationMethod`, `viewpointSource`, `projectedFrac`,
`nearestRoadDistanceM`, and `viewDistanceM` make the choice inspectable. The
screenshot plan aims at the model centre. Distant nearest-road candidates are
flagged as uncertain. The catalog's source digest catches stale coordinates
when a circuit or projection engine changes. Regenerate with
`node tools/shot/gen-scenery-locations.cjs` and check with `--check`.

```sh
bash tools/mcp/apex-tools-mcp.sh call apex_locations '{"track":"singapore","search":"merlion"}'
bash tools/mcp/apex-tools-mcp.sh call apex_shot_survey '{"track":"singapore","location":"singapore/merlion","angles":["overview","entry"],"dryRun":true}'
```

The emitted-model catalog covers all 52 circuits. Spa's four curated corner
names remain separate from its emitted scenery models. Registered models that
did not emit are listed in the generator's `omitted` section and are not
selectable. A projection is a camera
candidate, not proof that the object is visible or geographically accurate;
far skyline models, wide assemblies and crossings especially need rendered
review. The MCP tool format follows
the [MCP tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).

Named reviews default to the `preview` profile (640 × 360 JPEG). Select final
shots with `--select` and use `--profile comparison` in a fresh output directory.
Resume remains specific to the source revision, camera, conditions, profile,
seed, GPU and, for custom tracks, the collection file's content hash.

Queue several named targets with `locations`; qualify each with its circuit id.
The batch shares one browser, loads assets once, switches tracks sequentially,
and groups named shots by weather and time of day. Each track keeps its own
output directory and contact sheet. `session.json` records `reusedSession`,
`buildMs` and startup time separately. `--cold-sessions` retains separate browser
boots for comparisons. The implementation follows Playwright's
[page/context reuse and initialization APIs](https://playwright.dev/docs/api/class-browsercontext).

```sh
bash tools/mcp/apex-tools-mcp.sh call apex_shot_survey '{"tracks":["singapore","spa"],"locations":["singapore/merlion","spa/eau-rouge"],"angles":["overview","entry"],"resume":true}'
node tools/shot/shot-survey.mjs --tracks singapore,spa --locations singapore/merlion,spa/eau-rouge --angles overview,entry --out artifacts/named-review --resume
```

For custom scenery, export a native `apex26.tracks` collection from the designer
and pass its path as `designs` in MCP or `--designs` in the CLI. `apex_locations`
then accepts the collection's content ids and lists names such as
`custom-1234abcd/pond-1` or `custom-1234abcd/mountain-1`. Targets are computed
from the native centreline, authored side, and placement gap. These are placement
anchors, not emitted bounds. Water and terrain query the native prop dresser
for their centre and dimensions, so wide objects get a larger orbit distance.
Water may be suppressed by road clearance checks,
and large scenery can extend beyond the anchor. Inspect the gallery before
claiming a match. New landscape kinds and themes require the game revision that
implements them; unsupported entries fail explicitly rather than being dropped.

```sh
node tools/shot/shot-survey.mjs --designs artifacts/designs.json --track custom-1234abcd --list-locations
node tools/shot/shot-survey.mjs --designs artifacts/designs.json --track custom-1234abcd --location custom-1234abcd/pond-1 --angles overview,overhead --out artifacts/custom-review
```
