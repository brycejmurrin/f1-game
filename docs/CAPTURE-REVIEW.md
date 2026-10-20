# Capture and publish a design review

The matrix runner captures part details with one owned garage browser. Run a
read-only plan first; it includes the source fingerprint and discovered browser
path. Browser availability does not prove launch or native presentation.

```sh
node tools/shot/design-matrix.mjs --part=sidepod,frontWing --angles=headOn,grazing --backend=three --run=materials --plan
node tools/shot/design-matrix.mjs --part=sidepod,frontWing --angles=headOn,grazing --backend=three --run=materials
```

Comma-separated variants are separate shots. Semicolon-separated assignments
form a mixed-field recipe; quote the whole argument in a shell:

```sh
node tools/shot/design-matrix.mjs --run=cobalt '--variants=pod=#225bb4;podFinish=satin;coverFinish=pearl;part.aero=style_aero_spoon'
```

Other controls: `--colours=dark,mid,light`, `--lights=lamp,off,keyHi,keyLo`,
`--baseline=podFinish=gloss`, `--fill=0.7`, `--fov=45`, `--viewport=1280x720`,
`--phone`, `--batch=1/3`, `--bounds=@file.json`, `--out=artifacts/my-run`.
Dimensions are limited to 1600×900 and DPR 1. Load must be below 3.

Use identical arguments plus `--resume` to continue a run. Source revision,
tracked changes, non-hidden untracked runtime/tool source, backend, camera and
plan must match. Missing or modified images redo the whole baseline group.
Legacy manifests without source receipts require a new run. `--index-only`
checks and rebuilds the indexes without launching a browser and returns a
failure when the selected coverage is incomplete. Batches share the full plan;
the index reports full coverage while the command reports selected coverage.

The runner writes `manifest.json`, `gallery.json`, `sheet.html` and PNGs under
`artifacts/` or `scratch/`. Gallery records include image hashes, source identity,
backend, readiness, camera and design recipe. Startup and command waits are
bounded. Missing Chromium fails before capture output is created. The tool never
installs a browser or replaces game frames with geometry projections.

## Export a portable site collection

The gallery exporter accepts matrix `gallery.json` or an existing Design Lab
`captures.json`. It validates every file against its recorded SHA-256, decodes
image dimensions, preserves each source revision, design recipe and historical
status, and groups native screenshots separately from geometry previews and
unverified visuals. Missing hashes or corrupt files fail the entire export.

```sh
node tools/shot/capture-gallery.mjs --input=artifacts/design-matrix/materials/gallery.json --assets=artifacts/design-matrix/materials --out=artifacts/materials-site --plan
node tools/shot/capture-gallery.mjs --input=artifacts/design-matrix/materials/gallery.json --assets=artifacts/design-matrix/materials --out=artifacts/materials-site
```

Output includes `artifacts/materials-site/index.html`,
`artifacts/materials-site/gallery.js`, `gallery.json` and
content-addressed `assets/`. The output directory must be new or empty and
contained in the checkout's artifact roots. These files can be included in a
Sites deployment. Exporting does not upload, recapture, or reattribute old shots
to a newer deploy revision. Native screenshots require recorded backend,
readiness and capture method; a hash match alone proves only file identity.

Process lifecycle reference: https://nodejs.org/api/child_process.html#event-close
