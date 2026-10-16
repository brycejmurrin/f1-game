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

Open the generated `index.html` locally. It embeds its manifest, uses relative
image links, and needs no server. Circuit/view/time/weather filters, search,
Reset, native keyboard-activatable cards and a modal viewer work offline.
Arrow keys move through the filtered set; Escape closes and returns focus to the
card. Thumbnails retain their original aspect ratio. Save image downloads the
compressed viewing copy, not the original capture. Share the entire output
folder, not only its HTML file.

Without `--input`, legacy survey-branch aggregation remains available. Generated
survey images belong on `track-survey-assets`, never the game deployment branch.

Modal behavior follows the native dialog API:
https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal

For a single downloadable file, add `--standalone`. Share `gallery.html` from
that output directory: its compressed WebP viewing copies are embedded once
and reused by both the grid and modal. No image server or adjacent media folder
is needed. `index.html` remains the smaller folder-based alternative with lazy
thumbnails. Standalone files load all encoded image bytes up front, so use the
folder version for large archives. `--standalone` rejects `--skip-images`.

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

The gallery can export selected captures as `selected-plan.json`; pass that file
to `--plan-file` instead of selecting names manually. Export one circuit at a
time. Select exactly two images for a split comparison. The page reports differing
requested framing; comparisons are visual evidence, not a pixel regression gate.
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
Selecting a road fraction does not prove that a shot frames a scenery mesh.
Only curated Spa scenery names have source-located fractions so far. Add others
after checking their racing-space positions and reviewing rendered frames; a
landmark registry ID alone has no camera coordinate. The MCP tool format follows
the [MCP tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).
