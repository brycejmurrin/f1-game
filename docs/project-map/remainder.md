> Coverage update: Initial bounded snapshot. Editor, garage, lighting/FX/presets, agent/misc, assets and vendor continuation reports supply subsequent coverage. Use coverage.tsv for current status.

# Remaining subsystems, assets and documentation map

## Goal
Map the assigned remainder of the repository without changing runtime code. This is a navigation and coverage report, not a correctness certification.

## Source identity
- Checkout: `/workspace/f1-game`; branch `cursor/project-map-a84f`.
- Source HEAD when inspected: `ae73c67669bbb7fe4b54f58f78bcfb9c8b00aebb` (2026-10-27 UTC).
- Read repository `AGENTS.md` in full. No browser runs, secret files or browser-profile contents were read.

## Inventory
Filesystem inventory counted 182 files / 150,432,926 bytes in `assets/`, 57 files / 5,049,416 bytes in `vendor/`, and 1,418 files / 19,618,954 bytes in `docs/` at the initial scan. These are working-tree counts, not a claim that all are tracked or read. Concurrent mapping reports can change the docs count.

Assets: `atlases`, `fonts`, `icons`, `music`, `pack`, `sfx`, `stills`, `voice`. Vendor: `gpu-capture`, `jsqr-1.4.0`, `rapier-0.19.3`, `three-0.186.1`, `three-patches`, `trystero-0.25.4`.

`docs/README.md` is the reading-order and topical index; `NOTES-INDEX.md` owns the notes/research/archive/plans tables. Topical docs describe physics, career, scenery, lighting, multiplayer, UI, verification, platform and packaging. `DEBUG-HOOKS.md` and several reference tables are generated; redirect stubs intentionally preserve source-comment links. `docs/EVIDENCE-STORAGE.md` distinguishes runtime assets and reviewed baselines in Git from new capture bundles published as release assets.

`artifacts/` and `scratch/` are regenerable local output roots. No recursive content inventory is claimed: an initial size scan encountered a browser profile singleton link under artifacts and was stopped. Browser profiles and their contents were excluded from subsequent inspection.

## Architecture/data flow
- Editor: stored designs become ordinary custom track definitions via `CustomTracks.sync()`; the lazy editor's shape/canvas/profile/validation/insight/fixes modules feed the designer's undo and draft pipeline. The codec carries bounded binary records through URL fragments or JSON file envelopes. Props and themes dress the existing scenery API.
- Garage: setup UI and persistence feed part/tuning previews; camera, room primitives, equipment, dress and live atlases compose the bay. Arrival and authored crew motion provide render-clock choreography; pit-stop animation reuses those crew components.
- FX: transient particles, skidmark buffers and per-car effects feed render work; droplets and visor optics use renderer-agnostic canvas overlays. Lighting composes knob definitions, persisted profiles, per-track lamp records, per-frame culling and baked ground pools behind `LightTune`.
- XR: pure plan selection and seated-rig matrices sit below capability/session management; boot wiring binds live renderers and controller events, while settings and ENTER VR UI expose the opt-in lifecycle. Header documentation describes WebGL2 as default and WebGPU as experimental.
- Share cards: sanitized/frozen daily-result model → pure paint operations → canvas/PNG → Web Share, native save or browser download. QR scripts load on demand for linked cards.
- Bitmap worker: page-side sequence/pending-request map → worker decode or PNG strip inflation/unfiltering → transferable bitmap/RGBA → caller's upload. Errors/timeouts fall back to page decoding; explicit abort skips fallback. The experimental strip path requires `apex26.packDecodeWorker=1`.
- Overlay: pure feed schema and differ → transform-oriented DOM renderer for `overlay.html`. Agent: `ApexApi.create(G)` assembles dev hooks; extracted camera/track/lobby/network/lifecycle/GPU modules share that façade. `AgentView` provides structured world observations, corner cache and optional text raster views.
- Assets: author-time atlases feed `tools/gen/assets.mjs`; runtime uses baked pack strips. `assets/pack/manifest.json` contains material/model/environment/credit records. Vendored Three and GPU capture manifests pin versions, file sizes and hashes; the Three manifest also records applied patches.

## File-by-file coverage
Status **partial** means header or selected portions only; it never means an implementation audit. Some combined read output was truncated, so conservative partial labels are retained. **Full** means every source line was returned and reviewed in bounded output.

