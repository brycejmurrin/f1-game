# Agent and miscellaneous source map

## Evidence and coverage

Source-only analysis on 2026-10-27 at `212adc24b985b120a63507c988abea69e7740e74`. No runtime/browser checks or commits. Read AGENTS.md and `.claude/skills/code-nav/SKILL.md`; attached apex-lsp used for consumer evidence. An initial oversized combined output was truncated and is excluded; bounded rereads below are evidence. All 25 assigned files (10,101 physical lines) were read end to end. This is source coverage, not live behavior verification.

| File | Lines | Completed read ranges | SHA-256 |
|---|---:|---|---|
| `js/agent/agentview-corners.js` | 291 | 1–291 | `75dcd3ce68ebcac9c9878462b3f2b6bf344502c99655dbc10cab3ca46613f67f` |
| `js/agent/agentview-raster.js` | 716 | 1–350; 351–716 | `12e89fe25fd063f49cf757db4bbd9ecc03965a31144cf2abc205659fd6d2f4c9` |
| `js/agent/agentview.js` | 2320 | 1–400; 401–800; 801–1200; 1201–1600; 1601–2000; 2001–2320 | `7cbb75d8371fbed0e9f98b6f0dbb942f490a7d430be66f80f46a1da4b2c6d700` |
| `js/agent/apex-cam.js` | 368 | 1–368 | `5314cdd69c30468bb05f88a0f8795210af2add8e0d71bd83b1552915ce649a5f` |
| `js/agent/apex-gpu-capture.js` | 296 | 1–296 | `5946ab2d028c3544401a1f8072ea78e0a1120820ee055bd8077b2856a53455bc` |
| `js/agent/apex-lifecycle.js` | 123 | 1–123 | `0144e74b2a26dce674ef36584d11eeaed5a1b4140171bd1eec4a7db86a2b0217` |
| `js/agent/apex-lobby.js` | 123 | 1–123 | `ebda80729a1e3dd647da1038002e184d7a74623a73d38b4c2425d5abb9fc3a6e` |
| `js/agent/apex-net.js` | 312 | 1–312 | `00c0140df08b82b4c75b8d894adec18cfcd17bf41fcf46c0d6a8e41d78a63e0a` |
| `js/agent/apex-track.js` | 149 | 1–149 | `275050e7855d328662285b66cd1aa13911a18e167def621eb76cd4f242c4f23e` |
| `js/agent/apex.js` | 2495 | 1–400; 401–800; 801–1200; 1201–1600; 1601–2000; 2001–2495 | `fc763bef7f8648781baa4f884933265d07545630a54df8218197e6aa439c7fc1` |
| `js/overlay/feed.js` | 220 | 1–220 | `8beb0aeeb127cfa0bd7bbc302d64b6ab84c225011b98066a086e8f76bf75360f` |
| `js/overlay/render.js` | 202 | 1–202 | `966303d8f7b3c9bdf4c60470b9a1747674eef80cd2cb8672b80d7f63fc199565` |
| `js/share/share-card-data.js` | 62 | 1–62 | `e90e70fdf9ed346c476bb9fd9dbdc4f1d84ac66071d2676c6839af6b21124bda` |
| `js/share/share-card-layout.js` | 71 | 1–71 | `38ba0634cfb746a3cbb9ce853adfe70de46c27aa22c91136ce75bbb958665f90` |
| `js/share/share-card.js` | 136 | 1–136 | `ce15b38d173788a78a4b55fa321dabb52a3c84baddd4e7ee1aa67d89144426f7` |
| `js/workers/bitmap-decode-client.js` | 178 | 1–178 | `6498da8669594458c0e449918f7909413c9881084300be1e33ac1c88e270e409` |
| `js/workers/bitmap-decode-worker.js` | 143 | 1–143 | `8ed06b7f76ea95dfcfcb0fb9f7683e2dd34c5cfd9ad0bfff02269bb4f52f0461` |
| `js/xr/apex-xr.js` | 183 | 1–183 | `11ce03f58cc29f115386effcbd7da4fe63eda933a2b52e2b2e463af9628e3dbf` |
| `js/xr/xr-boot.js` | 398 | 1–398 | `d70edb96a996f7686c3e1a2ae44bf661902911c1c9e72c0b72a021c2d9435475` |
| `js/xr/xr-input.js` | 135 | 1–135 | `d6fc33e4ce2d193c698cb2231610dbebfdc378c95ccca549e06590b683260979` |
| `js/xr/xr-opts.js` | 206 | 1–206 | `b1b27a7f116bf6d64b28ad13b5bf17419b479282ff03385104befe80802f600c` |
| `js/xr/xr-plan.js` | 140 | 1–140 | `31636f9ccc7b84513a3317c49c8f0de73a65bec488708571cbefa4ae40ea560e` |
| `js/xr/xr-rig.js` | 229 | 1–229 | `d455f5f6a3f8da92e1663d3b5991b3163820b439f1e4093c17da340656c823c3` |
| `js/xr/xr-session.js` | 485 | 1–485 | `284e627c24776ce5ab483de5b90d7e0caa70942b50f0546c7e1bc00419a5d12b` |
| `js/xr/xr-ui.js` | 120 | 1–120 | `7d7d93bdf3b665d4747240905ddddfa00ee880fe917b54f50f5751c07b802ef1` |

