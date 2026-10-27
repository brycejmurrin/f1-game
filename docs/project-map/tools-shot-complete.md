# tools/shot — complete source map

Read-only source audit on 2026-10-27. All 52 tracked files were read in full (16,545 lines, 819,545 bytes), including all generated catalog rows. No capture CLI, browser, tests, or runtime was executed. AGENTS.md and the actual `.claude/skills/code-nav/SKILL.md` were read. This is source evidence, not live rendering verification. Parent owns docs verification and commit.

## Entry points and ownership

| Surface | Owner and contract |
|---|---|
| One/many deterministic stills | `shot.mjs` delegates argument normalization/session grouping to `shot-jobs.mjs`; teams/backend/viewport/DPR/profile/seed isolate contexts, track/TOD/weather group compatible jobs. Model prefetch precedes the first race. Cameras are park, eye, orbit, cinematic, trackside; free cams must not be followed by snapCam. Captures write an image and `.capture.json` receipt and reject nonmeaningful/blank pixels or unhealthy requested backend. Raster mode still boots a browser and writes geometric raster JSON. |
| Parallel sweeps | `apex-capture.mjs`: cameras (12), tracks, identity (aerial/tour/eye), lap-tour (20 fractions), modes (menu/race/results/TT). One static server; independent Chromium processes with job-aware worker limits from browser-workers. Dynamic queue retries closed/crashed targets once via revive. Manifest includes options, commit/dirty, browser/GPU diagnostics, worker timings, per-shot state/pixels. IPC explicitly reports owned browser PIDs to benchmark parent. |
| Agent JSON | `agent.mjs`: manifest or one help row, world/track/field/atmosphere/objective/describe/query/scene/render/rollout/car/survey/model; aliases visible/frame/plan. One-hook help reads docs/agent-index.json without boot. `--vm` uses game-vm and refuses raster-related commands; `apex-eval.mjs` evaluates arbitrary trusted expressions, shape compacts by default, `--raw` preserves value; explicit backend is incompatible with VM. |
| Persistent track | `track-session.mjs --serve`: serialized JSON lines echo id; shot/eval/track/sheet/diff/status, EOF tears down. Each render op restores prior headless state. Track switches confine output to physical session root and reset shot registry. `shot-survey.mjs` owns child transport; `lib/survey-runner.mjs` is shared by CLI and MCP, with source/profile/seed/GPU identity-aware resume, progress/findings/gallery/compare output. |
| Persistent garage | `garage-angles.mjs --serve`: queue team/seat → livery/design/base → frame → shot → diff → sheet → reload → status; quit/EOF end session. Batch mode walks teams × design/livery/base × camera × viewport × DPR; presets/CLI axes/explicit JSON/zip, aliases/stations, paths, oracle, labels/contact sheets, ref-backed A/B without checkout mutation. Watch events share command queue. Backend is webgl2 default or three, not webgpu. |
| Garage discovery | `lib/garage-camera-catalog.mjs` owns TARGETS/CAM_ALIAS/STATIONS/FIELD_STATIONS shared with MCP discovery/plan. Stations have car-space targets (+Y up,+Z nose), radian az/el, metre distances, optional unclamped inspection poses; roomStation derives ordinary orbit metadata from eye/look. Garage presets include workshop, room, wall, fin, flank, mark, quick, sweep, saddleWall, closeup. |
| Design matrix | `design-matrix.mjs` and pure `lib/design-matrix.mjs`: part bounding boxes × angles × body colours × lights × variants; each group retains baseline. Whole-group round-robin batch slices and hashed source/request signature resume. `lib/design-matrix-run.mjs` validates physical output paths, source fingerprint, image hash/receipt, atomic metadata replacement and bounded serial garage channel. |
| Portable galleries | `capture-gallery.mjs` verifies safe regular image paths, SHA256 and format, classifies native screenshot/geometry-preview/unverified visual, exports content-addressed assets plus gallery/index/script. `run-capture-request.mjs` permits schemaVersion 1, 1..13 whitelisted unique args (2048 chars each), 1..24 cells, fixed request path/output and child argv, no shell interpolation. |
| A/B authoring | `ab-gallery.mjs` validates 1..64 visor pairs and equal-size still inputs ≤32 MiB, stores lossless content-addressed WebP, updates comparisons.json atomically under its own `.comparisons.lock` (an index lock, not browser mutex). Capture pins WebGL2/Ultra/shared scene, verifies wetness/identity, reports provenance. `visor-lab-export.mjs` exports committed authoring/runtime files into an absolute destination and merges comparison IDs. |
| Evidence publication | `publish-evidence.mjs`: default prepares locally; --plan inspects; --publish creates/reuses checksum-verified prerelease at parentless STORAGE_ANCHOR, never clobbers. Each asset <2GiB; up to 997 selected linkable images, 3..1000 receipt assets. Input child of artifacts/scratch, rejects symlinks/nonregular files/dependencies and overlapping upload root; hashes copied bytes via O_NOFOLLOW. Packaging SHA/dirty/diff is explicitly not proof of captured revision. `export-history-evidence.mjs` validates full SHA and 1..128 evidence paths, requires checkout HEAD match, exports verified Git blobs without executing old code; historical-origin disclaims rendered revision. |

