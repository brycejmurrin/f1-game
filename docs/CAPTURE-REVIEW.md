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
Dimensions are limited to 1600×900 and DPR 1. The Linux software-rendering
container's load must be below 3. As in the underlying garage tool, that
absolute Linux load limit does not apply to shared macOS runners.

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

The authored, styled Design Lab frontend is versioned under
[`sites/design-lab/`](../sites/design-lab/README.md). Its README
explains how to pair the exact site HTML/CSS/JS with the existing capture data
and assets. The portable exporter below remains a separate generated view.

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

## When the local browser cannot run

The `Capture gallery` workflow runs the same native matrix and exporter on
`macos-latest`, matching the repository's existing garage-before capture route.
Commit `.github/capture-gallery-request.json` on your branch, then dispatch the
workflow from it (`gh workflow run capture-gallery.yml --ref <branch>`); a push
alone no longer starts a run. The runner captures the exact
workflow SHA, limits the request to 24 images and the job to 15 minutes, and
uploads PNGs, source/camera receipts and a portable gallery for seven days.
It grants only read access to repository contents and does not cancel a running
capture when another request arrives. Output directories cannot be overridden.

Validate the request locally with `node tools/shot/run-capture-request.mjs --plan`.
The request is an argument array passed without a shell; semicolons in mixed
recipes remain part of one value.

An HTTP 200 response does not prove a browser archive downloaded. In this Work
environment, the Chromium CDN returned a 195-byte HTML page titled "Site
Unavailable" instead of a ZIP. The cloud browser also reported "WebGL2
unavailable" in the actual car studio. Use the CI route for native captures in
that situation; the static gallery preview alone cannot verify game rendering.