## Ownership and contracts

The source is classic-script IIFEs. `ApexApi.create(G)` constructs the flat `window.__apex` console, creates one `AgentView`, then spreads the camera, track, lobby and net helper hook objects into the same API. `AgentView.create(G)` owns the structured agent view and constructs `AgentCorners` and `AgentRaster` with bespoke dependency bags. `types/game-ctx.d.ts:831–853` explicitly distinguishes those bags from `GameModuleFactory.create(GameCtx)`; both ApexApi and AgentView are registered context factories. The context also declares netPlay/netLobby/countdown state (723–731), episode-owner reset (797) and camera damping observation (799).

`tools/manifest.cjs:999–1022` owns LAZY_AGENT and its helper-before-parent edges. Normal deployed players need not parse the agent bundle; the manifest describes test/local/dev-flag injection. `xr-boot.js` and `xr-opts.js` stay in FULL; the six session/math/facade/UI files form LAZY_XR (1190–1209). Share data/layout/painter ordering precedes daily-challenge consumers (869–871). The decode client is a normal script; the worker is fetched by Worker URL, cache-keyed through ScriptLoader when available.

| File | Responsibility and notable boundary |
|---|---|
| `agent/apex.js` | Flat dev/test console; race and TT staging; teleport/reset/input/stepping; garage framing and parts; career and physics controls; render/perf/assets/light/audio/persistence diagnostics; thin structured-view wrappers. |
| `agent/agentview.js` | Typed readiness errors, version/convention metadata, world/field snapshots, delta baseline, structured scenery and car inspection, geometry survey, bounded rollout, static track information and help manifest. |
| `agent/agentview-corners.js` | Per-track corner cache, curated-apex snapping or smoothed-peak fallback, overlap merging, road shape and next/upcoming braking hints. |
| `agent/agentview-raster.js` | Optional camera AABB/road raster, orthographic triangle car elevations and metric top-down map; shared unit-right normalization. |
| `agent/apex-cam.js` | Game-camera selection, synthetic previews, flyby authoring, camera tune, arbitrary/free/orbit/car/roadside/dolly views and temporary studio lights. |
| `agent/apex-track.js` | Node/projection/barrier/terrain/geometry diagnostics; scenery fraction conversion and pit-side exclusions. |
| `agent/apex-lobby.js` | Timing/sector/lap/field reads and human/local car-role/input staging. |
| `agent/apex-net.js` | Netplay/lobby inspection and controlled fake endpoints; deterministic wire pumping, SDP/ICE diagnostics, ready/start and session events. |
| `agent/apex-lifecycle.js` | Once-installed event counters; page visibility/bfcache/resize/context-loss read/drive hook. |
| `agent/apex-gpu-capture.js` | Opt-in vendor script loading; Spector summaries and webgl-lint findings; generation guards and timeout-bounded capture. |
| `overlay/feed.js` | Read-only v1 broadcast frame projection, battle/sector/tower rows and periodic full-frame differ. |
| `overlay/render.js` | Standalone overlay DOM painter, patch merging, query options, initial waiting state and demo. |
| `share/share-card-data.js` | Sanitized immutable daily-challenge model and lap formatting. |
| `share/share-card-layout.js` | Pure model/spec/text-metric to frozen paint operations; three sizes, fitted typography and QR tile. |
| `share/share-card.js` | Font/QR readiness, canvas painting/PNG encoding and Web Share/native/browser delivery. |
| `workers/bitmap-decode-client.js` | Shared worker lifecycle, sequenced requests, transfer cleanup, timeout/fault fallback and explicit cancellation; optional strip lane. |
| `workers/bitmap-decode-worker.js` | ImageBitmap transfer and restricted baked-PNG strip inflate/unfilter to transferable RGBA bytes. |
| `xr/xr-plan.js` | Pure armed/off and WebGL2/experimental-WebGPU renderer plan from capability/preference/boot bags. |
| `xr/apex-xr.js` | Cached plan/capabilities, persisted detection latch, synchronous boot override and fallback reporting. |
| `xr/xr-opts.js` | VR arm/backend preference rows and live controller/existing-input choice. |
| `xr/xr-boot.js` | Lazy session bundle, reversible backend pin, renderer binding, transient cockpit ownership, clock handoff, eye/cull matrices and stereo submission diagnostics. |
| `xr/xr-session.js` | Generation-safe session start/end, capability/feature negotiation, reference spaces, recenter/reset, XR frame lifetime and controller polling. |
| `xr/xr-rig.js` | Pure column-major seated-anchor/eye composition, rigid inverse, conservative union frustum, recenter transform and stick deadzone. |
| `xr/xr-input.js` | Pure xr-standard controller mapping and edge latch, menu navigation and source-owned remote input injection. |
| `xr/xr-ui.js` | Capability-gated ENTER/EXIT button; backend-switch/reload path, fresh activation prompt and visible failure feedback. |