## Shared capture contracts

`capture-options.mjs` owns custom/preview (640×360 JPEG80)/comparison (1280×720 PNG) profiles. Comparison pins renderScale=1, governor tier hold and frozen renderClock=0. Width/height 1..8192, DPR .25..4, total ≤64Mi pixels; PNG rejects JPEG quality. Scope scene/page; GPU swiftshader/llvmpipe/hardware/lavapipe; browser auto/chromium/shell with aliases; isolated/reuse exclusive, reuse default. Explicit GPU includes APEX_GPU/APEX_GL and must match browser diagnostics. Hardware picks full Chromium; software WebGPU rejects llvmpipe.

`capture-contract.mjs` is a distinct bounded-CLI parser: catalog track, uint32 seed, backend three/webgl2/webgpu, viewport dimensions 64..4096, frames 1..120, timeout 1000..900000ms; output must be a physical child of artifacts/scratch. Defaults monza (replay uses baku), seed1, three, 1280×720, 3 frames, 300000ms. Pixel evidence resizes to 96×64, classifies black (<1% lit), edge/HUD-only (<1.5% center lit), uniform (variance ≤2), meaningful scene. Renderer positive additionally needs requested=actual, live webgl2/webgpu API, no lost context/device/GPU errors.

`probe-page.mjs` owns backend flags/storage init, reduced-motion default, safe garage entry/retry and actual canvas visibility. `mutateCaptureScene` records freshness atomically with mutation; awaitCaptureReady consumes it and uses source-generation (TLX), encoded copy-generation (WGX), synchronous-generation (GLX), legacy two-presents or native frame/present clocks. Resize/reload/display/epoch mismatch replaces marker. Strict barrier throws instead of silently accepting stale bytes; optional pause occurs in browser task after present. `awaitPresentedFrame` is weaker: returns false on timeout/null for absent soft present, and several legacy callers ignore result.

Soft bytes only come from a 2D canvas; WebGL buffers fall through to CDP. screenshotNativeCanvas separately requests renderer readback while presented and restores pause state. screenshotPresentedCanvas chooses 2D soft/view/game then CDP, never Playwright font/stability wait. CDP is unbounded unless caller supplies timeout/shotTimeout. PNG timeout can fall back to four tiled captures (>400k pixels), each max(15s,budget/4), so this is not a whole-operation deadline. screenshotGameCanvas hides carsetup opacity (not restored there), waits real visibility, defaults area-scaled 60s or 180s (>1.5M pixels), and restores headless state around CDP. `readSoftCanvasBytes` comment still describes an honest WebGL fallback but implementation explicitly refuses non-2D canvases.

`capture-runtime.mjs` layers whole-run deadline, phase/operation budgets clipped to remaining time, failure-state collection, provenance (source checkout vs shell apex-sha distinct), compositor recording and teardown over harness. Per capture collects camera damping anchors, independent sim/render/replay clocks, screen/error roots, pixels and renderer health. `capture-diagnostics.mjs` bounds SystemInfo diagnostic queries (3s default) and explicit capability checks; trace starts before navigation, streams through CDP, exclusive output, ≤64MiB/15s stop, partial file removed on failure.