| File | Lines | Coverage |
|---|---:|---|
| `js/editor/bridge-panel.js` | 105 | Partial: header/selected lines |
| `js/editor/canvas.js` | 822 | Partial: header/selected lines |
| `js/editor/codec.js` | 368 | Partial: header/selected lines |
| `js/editor/custom-tracks.js` | 632 | Partial: header/selected lines |
| `js/editor/designer.js` | 2542 | Partial: header/selected lines |
| `js/editor/elev-presets.js` | 122 | Partial: header/selected lines |
| `js/editor/fixes.js` | 404 | Partial: header/selected lines |
| `js/editor/followup-tools.js` | 95 | Partial: header/selected lines |
| `js/editor/insight.js` | 429 | Partial: header/selected lines |
| `js/editor/profile.js` | 402 | Partial: header/selected lines |
| `js/editor/props.js` | 348 | Partial: header/selected lines |
| `js/editor/randomise.js` | 202 | Partial: header/selected lines |
| `js/editor/scenery-panel.js` | 313 | Partial: header/selected lines |
| `js/editor/scenery-preview.js` | 150 | Partial: header/selected lines |
| `js/editor/selection-panel.js` | 68 | Partial: header/selected lines |
| `js/editor/shape.js` | 356 | Partial: header/selected lines |
| `js/editor/stamps.js` | 199 | Partial: header/selected lines |
| `js/editor/track-themes.js` | 942 | Partial: header/selected lines |
| `js/editor/validate.js` | 267 | Partial: header/selected lines |
| `js/editor/workspace.js` | 66 | Partial: header/selected lines |
| `js/garage/arrival.js` | 279 | Partial: header/selected lines |
| `js/garage/crew-choreo.js` | 137 | Partial: header/selected lines |
| `js/garage/crew-motion.js` | 96 | Partial: header/selected lines |
| `js/garage/crew-service.js` | 149 | Partial: header/selected lines |
| `js/garage/experience.js` | 181 | Partial: header/selected lines |
| `js/garage/livery-design-editor.js` | 336 | Partial: header/selected lines |
| `js/garage/pit-crew.js` | 63 | Partial: header/selected lines |
| `js/garage/pit-signs.js` | 206 | Partial: header/selected lines |
| `js/garage/prebuild.js` | 354 | Partial: header/selected lines |
| `js/garage/scene-crew.js` | 356 | Partial: header/selected lines |
| `js/garage/scene-dress.js` | 644 | Partial: header/selected lines |
| `js/garage/scene-equipment.js` | 374 | Partial: header/selected lines |
| `js/garage/scene-live.js` | 215 | Partial: header/selected lines |
| `js/garage/scene-prims.js` | 314 | Partial: header/selected lines |
| `js/garage/scene.js` | 1532 | Partial: header/selected lines |
| `js/garage/setup-camera.js` | 1153 | Partial: header/selected lines |
| `js/garage/setup-experiments.js` | 170 | Partial: header/selected lines |
| `js/garage/setup-presets.js` | 166 | Partial: header/selected lines |
| `js/garage/setup-sheet.js` | 1725 | Partial: header/selected lines |
| `js/garage/setup-trials.js` | 145 | Partial: header/selected lines |
| `js/garage/setup-tune.js` | 153 | Partial: header/selected lines |
| `js/garage/surface-inspection.js` | 74 | Partial: header/selected lines |
| `js/fx/car-fx.js` | 154 | Partial: header/selected lines |
| `js/fx/droplets.js` | 247 | Partial: header/selected lines |
| `js/fx/grade-tint.js` | 49 | Partial: header/selected lines |
| `js/fx/particles.js` | 693 | Partial: header/selected lines |
| `js/fx/skidmarks.js` | 124 | Partial: header/selected lines |
| `js/fx/visor-optics.js` | 694 | Partial: header/selected lines |
| `js/lighting/atmosphere.js` | 852 | Partial: header/selected lines |
| `js/lighting/frame-lights.js` | 769 | Partial: header/selected lines |
| `js/lighting/knobs.js` | 258 | Partial: header/selected lines |
| `js/lighting/lamp-bake.js` | 559 | Partial: header/selected lines |
| `js/lighting/lighting.js` | 16 | Partial: header/selected lines |
| `js/lighting/presets.js` | 7228 | Partial: header/selected lines |
| `js/lighting/profiles.js` | 386 | Partial: header/selected lines |
| `js/lighting/track-lights.js` | 450 | Partial: header/selected lines |
| `js/lighting/tuner-panel.js` | 465 | Partial: header/selected lines |
| `js/xr/apex-xr.js` | 183 | Partial: header/selected lines |
| `js/xr/xr-boot.js` | 398 | Partial: header/selected lines |
| `js/xr/xr-input.js` | 135 | Partial: header/selected lines |
| `js/xr/xr-opts.js` | 206 | Partial: header/selected lines |
| `js/xr/xr-plan.js` | 140 | Partial: header/selected lines |
| `js/xr/xr-rig.js` | 229 | Partial: header/selected lines |
| `js/xr/xr-session.js` | 485 | Partial: header/selected lines |
| `js/xr/xr-ui.js` | 120 | Partial: header/selected lines |
| `js/share/share-card-data.js` | 62 | Full |
| `js/share/share-card-layout.js` | 71 | Full |
| `js/share/share-card.js` | 136 | Full |
| `js/workers/bitmap-decode-client.js` | 178 | Partial: header/selected lines |
| `js/workers/bitmap-decode-worker.js` | 143 | Full |
| `js/overlay/feed.js` | 220 | Partial: header/selected lines |
| `js/overlay/render.js` | 202 | Partial: header/selected lines |
| `js/agent/agentview-corners.js` | 291 | Partial: header/selected lines |
| `js/agent/agentview-raster.js` | 716 | Partial: header/selected lines |
| `js/agent/agentview.js` | 2320 | Partial: header/selected lines |
| `js/agent/apex-cam.js` | 368 | Partial: header/selected lines |
| `js/agent/apex-gpu-capture.js` | 296 | Partial: header/selected lines |
| `js/agent/apex-lifecycle.js` | 123 | Partial: header/selected lines |
| `js/agent/apex-lobby.js` | 123 | Partial: header/selected lines |
| `js/agent/apex-net.js` | 312 | Partial: header/selected lines |
| `js/agent/apex-track.js` | 149 | Partial: header/selected lines |
| `js/agent/apex.js` | 2495 | Partial: header/selected lines |