## Agent data flow and state

`apex.js:6–40` preserves synchronous race descriptor fields while making the result awaitable; awaiting is necessary when consumers need the built circuit after lazy hydration. Its hook wrapper (193–230) only forces a synchronous track build when circuit payload/toolkit are resident and neither loading nor a stepped/worker build owns it. `race` and `tt` bypass that wrapper's implicit build because their start path owns hydration.

`jump` updates cumulative progress by the arc delta, `_prevS`, world position/heading, rescue/wall state and all six interpolation anchors. `reset` (2053 onward) resets subsystem ownership, grids, reliability, run-up, drivetrain/AI/aero state and transient fields, then starts a new view episode and clears test input. The actual final transient loop assigns `undefined`; nearby older prose about deleting is stale. This distinction matters for V8 object shapes and for accurately describing the implementation.

The structured view's public units/conventions are metres, m/s, seconds and radians unless keys say otherwise; positive lateral is right and positive curvature is left. Scene `side` is egocentric while `trackSide` is centreline-relative. `raceOrder` places retired cars after running cars. `slipBudget` is shared by world/obs/physState, with stored axle utilization preferred over the pre-first-tick estimate. Driving snapshots require a track, a player and initialized `px`; failures include `{ok:false,error,message,fix,state}`.

`world` emits brief/drive/full detail, a view-local sequence and episode id. Drive adds time-scaled road preview, nearest rivals, upcoming corners and affordances; full adds session, raw/smoothed physics and tunables. The delta algorithm uses numeric deadbands, tighter tolerances for unit-range gauges, whole-array replacement and a recursive merged baseline. A missing/mismatched sequence or a key-shrinking payload returns the full snapshot with `deltaBase:null`, since the delta format has no deletion tombstone. `beginEpisode` invalidates the baseline.

`rollout` is a synchronous bounded simulation interval with optional policy decisions at policyHz. It stops at player finish or non-running state, records speed/off-track/contact/corner/terminal samples, and restores the caller's input and observation-delta bookkeeping in `finally`. It advances simulation intentionally; the restoration does not roll back car state. Policy failure becomes a typed error. Static objective/help text contains historical fixed tuning claims (for example objective's boost/cooldown and 780-credit description); measured carView resolves the owned-career parts cap dynamically. Treat the live state/model fields as stronger evidence than static explanatory strings.

Corner geometry smooths curvature over a 30 m half-window and integrates heading across the corner. Curated turns snap within a neighbor-bounded window; same-direction overlapping corners merge. Banking, gradient, kerbs and exit-straight context accompany approximate braking hints based on LAT_GRIP/BRAKE_DECEL constants, explicitly described as hints rather than car physics. The low-level `__apex.corners()` uses raw curvature peaks, so it intentionally differs from the structured corner table.

Scenery inspection uses the semantic prop registry. Query composes kind/radius/arc filters, caps results and emits prototype shapes plus instances; describe expands stable registry-index ids. The cached circuit model clusters repeated kinds by side and arc distance, retaining notable landmarks separately. `survey` screens measured props and sampled terrain with explicit thresholds; prop-over-road AABBs are candidates, with vertex-level and browser suites named as authoritative. Raster/visible results depend on the last rendered camera unless a synthetic camera was requested, and carry stale-headless warnings. The camera-view raster uses approximate AABBs; triangle car elevations use real mesh geometry with flat lighting, not the production renderer.

## Overlay, share and worker paths

OverlayFeed produces v1/seq/t state, lazy tower rows, battle, sectors and caption. Empty sectors and battle wrappers are pooled. `rows` snapshots cars on first access, so consumers should read the frame in its creation turn. `createDiffer` emits a full frame every 2 s by default, compares typed fields between full frames and explicitly clears battle when leaving race/count. Caption ids suppress repeats until clearing. OverlayRender keeps a fully merged frame so omitted patch fields retain their previous values; non-live state hides and clears battle independently. It updates text only on change, moves rows with transforms and caps the tower at 20.