Browser ownership is not a global CLI lock: shot CLIs generally call harness launch/shutdown directly. MCP owns `scratch/apex-browser.lock` (apex-tools-mcp.mjs:54,326..353), exclusive wx file with pid/tool/since and occupancy check; only owner PID releases it. Its known-gap table explicitly lists raw apex-eval and external browser MCP outside mutex. Persistent apex_track holds lock through session lifetime; extras sessClose waits EOF then owned process-tree cleanup before release (apex-extras.mjs:75..95,120..170). Harness shutdown drains registered resources including late launches, waits up to five seconds then force-cleans each (harness.mjs:175..193). Benchmark only force-cleans browser PID groups explicitly reported by IPC child. Direct `loading-probe.mjs` uses playwright/chromium and closes its own browser.

## Specialized probes and limits

| File(s) | Behavior / evidence boundaries |
|---|---|
| backend-compare | Same framing per requested backend, localStorage kill switches, governor and lamp warmup/flicker pinned by default; PNG MAD and changed-pixel maps from decoded saved bytes. Records warnings/errors but console errors/size warnings do not set failure. Requested webgl2 currently clears backend preference rather than pinning it, selecting shipped three default; actual backend is only recorded. |
| baked-scenery | Eight curated model sites across five circuits, prefetch models before race, debug camera and file-size (<5000) checks; full-page Playwright screenshot, older 10s/25s rAF-poll waits, no shared pixel health gate. |
| flyby / frame-report | flyby solves filmed poses deterministically through flybyCam; full saved/override/select/vary shot list, frozen tier grid, on-road abs(lat)≤12m exemption and inside-scenery errors; lift≥25m warning. frame-report is Node geometry only: box/terrain/road/car raycasts, subject cover/transmittance, horizon/motion/cut flags; fleet serial 180s-per-child, JSON default shot input ≤1MiB/256 entries, optional trusted legacy JS literal parser. Cannot judge materials/light/fog/billboard appearance. |
| cam-corners / cam-motion | Node VM numeric rig checks: five real circuits straight/left/right swing/dive; synthetic straight parked/live camera differences, speed opening, drift/braking and mode spacing. No rendered evidence. |
| motion-capture | recordVideo ticks live headless loop, ffmpeg extracts PNGs (failure/zero frames fail), second browser decodes luminance; drops 45% prefix, reports hard-flip mean/p90/max. Descriptive score, no calibrated pass ceiling; normal movement affects it. |
| flicker-gate | Nine fixed sites, A/A2 stills and 4 sub-mm dolly offsets, frozen scene clocks/governor/lamp settings; up to three settle rounds, optional A3/masks; misses counted, errors or measured failures/nonmeasurement fail. Header explicitly says ceilings are geometric unmeasured calibration; positive-control requirement is documentation, not performed in this audit. |
| garage-frame / garage-interior | WGX/GLX turntable A/B, real captured PNG gap samples; signed panelFrac can mirror free-side sample; rejects all-dark, flat wall, exterior bleed, low contrast/no floor, up to 8 capture tries. Current garageDiagnostics derives positive panel width ratio, so left-panel sign is not supplied by this caller. |
| garage-tap | Alternates prewarm off/on per fresh browser, pins optional Home scene, measures garagePrebuild firstFrame visit; per-run JSON, medians and artifact. Warm readiness timeout is caught, reported state may still be unready. |
| garage-before | Browser-free CI recipe: 11 factory teams in four shards, seven views, 30-day artifacts, watched-path recapture, manifest/fetch API. Exact-name artifact lookup across 20 ancestors; 4 retry attempts for 429/5xx/network with Retry-After ≤30s; plan skips persistent API5xx as non-gating. Manifest name/sha is producer metadata, not pixel checksum. |
| hud-survey | Device/camera/style/scale matrices, boot-key contexts, complete live reset and forced refreshes, normal/transient DOM probes, optional shots/merge/shard/plan; output report/findings/index and optional montage. Exit success means every cell measured/no cellError, not zero UX findings. rAF repaint and lit heuristic are not the strict capture-token barrier. |
| hud-mock / hud-live-sample | Mock is DOM-only black background after boot, one context per pointer profile, mock widgets/boxes/overlaps, source+cell+CSS+probe cache; no 3D or live transient proof. Live sampler keeps race running after jumps, overshoot >.5px, duration tolerance250ms, interval≥10ms, default40ms, 4px margin; null rect treated on-screen. |
| pit-shots | Geometry-relative entry/exit/lane/team-box framings from pit() and carAt(), tyres enabled; low-cost half-scale tier4 default, --full doubles presents, --no-models alters dressing. Plan uses example geometry without boot. Size heuristic flags blank but does not itself change exit; free-cam flag diagnostic only. |
| replay-camera-probe | ≤8MiB offline fixture, raw OpenF1 or current compiled script; bounded drivers/laps/traces covering seek120, removes radio URLs, real renderer/compositor recording over entry/seek/follow/UI exit/reentry. Checks restored camera preference and healthy pixels, logs eye deltas without distance threshold; actual pointer clicks with visible/enabled/hit-target guards. |
| repro-shot | Restores team/halo before reload, repro blob, checks onboard eye-to-car≤1.5m; still writes screenshot after refusal and sets failure. Header's known wrong cockpit warning is unresolved historical evidence, not reverified here. |
| wx-grid / lib/wx-grid | 24 cells (dawn/day/dusk/night × dry/wet/rain/storm/overcast/fog), fixed seed42/eye4.25/FOV60, resolved turns/fracs, WebGPU→three→webgl2 fallback, luminance/saturation/ratios/contact sheet. Load≥3 refuses. Nonmeaningful first WGX cell falls back; other nonmeaningful cells warn and may still report run passed. 'luma709' is weighted sRGB-byte luma, no linear-sRGB conversion. |
| webgpu-urban-gallery | Three fixed city traffic scenes through shot batch, 3840×2160 Ultra native Three/WebGPU, line off, ≥2 AI cars; verifies image plus requested renderer health/identified hardware adapter/non-lite/non-soft state/readiness receipt. |