Other fully read files: `AGENTS.md`, `docs/README.md`, `docs/EVIDENCE-STORAGE.md`, `assets/atlases/README.md`, `vendor/three-0.186.1/MANIFEST.json`, `vendor/gpu-capture/MANIFEST.json`. `assets/pack/manifest.json` was parsed for keys and an initial record excerpt only. Asset binaries, voice JSON bodies, vendor implementation/minified bundles, patches and remaining docs are unread; directory/name inventory alone is not content coverage. Bitmap client source was inspected in multiple excerpts but remains conservatively partial due to an earlier truncated aggregate response.

## LSP evidence
Connected `f1_cloud_mcp_apex_lsp.lsp_outline` on `js/editor/codec.js` succeeded. It reported `TrackCodec` at line 15 with 23 exports and 14 internals: binary encode/decode at lines 118/187, async encode/decode at 303/315, URL helpers at 337/344/350, and file-envelope helpers at 355/359. Constants included `MAX_CODE=4096` and `MAX_BYTES=16384` at line 18. No diagnostics, caller graph or reference-completeness claim is made; the local HEAD identity above was read from Git, while the LSP response did not independently stamp its checkout SHA.

## Comment findings with proof
- `js/editor/codec.js:1–14` documents APXT1/APXT2, defensive decoding, fragment sharing and re-sanitization. LSP confirms separate encode/decode and envelope entry points; the implementation was not fully read, so the defensive guarantee remains a stated contract.
- `js/workers/bitmap-decode-worker.js:14` calls its strip decoder the same reader as the page asset reader. Its actual `PngStrip.decode` accepts a narrow RGBA8/non-interlaced subset and returns null for unsupported chunks; no equivalence test was run here.
- `js/workers/bitmap-decode-client.js:114` explains why a dead worker must be retired. The inspected implementation guards `_w !== w`, drops on posting errors/timeouts, and the decode catch falls back unless aborted. This comment matches the examined control flow.
- `js/share/share-card-layout.js:57` explains dark QR modules/light tile for scanner compatibility. Layout emits the light background and painter fills it before dark modules; scanner interoperability was not retested.
- `assets/atlases/README.md` explicitly says these sheets are author-time and never fetched by the game; it points to baked strips and the generator's mapping table. This prevents confusing production textures with source atlases; fetch behavior was not independently traced.
- A text scan for `TODO|FIXME|HACK|XXX` in the nine assigned JS directories returned no matches. This is only marker coverage and does not prove absence of technical debt.

## Risks/unknowns
Large editor/agent/garage modules and most effects/lighting/XR source were only sampled. Their runtime ordering, teardown, persistence migration, renderer compatibility and input behavior remain unverified. Binary assets were not visually or acoustically reviewed; license presence and manifests were inventoried, without running hash/license verification. Documentation volume and historical evidence make blanket claims of freshness inappropriate. No browser, test suite, build, asset regeneration or publication was performed by this mapper.

## Next steps
Use `tools/manifest.cjs` and the parent map for exact load order. For an implementation change, fully read the target module and its contract, use LSP definitions/references, then follow the path-specific verification prescribed by `AGENTS.md`. Audit vendor patches and licenses through their generators rather than editing generated bundles. Treat ignored outputs as local evidence until a reviewed publication receipt establishes durable provenance.