ShareCardData strips control characters, bounds strings, normalizes branding text, validates daily date/medal/link and freezes model containers. Layout returns frozen rect/text/QR operations for portrait, landscape or square. Rendering waits on fonts (bounded 1.5 s) and lazy QR availability when needed, chooses OffscreenCanvas or DOM canvas, emits PNG and releases canvas dimensions in `finally`. Delivery tries Web Share, preserves user cancellation, then native download or object-URL browser download; URLs are revoked later.

BitmapDecode owns a single worker and pending sequence map. Timeout or worker faults retire the instance and reject all pending requests, allowing normal decode to fall back to main-thread createImageBitmap. Explicit AbortSignal cancellation suppresses fallback and closes an abandoned bitmap. Replies from a retired worker cannot settle current work and must dispose transferred bitmaps. The strip prototype is OFF unless `apex26.packDecodeWorker` is exactly `1`; it returns null on refusal/fault/timeout so Assets retains its page decoder. Its worker accepts only suitable noninterlaced RGBA8 PNG strips, rejects color-management/unknown critical chunks, inflates IDAT with DecompressionStream and implements all five scanline filters. Successful strip replies transfer the pixel buffer; callers receive per-layer views over it.

## XR lifecycle and renderer seam

XRPlan is pure and separate from the live attachment gate. Armed/capable default plans select WebGL2; experimental WebGPU requires both GPU and XRGPUBinding capabilities, with a session fallback latch overriding preference. ApexXR caches capability and plan bags and records fallbacks. XrUi's practical entry path calls XrBoot.ensureXrBackend: when the live backend cannot attach it saves the user's renderer preferences, pins TLX plus force-WebGL, marks pending entry and reloads once. After boot, mountUi restores the saved preferences and prompts for a fresh tap because reload loses transient user activation. Thus plan labels alone do not prove which backend actually presents.

XrSession start is deduplicated and guarded by a generation across requestSession, reference-space and renderer-attach awaits. Cancellation ends a newly returned stale session. WebGPU is requested as an optional feature and only accepted when actually granted; request failure retries WebGL2. Local-floor falls back to local. XrBoot injects renderer attach/detach and start/end/frame callbacks; start cancels the window rAF and transiently owns cockpit camera, end releases ownership and schedules exactly one window loop. Visibility/reset/end drop the XR remote input lane and request pause through the game's eligibility path.

XRFrame poses are valid only in the active XR callback. Public recenter requests queue until a valid frame; reference-space reset requires explicit recenter and suppresses driving. `eyeFrames` returns borrowed reusable matrix bags, never durable snapshots. XrRig composes each eye with the car's seated anchor. XrBoot uses a conservative union of drawn eye frusta for world culling, while presentXR receives individual eye matrices. Controller mapping prefers the left stick for steering, right/left triggers for throttle/brake, A/X for recenter/select and B/Y for pause/back; menu navigation requires a granted DOM overlay. EXISTING CONTROLS releases only source `xr`, preserving another remote lane's newer input.

## LSP evidence

Attached apex-lsp references were queried with `files:true, limit:40`; all returned file sets fit in one page. Counts include declarations/exports, not just runtime calls.

| Symbol | References / files | Consumers beyond its own implementation |
|---|---:|---|
| ApexApi | 3 / 2 | game.js; create reference at game.js:79 publishes window.__apex |
| AgentView | 11 / 2 | apex.js |
| AgentRaster | 3 / 2 | agentview.js |
| AgentCorners | 3 / 2 | agentview.js |
| ApexCam, ApexTrack, ApexLobby, ApexNet | each 3 / 2 | apex.js |
| ApexLifecycle | 4 / 2 | apex.js |
| ApexGpuCapture | 6 / 2 | apex.js; text-match caveat for untyped window alias |
| OverlayFeed | 7 / 4 | overlay/render.js, race/broadcast.js, race/tv-graphics.js |
| ShareCard | 5 / 2 | race/daily-challenge.js |
| BitmapDecode | 5 / 2 | render/shared/assets.js |
| XrBoot | 30 / 8 | game.js, car/car-draw.js, render/shared/mirror-pass.js, camera/vantage.js, race/broadcast.js, xr/apex-xr.js, xr/xr-ui.js |

Additional caller queries locate ShareCard.render in DailyChallenge.shareCard (daily-challenge.js:172), XrBoot.bind in game.js:9495, and OverlayFeed.frame in standalone overlay demo/boot and TvGraphics.tick (tv-graphics.js:73). BitmapDecode.decode returned zero direct uses with an explicit module-file fallback/unverified-export warning; it is not evidence that the exported decode helper has a production caller. A separate strip reference query locates the actual Assets strip integration at render/shared/assets.js:253. No runtime claims or dead-code conclusions are drawn from those counts.

## Verification handoff

Documentation only. No source edits, browser/runtime calls, tests or commits were performed in this lane; the parent owns the combined docs-integrity and agent-config checks. The hash ledger covers all assigned source, with no continuation gaps.