## Scenery catalog and external consumers

`gen-scenery-locations.cjs` builds actual track geometry in track-build-vm, joins landmark fixture model IDs to emitted prop blocks, excludes suppressed/nonemitted groups, projects bounds centers to road unless an explicit authored/racing viewpoint exists; authored positions pass TrackSpace.sceneryFrac. It emits schema2 catalog plus omissions, and `--check` compares exact bytes. scenery-source-hash includes TRACK_VM membership, runtime geometry inputs, circuits/scenery/landmark fixtures, pack binary/manifest bytes and generator sources (deduplicated sorted paths), excluding unrelated manifest roster sections. Catalog explicitly labels real-world identity unverified and includes nearest-road vs requested-view distances (e.g. Fuji skyline source viewpoint differs from nearest projection). The generated JSON was fully read, not regenerated.

Source-reference consumers verified outside this directory: tools/lib/survey-scenarios.mjs:17 loads scenery-locations; tools/ci/deploy.mjs:363,464,610 handles merged catalog regeneration; tools/lib/generated-paths.mjs:23 lists generated output. tools/mcp/catalog-discovery.mjs:6 and garage-plan.mjs:4 import canonical garage catalog. tools/mcp/browser-http.mjs:19 imports probe helpers. apex-tools-mcp.mjs routes frame-report(:1566), HUD(:1605), apex-eval(:1877), shot(:1886), agent(:1916), garage(:2494). apex-extras.mjs:29 imports shared survey runner; :31 owns track-session and :391 routes shot-survey; :453 frame_fleet is tree-only. tools/garage-angles-fetch.mjs:31 imports garage-before recipe. Workflow consumers: hud-survey.yml:75,109,152; garage-before.yml:84,115,152; capture-gallery.yml:31,35; archive-evidence.yml:67,117..118; gpu-census.yml:713 urban gallery.

Unit/source consumers inspected by bounded reference scan (not executed): capture-tools-regressions, shot-jobs, shot-survey-runner, design-matrix, catalog-discovery, car-multi-shot-tools, garage-interior-gate, garage-before/-api, hud-survey, wx-grid, flicker-metric, frame-math/flyby-frame-report, tools-runnable, publish-evidence, agent-indexes/tools-w13a-agent-help, cam-motion. These pin helpers, schemas and CLI fixtures; their existence is not a test pass.

LSP: attached apex-lsp outline of js/render/gfx.js resolves Gfx.create/createInitOwner; Gfx.bind lookup fails because log text is not an exported member. Source read confirms create defaults null preference to three at gfx.js:275. Gfx.create references resolve definition gfx.js:267, export gfx.js:314, and use renderer-boot.js:319 (RendererBoot.create/start). Tools outside js use source scans as allowed by code-nav.

## Verified stale descriptions and practical caveats

- `shot.mjs` header says it rebuilds a race once after asset residency; implementation prefetches before the initial build (no second rebuild).
- `apex-eval.mjs` historical comment says agent budgets20s; actual agent BOOT_MS/TRACK_MS are45s.
- `backend-compare.mjs` header describes GLX webgl2 pin, but line129 removes the saved key; Gfx.create defaults three. A requested label alone is insufficient evidence of backend parity.
- `probe-page.mjs` soft-read header claims WebGL fallback; implementation checks 2D only. Await-present comments that mention 'never throws' apply only awaitPresentedFrame, not strict awaitCaptureReady.
- `design-matrix.mjs` launch-limit comment says it matches garage-angles load guard; matrix refuses Linux load≥3, garage-angles only warns. Garage budget is an estimate preflight, not runtime deadline; --plan reports overBudget and exits before reset/output creation.
- Garage resume is team-presence based and can skip a team from first existing PNG/sidecar without source/hash completeness. Design-matrix resume is stronger: signature binds source/request and verifies each finished file hash/receipt.
- Generic capture image health does not prove artistic correctness, hardware player performance or real-world landmark identity. Historical timings/unmeasured ceilings remain dated claims; none was live-confirmed here.

## Full read ledger

All rows are full source reads, ranges inclusive. SHA256 hashes cover exact working-tree bytes. Initial multi-file capture helper output truncated only inside capture-runtime; that file was reread in full, so no missing source was counted. The repro-shot prefix was read through line99 and completed100..113. Large files used contiguous bounded chunks: garage-angles1..185,186..410,411..650,651..900,901..1150,1151..1400,1401..1650,1651..1900,1901..2122; probe-page1..200,201..400,401..600,601..800,801..917; hud-survey1..220,221..460,461..698; frame-report1..160,161..360,361..561; garage-before1..280,281..535; scenery JSON1..500,501..1000,1001..1500,1501..2000,2001..2500,2501..3000,3001..3500,3501..3744. Other files fit complete bounded outputs.

| File | Read range | Bytes | SHA256 |
|---|---:|---:|---|
| `tools/shot/ab-gallery.mjs` | 1–141 | 14274 | `f89e493e27543c6276fb5b3977e57897bf7591566271c41f4100c6bc37193f68` |
| `tools/shot/agent.mjs` | 1–375 | 18599 | `21fb2a8bd7c4b388316e25e27bfa8ee536fa95826a4f93b2ea64b3a3e98141a4` |
| `tools/shot/apex-capture.mjs` | 1–486 | 25178 | `8449608ba999b7f89f4a8eaaac73272996e4c5d777c1db7b8eb0e784d9f179aa` |
| `tools/shot/apex-eval.mjs` | 1–181 | 9613 | `76dae71f48574741b825d411e830cca16b2b012d9f4b1e4eb34061316f434f57` |
| `tools/shot/backend-compare.mjs` | 1–284 | 14562 | `9529d98c1805dba90be93b5e015371d1619f1c50b0f3988d78ddb96d012ac8c6` |
| `tools/shot/baked-scenery.mjs` | 1–175 | 5737 | `ad88db9f6203166f2ccf48780a96b511e6a2d9f1a62770b49795ecee0013116a` |
| `tools/shot/build-gallery.cjs` | 1–65 | 2448 | `28a6448c29a667dd4664fbbb343a0ad078f8f9d924d8b9550f72c0cc34eb4a97` |
| `tools/shot/cam-corners.mjs` | 1–131 | 4807 | `342773d1c60147db360022a073c8d3db9ec31699c98cf706d4db3b6b4773d95b` |
| `tools/shot/cam-motion.mjs` | 1–168 | 6569 | `01af8f3d8bc256531594797a908814a1c20b22116b8547eac7fcd9af24069f40` |
| `tools/shot/capture-benchmark.mjs` | 1–112 | 7812 | `567428160ccc3f17c7c35cdd336a8b58376b0891180d668c22b59adc144aa605` |
| `tools/shot/capture-contract.mjs` | 1–69 | 5672 | `85cfae9ca9a1c9ffce8f7ab4e2b7d8af213e09a01c874abf784b92f8117658d5` |
| `tools/shot/capture-diagnostics.mjs` | 1–108 | 5886 | `6d8959783e82e3d82358086a1b86d338d083ec8b5fb74abdea25b051845b4a8c` |
| `tools/shot/capture-gallery.mjs` | 1–63 | 7907 | `6158f4678a370ae5000a24e9a9439a221af8641ac93836706e03c807a2a321b2` |
| `tools/shot/capture-options.mjs` | 1–115 | 7092 | `85303ba3fb4e9ce83b72cddae63c2e6296db1571fdd772294accc8905c06e73c` |
| `tools/shot/capture-runtime.mjs` | 1–188 | 13646 | `2347a64ced673a14e61c792fbda243770f40e5e6bb62aab91c83b82fabea7e49` |
| `tools/shot/design-matrix.mjs` | 1–88 | 7878 | `76f6e95757b6b2f287dd13b8ac0d3be753d5e875a1ba4d25307b21eafc3ef8e7` |
| `tools/shot/export-history-evidence.mjs` | 1–48 | 3263 | `7bb84d5e67d2cf8478077d7bdf5da511cc7ce2b469b38c8e61fd4985918f1578` |
| `tools/shot/flicker-gate.mjs` | 1–370 | 21290 | `521369b17c970c07a6aa695d81d3f53ce98cdaa9668e77bcdb606f3ba3765845` |
| `tools/shot/flyby.mjs` | 1–237 | 13144 | `fd6b60ce0f1d1d53114c75dc644109fe2e2880b6f6ffad84a83292edb974d879` |
| `tools/shot/frame-report.mjs` | 1–561 | 31118 | `cf6713dd628a5e45c0e613cf0e62541e309fd12ebb4689e9a244fb4f03cfffcf` |
| `tools/shot/garage-angles.mjs` | 1–2122 | 114248 | `06e77116526652d1b93cc585529a6216e97b11b70fa508db34a6460ce4236539` |
| `tools/shot/garage-before.mjs` | 1–535 | 21345 | `e4fdfae4f57c97f909b7e60f7ea26f34e7b5143ea7b1b565f81aed065bc51d58` |
| `tools/shot/garage-frame.mjs` | 1–145 | 6312 | `53e4c917eaec40c33a3887fc4d39b91ebe76f3e4b84f4c5cf81c305d2a083068` |
| `tools/shot/garage-interior.mjs` | 1–102 | 4761 | `bb9cd64da48837d4421c276a1ed14c87dcdce3a7bdd86c00887ace6ef4383daa` |
| `tools/shot/garage-tap.mjs` | 1–101 | 5388 | `976936f019e4c46fa976136e3509aca066a53b7553bff18934c67734480d0d6c` |
| `tools/shot/gen-scenery-locations.cjs` | 1–146 | 9695 | `ddf22e47aea711eaee98b48c4d1fbd9b3224850debe5b92dcfe8b7768f362c6c` |
| `tools/shot/hud-live-sample.mjs` | 1–219 | 12156 | `481cb76d81486cdca1ca5fd510631fb85b91a23295872eeb0ce8d0775c576cd1` |
| `tools/shot/hud-mock.mjs` | 1–277 | 19130 | `5c3bf60f643abbeeb71b7744fee3420b0bb0c0c839a62c316845082f314f9b71` |
| `tools/shot/hud-survey.mjs` | 1–698 | 42246 | `faceae07b2df8050198f96f280c09fe245242f7b5803c56aab36f0fcde392d08` |
| `tools/shot/lib/design-matrix-run.mjs` | 1–107 | 8130 | `972bec41bfd753d90e045b726d2652879ad03c18d3b5d2c8480720d9a5049903` |
| `tools/shot/lib/design-matrix.mjs` | 1–220 | 12820 | `4127a6c5650c4db491b7f4ba504850f5032f3c04cca0a8219f96d16f9ecfd81c` |
| `tools/shot/lib/garage-camera-catalog.mjs` | 1–88 | 6869 | `1cbad46bc87aa8bed80282f620d62c685126ce5bd39b2b42f7e13daded42b0ae` |
| `tools/shot/lib/survey-runner.mjs` | 1–273 | 11550 | `96ebe278c6cd79bd58bcf2174cd5bcb9afc283e229f2d720bd6413e7169dbbfa` |
| `tools/shot/lib/wx-grid.mjs` | 1–148 | 5600 | `e04e06e66cc1ae97ec77e4e850aa7e7e926349b02a6ab926c65e82a5166d2f3d` |
| `tools/shot/loading-probe.mjs` | 1–97 | 5757 | `f56dea486ddd81fddc47fbdb038d6dfce9b8f5bb0b3bdac5df61a721fd702475` |
| `tools/shot/motion-capture.mjs` | 1–159 | 9152 | `336efddc963aee80a1fa3df9865996c8f505252a00faa18a5abc00ad93aa9277` |
| `tools/shot/pit-shots.mjs` | 1–327 | 15344 | `0e47d353a0ecd3cd3a30f5c0f0e1d9e35c7899f623eab6e58255214525d7e469` |
| `tools/shot/probe-page.mjs` | 1–917 | 44803 | `9df271dd7e483dd11147c3e7fb6a2090a567598065205d6d13f053a81904a434` |
| `tools/shot/profile-gameloop.mjs` | 1–102 | 5287 | `b1a02cec543181895bf51f9b1e7a81a3e6e849f50efc1e2b8fa5a9d4cbaf774b` |
| `tools/shot/publish-evidence.mjs` | 1–199 | 13638 | `124e2dd60883988e94022b79bbadcb731bd0100adb2f266b971da734c0b59577` |
| `tools/shot/replay-camera-probe.mjs` | 1–198 | 17105 | `293a993426e25425035984df421a0ca934d613af182975c2a70042387ae23cae` |
| `tools/shot/repro-shot.mjs` | 1–113 | 6522 | `b6f428a999687e7f690fd1ab3f4779e56ebaeb5c72317cd82427a09e6633d995` |
| `tools/shot/run-capture-request.mjs` | 1–40 | 2596 | `15bdbdd40563f36078a009cb4299e0e33e5b1ff3ab63a0525ebe193f9e61d9bd` |
| `tools/shot/scenery-locations.json` | 1–3744 | 115141 | `95b4296678f3ddce96b25ea9d97b03d412990aefae0a8559a2603115b29f1e65` |
| `tools/shot/scenery-source-hash.cjs` | 1–44 | 1936 | `e71b34f8720eae979fbe42205edb21a1a7449b8f5ebf03c04f6402b36e967e68` |
| `tools/shot/shot-jobs.mjs` | 1–199 | 9864 | `67a6be0b00ca6658df6e1c26666193ce39941be3e7088bb56c6b20c499d3d71b` |
| `tools/shot/shot-survey.mjs` | 1–238 | 12174 | `f5102426b20e40d0f536fefe4129ba0c346979b6e245bc25f37d481882629984` |
| `tools/shot/shot.mjs` | 1–305 | 14638 | `48f3ae666446fa2522a21aa6bb127a4a53eb817f58dd0e499c79a22c8ae51038` |
| `tools/shot/track-session.mjs` | 1–291 | 17734 | `0012960be946db300046371174f992c8d5d424a22c28836fb2c59ce2be26d87b` |
| `tools/shot/visor-lab-export.mjs` | 1–21 | 2154 | `5225794dfb3a818e82e8f0def0df6eb8ebd87026bb583dff11319a8d033a806b` |
| `tools/shot/webgpu-urban-gallery.mjs` | 1–66 | 4743 | `7d99f15ae382f12a474b5bbe84b669640d0d6547ff09ed10c4f571929478830d` |
| `tools/shot/wx-grid.mjs` | 1–339 | 14212 | `03afcceb8c017aad2a0f33b33b58b132e4a8474245032a7251575ae4c4d09478` |
