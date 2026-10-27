# Unit group 44 — complete source map

All 18 assigned files, 4,832 lines, read at HEAD `8a222466bc83de7cdbe6a42989f19f7824ce4c06`. This is a source map, not a passing test report. No tests, browser runs, runtime source edits or commits were performed.

## Read evidence

Every test was returned as contiguous windows of at most 100 lines and fewer than 10,000 source characters. A globally truncated initial batch was superseded by complete returns for the affected renderer-soft-lifecycle windows (201-660). Ranges are inclusive and hashes are SHA-256 of complete bytes.

| File | SHA-256 | Complete read windows |
|---|---|---|
| `tests/unit/renderer-boot-island-preload.test.mjs` | `63aa9b57713b0050ff524cd483021f76fe03737d1d1be8345c15cf653b73294b` | 1-100, 101-132 |
| `tests/unit/renderer-boot-timeout.test.mjs` | `c5254170048cbbb43fd3bbb7f00f71422a1247bdaea15cfc0fc7dcfe2f4a513b` | 1-100, 101-200, 201-300, 301-319 |
| `tests/unit/renderer-picker-unavailable.test.mjs` | `cb4b571596f13eda0bf48f60b29f4e3a07a897bdfa643a357bbfe729f54bce1b` | 1-100, 101-137 |
| `tests/unit/renderer-soft-lifecycle.test.mjs` | `7f77db7c1ee892c0d180168751951ac40585a85c60bad28a0b9c7dad29ab0964` | 1-100, 101-200, 201-300, 301-400, 401-500, 501-600, 601-660 |
| `tests/unit/rendergeom-graph.test.mjs` | `a6701a0373f01278473694e44a100b0febfc2d07878bf069472004573359716c` | 1-100, 101-161 |
| `tests/unit/rendergeom-staging.test.mjs` | `3d2ce82c1f0e12c5a0717e24fbfe230945886789425199e0b9a4dd1582ed4cc4` | 1-100, 101-139 |
| `tests/unit/rendezvous-worker.test.mjs` | `b31c2cacf1dc58f786ff8ad8973e2ab05747bfb66f827ec051a0a9d61e66f0d6` | 1-100, 101-200, 201-264 |
| `tests/unit/replay-buf.test.mjs` | `fac52d7df1bb8158e6a66b5404ee956f7286df7c74da4bc4292b776788818dab` | 1-100, 101-200, 201-300, 301-400, 401-500, 501-600, 601-700, 701-799 |
| `tests/unit/repo-size.test.mjs` | `7b8102e690e2192730aaaa51e8b1480e8a70a61e4acf490dc92cb6f29b0672dd` | 1-91 |
| `tests/unit/report-server.test.mjs` | `bec059a602d5f2946c353ba1d81c0ee861843f1bd56a5d1ec56f3f9d1f13bd8d` | 1-100, 101-138 |
| `tests/unit/res-scale-census.test.mjs` | `1e820ff3a67281a2f4382d1a48c6733e37529f1f31452a3ef9e9ae8611d431e4` | 1-23 |
| `tests/unit/results-cam.test.mjs` | `7d4667dcca98f91ef082c36c1987cdc1ed52f7d678d50f0503c3e6944c375dff` | 1-100, 101-200, 201-300, 301-400, 401-500, 501-600, 601-700, 701-720 |
| `tests/unit/retired-car-obstacle-vm.test.mjs` | `07018f8a73507d03dab09881e977e19e3d5c4031ae1debda3e964a37a31469d9` | 1-100, 101-108 |
| `tests/unit/retro-shift-lights.test.mjs` | `7cfaf638b4801f4d1d8d0d97cc2302076df1df9860900e60c493c126f9fce741` | 1-86 |
| `tests/unit/ribbon-cpu-release.test.mjs` | `dad431ce3fdafc2d15a638102a97c509a7a8f256195092922ab660b365eee0a8` | 1-49 |
| `tests/unit/rival-attach-init.test.mjs` | `7b89aeb546dccedd1487af41027a9b0d282f7cc4c51151f9bfe80a69726a715c` | 1-100, 101-200, 201-250 |
| `tests/unit/rival-audio.test.mjs` | `500f2d1ac22f956e022a6efe95e4f35f6ad67b5ad438ca7273a4052c0959369a` | 1-100, 101-200, 201-300, 301-400, 401-493 |
| `tests/unit/rival-contact-sfx.test.mjs` | `ad00048fc4fc45babe5f6be1dffffc2a22b17efa964490f9d447e2a559b51309` | 1-100, 101-200, 201-263 |

## Navigation and evidence boundaries

Read AGENTS.md and `.claude/skills/code-nav/SKILL.md`. Shell apex-lsp outlines resolved RendererBoot, RendererPicker, ReplayBuf, ResultsCam, RivalAudio, GameAudio, TrackGraph, WGXChunked, CanvasCssSize and CarMesh. Partial outline pages establish the returned declarations only; no full-production audit is claimed. Source reads: js/camera/replay-buf.js:11-70; js/camera/results-cam.js:16-76; js/audio/rivals.js:209-278; worker/rendezvous.js:1-70; tools/mcp/report-server.mjs:1-65; tools/ci/repo-size.mjs:1-65; tools/gfx/res-scale-census.mjs:1-65. Explicit test imports/source loads establish additional targets.

Helpers: abs-src supplies evaluation filenames; seed-log/seed-clipboard supply globals; game-source/symbolSource and fn-source extract current production source; render-rate-stub supplies unrelated tick globals; game-vm boots real runtime with fake host surfaces; fake-audio-vm records audio behavior; git-fixture-env clears inherited Git environment. These are dependency relationships, not full helper audits. Fake script names, relay URLs, IPs, stack filenames and paths constructed beneath test temporary roots are descriptive fixture data, not assertions that those files/services exist.

## Cases

Each row names the asserted meaning in the original case name, identifies declaration range, all explicit assertion call spans and production target. Parameterized rows retain templates; fixture paragraphs enumerate expansions. Assertion spans include nested callbacks; helper-only spans are recorded separately. Source pins mean source shape, behavioral VM tests mean state under the stated fixtures; neither implies browser/hardware validation.

### tests/unit/renderer-boot-island-preload.test.mjs

Target T01: RendererBoot.create / start; preloadLikelyBackend, preloadThreeVendor (js/render/renderer-boot.js).

Fixture and semantics: VM storage maps, deferred roster tlx.js/wgx.js/glx.js, manual timers, fake DOM link ledger and Gfx factory (23-93). Explicit pick, prior-bound pick, GPU hunch and GLX default are distinct variants.

Limits: No network priority measurement: attributes and loader calls only; fake roster paths are descriptive.

Shared/helper assertion spans: none outside test callbacks.

| Name / asserted meaning | Range | Assertion spans | Target | Evidence / limits |
|---|---|---|---|---|
| eval-time sure THREE guess does not high-priority modulepreload the vendor island (#3515) | 95-115 | 107, 108, 112-113, 114 | T01 | Behavior under fixture; section limits apply. |
| start() with a THREE pick still loads TLX scripts and then idle-preloads the island | 117-132 | 119, 125, 126, 128-129, 130-131 | T01 | Behavior under fixture; section limits apply. |

### tests/unit/renderer-boot-timeout.test.mjs

Target T02: RendererBoot.create/start (js/render/renderer-boot.js:32); Gfx.createInitOwner; GfxRecovery.create; RendererPicker.applyBackend.

Fixture and semantics: Manual timers and storage maps (21-51), real Gfx owner seam (20), deferred backend promises; compatibility DOM/popover/focus/clipboard fixture (135-172). alreadyClaimed expands false/true; GPU guesses cover unset/three/webgpu and three GLX-guess reasons.

Limits: Timers are manually fired, not measured wall time. Recovery classification is restricted by backend/vendor stack; no actual GPU binding or native modal behavior. The literal app.js stack is deliberately non-vendor input.

Shared/helper assertion spans: none outside test callbacks.

| Name / asserted meaning | Range | Assertion spans | Target | Evidence / limits |
|---|---|---|---|---|
| a Gfx.create() that never settles resolves start() with GLX, canary left armed | 53-68 | 57, 60, 61, 63, 64-65, 66, 67 | T02 | Behavior under fixture; section limits apply. |
| a backend script fetch that never settles also falls through to GLX (network verdict: canary disarmed) | 70-79 | 76, 77, 78 | T02 | Behavior under fixture; section limits apply. |
| an XR capability probe that never settles does not hold the boot | 81-89 | 87, 88 | T02 | Behavior under fixture; section limits apply. |
| steps that settle in time are untouched and leave no live timer | 91-103 | 94, 95, 96, 97, 101, 102 | T02 | Behavior under fixture; section limits apply. |
| missing GLX fallback script is bounded and failed fetch resolves unavailable | 106-116 | 113, 114 | T02 | Behavior under fixture; section limits apply. |
| `timed-out alternate relinquishes publication and prevents competing claim (alreadyClaimed=${claimed})` | 118-132 | 124, 128, 129, 129, 130, 131 | T02 | Behavior under fixture; section limits apply. |
| known asynchronous GPU failure gets one compatibility card with explicit guarded recovery | 134-207 | 173, 174, 175, 177, 178, 179, 180, 183, 184, 187, 189, 190, 193, 195, 197, 198, 198, 200, 201, 202, 204, 206 | T02 | Source/behavior mix; section limits apply. |
| a null adapter on a WGX pick falls back loudly | 213-219 | 216, 217, 218 | T02 | Source/behavior mix; section limits apply. |
| a SLOW adapter on a WGX pick still tries WGX, and a refusal names the slow probe | 221-235 | 230, 231, 234 | T02 | Source/behavior mix; section limits apply. |
| a create() that refuses without its own reason still records one | 237-241 | 240 | T02 | Source/behavior mix; section limits apply. |
| a hung create() and a hung fetch name their step | 243-250 | 246, 249 | T02 | Source/behavior mix; section limits apply. |
| an explicit WEBGL2 pick records no fallback, and a later bind clears an old one | 252-260 | 255, 259 | T02 | Behavior under fixture; section limits apply. |
| the boot probe's adapter rides to Gfx.create, so TLX need not ask the GPU process again | 262-275 | 267, 268, 273, 274 | T02 | Behavior under fixture; section limits apply. |
| the adapter request leaves at eval time for a THREE/WGX guess, and start() consumes it | 280-289 | 284, 286, 287 | T02 | Behavior under fixture; section limits apply. |
| a GLX guess asks the GPU process nothing at eval | 291-304 | 302 | T02 | Behavior under fixture; section limits apply. |
| an explicit THREE pick whose early adapter hangs or rejects hands null after the cap, and TLX asks itself | 306-319 | 311, 313, 314, 317, 318 | T02 | Behavior under fixture; section limits apply. |

### tests/unit/renderer-picker-unavailable.test.mjs

Target T03: RendererPicker.setUnavailableDefaults:265 / clearGfxBootRecovery:301 / showUnavailable:314 (js/perf/renderer-picker.js).

Fixture and semantics: Fake elements and descendant traversal (17-83), log/clipboard seeds, real gfx-escalation and picker source. Failure variants missing/reject/false; three window.name prefixes.

Limits: DOM state/callback semantics only; no real dialog focus, layout or lazy network load.

Shared/helper assertion spans: none outside test callbacks.

| Name / asserted meaning | Range | Assertion spans | Target | Evidence / limits |
|---|---|---|---|---|
| showUnavailable panel-only uses registered defaults for Data Hub | 85-107 | 97, 98, 99, 101, 104, 105, 106 | T03 | Behavior under fixture; section limits apply. |
| clearGfxBootRecovery clears window.name ctx-loss tally | 109-115 | 113 | T03 | Behavior under fixture; section limits apply. |
| showUnavailable Data Hub failure re-enables the button and shows status | 117-137 | 134, 135 | T03 | Behavior under fixture; section limits apply. |

### tests/unit/renderer-soft-lifecycle.test.mjs

Target T04: TLXShaders.postChain (js/render/three/tlx-post.js); TLX (js/render/three/tlx.js); WGX (js/render/webgpu/wgx.js); GLX soft/post; CanvasCssSize.create:7.

Fixture and semantics: Owned-resource ledgers (17-81,99-166); extracted TLX scheduler (244-264); extracted WGX hold/car gates (388-406); ResizeObserver/window/client-size cache (422-443); extracted readGlCapture/capturePixels with GL pack/fence ledger (560-607). Fault loop expands refuseBuffer/refuseAllocation/submitThrows/refuseFence/waitFailed/lost/copyThrows/timeout.

Limits: Many cases are source-shape guards, not execution. Ledger/extracted-body cases validate ownership/scheduling with mocked GPU/three APIs; neither backend boot nor rendered pixels/performance on hardware is established.

Shared/helper assertion spans: 580, 581, 588, 588, 592, 606.

| Name / asserted meaning | Range | Assertion spans | Target | Evidence / limits |
|---|---|---|---|---|
| TLX post chain disposes every owned base resource exactly once | 83-96 | 86, 87, 88, 92, 93, 94, 95 | T04 | Behavior under fixture; section limits apply. |
| TLX post sheds SSAO targets after closed presents and does not grow them across a second cycle | 98-187 | 172, 173, 175, 176, 179, 180, 181, 185 | T04 | Behavior under fixture; section limits apply. |
| TLX post construction failure unwinds targets, textures, and tracked materials | 189-200 | 191, 192, 193, 194, 195, 196, 197, 198, 199 | T04 | Behavior under fixture; section limits apply. |
| TLX soft blit pools the unstride buffer and writes ImageData in one pass | 202-220 | 206, 207, 208, 210-211, 212, 214, 215, 216-217, 218-219 | T04 | Source/behavior mix; section limits apply. |
| TLX soft present serializes reads, coalesces newest, and rejects stale sizes | 222-241 | 224, 230, 231, 232, 233-234, 235, 236, 239, 240 | T04 | Source/behavior mix; section limits apply. |
| TLX displayed source generation rejects old async completion and follows newest queued frame | 243-282 | 270, 271, 272, 274, 279, 281 | T04 | Behavior under fixture; section limits apply. |
| TLX voiding an in-flight soft read releases its gate | 284-293 | 290, 292 | T04 | Source/behavior mix; section limits apply. |
| TLX post fallback invalidates reads and disposes the retained chain | 295-307 | 299, 300, 301, 303-304, 305, 306 | T04 | Source/behavior mix; section limits apply. |
| TLX, WGX, and GLX remove timed-out software-present waiters | 309-321 | 314, 316, 317, 318, 319 | T04 | Source/behavior mix; section limits apply. |
| GLX/TLX re-queue waiters whose predicate has not fired | 323-338 | 326, 327, 330, 333, 334, 335, 337 | T04 | Source/behavior mix; section limits apply. |
| GLX soft-present reads back only for an explicit capture waiter | 340-352 | 343-344, 345-346, 347-348, 351 | T04 | Source/behavior mix; section limits apply. |
| GLX links SGSR only after spatial upscaling is requested | 354-366 | 356, 358-359, 361, 362, 365 | T04 | Source/behavior mix; section limits apply. |
| WGX soft present permits one staging read and drops pre-resize pixels | 368-383 | 370, 371, 372, 373, 374, 375, 377, 378, 379-380, 382 | T04 | Source/behavior mix; section limits apply. |
| WGX soft present back-pressures frames and the car pass while a read waits (#2226) | 385-419 | 389, 393-394, 407, 411, 412, 413, 415, 415, 417, 418 | T04 | Behavior under fixture; section limits apply. |
| all renderers share zero/reveal, orientation, and UI-scale CSS-size semantics | 421-486 | 444, 445, 446, 447, 450, 453, 459, 461, 469, 472, 475, 476, 483-484 | T04 | Source/behavior mix; section limits apply. |
| TLX picks its backend on what three will BIND, not on navigator.gpu existing | 488-531 | 513, 515-516, 517-519, 524, 525-526, 529-530 | T04 | Source/behavior mix; section limits apply. |
| GLX and TLX clamp the present size to the driver limit before deriving the render size | 540-558 | 542, 543, 545, 548, 549, 553, 554, 557 | T04 | Source/behavior mix; section limits apply. |
| TLX WebGL capture snapshots now, waits without blocking, restores GL state and returns independent top-down pixels | 610-632 | 613, 614, 615, 616, 617, 618, 620, 625, 625, 626-627, 628, 629, 629, 629, 631 | T04 | Behavior under fixture; section limits apply. |
| TLX WebGL capture accepts a slow valid GPU fence beyond twenty seconds | 634-643 | 637, 638, 641, 641, 641, 642, 642, 642 | T04 | Behavior under fixture; section limits apply. |
| `TLX WebGL capture releases owned resources on ${fault}` | 646-659 | 649, 652, 653, 654, 655, 656 | T04 | Behavior under fixture; section limits apply. |

### tests/unit/rendergeom-graph.test.mjs

Target T05: TrackGraph.create:52 (js/track/scenery/graph.js); SceneryStructures.create; TrackGeom primitives.

Fixture and semantics: Real geom/graph/structures VM (7-18); numeric record equivalence and outward-winding helpers (20-69), rotated RH/LH bases (70), container/hut × RH/LH; 16 signed-scale/handedness variants and sway-bearing foliage.

Limits: 2e-5 Float32 record matching tolerates upload precision. CPU geometry/winding/cache equivalence only, no GPU shader or visible culling check.

Shared/helper assertion spans: 39, 45, 61, 67.

| Name / asserted meaning | Range | Assertion spans | Target | Evidence / limits |
|---|---|---|---|---|
| `shipped ${style} marshal recipe keeps authored features and normals on ${lh ? "LH" : "RH"} frame` | 73-99 | 88, 88, 89, 95, 97, 98 | T05 | Behavior under fixture; section limits apply. |
| mixed handedness and negative-scale recipe variants match guarded replay deterministically | 102-135 | 122, 124, 124, 125, 133, 134 | T05 | Behavior under fixture; section limits apply. |
| variant partition preserves within-variant placement order and original model keys | 137-146 | 143, 144, 145 | T05 | Behavior under fixture; section limits apply. |
| LH geometry variants retain sway/material attributes and rounded normals | 148-161 | 158, 159, 160 | T05 | Behavior under fixture; section limits apply. |

### tests/unit/rendergeom-staging.test.mjs

Target T06: WGX._mkBuffer (js/render/webgpu/wgx.js); WGXChunked.init:10 (js/render/webgpu/wgx-chunked.js).

Fixture and semantics: Buffer ledger (11-17), extracted shipped _mkBuffer with injected typed-array/write failures (21-41); chunk harness (72-103), uint16/uint32, upload failures 1/2/3 and sharedAttr false/true.

Limits: Explicit handle ownership only. No browser/GPU residency claim; createMesh fallback is a stub returning null, so failed chunk upload returns empty shell.

Shared/helper assertion spans: 37, 100.

| Name / asserted meaning | Range | Assertion spans | Target | Evidence / limits |
|---|---|---|---|---|
| WGX helper frees its unpublished buffer when odd-index padding fails | 43-51 | 46, 47, 48, 49, 50 | T06 | Behavior under fixture; section limits apply. |
| `WGX helper cleans failed ${odd ? "padded" : "aligned"} uploads exactly once` | 54-59 | 56, 57, 58 | T06 | Behavior under fixture; section limits apply. |
| WGX helper uploads just a typed subview and zero-pads its odd tail | 62-70 | 66, 67, 68, 69 | T06 | Behavior under fixture; section limits apply. |
| `WGX ${big ? "uint32" : "uint16"} chunk staging fails before owning GPU buffers` | 106-112 | 109, 110, 111, 111 | T06 | Behavior under fixture; section limits apply. |
| `WGX chunk upload failure ${uploadFail} cleans every earlier owner` | 116-126 | 120, 120, 121, 122, 124, 125, 125 | T06 | Behavior under fixture; section limits apply. |
| `WGX healthy multi-chunk create/free keeps shared handles single-owned (${sharedAttr})` | 130-138 | 133, 134, 135, 137 | T06 | Behavior under fixture; section limits apply. |

### tests/unit/rendezvous-worker.test.mjs

Target T07: Room.fetch / Room.alarm and worker.fetch (worker/rendezvous.js); NetRendezvous.sealPrivate (js/net/rendezvous.js).

Fixture and semantics: Real Worker import, Map-backed Durable Object storage/alarm/call ledger (10-26), synthetic v2 envelope (28), Node Request/Response/streams, manual Date.now, real client webcrypto seal with bytes.js (254-262).

Limits: relay.test and documentation IPs/room IDs are descriptive inputs. No deployed Cloudflare isolation, WAF, distributed rate limit, network or cryptographic decryption verification; client-envelope acceptance checks structural compatibility.

Shared/helper assertion spans: none outside test callbacks.

| Name / asserted meaning | Range | Assertion spans | Target | Evidence / limits |
|---|---|---|---|---|
| Worker stores a valid bounded payload | 33-45 | 41, 42, 43, 44 | T07 | Behavior under fixture; section limits apply. |
| Worker stores only the v2 sealed envelope — plaintext and v1 are refused | 47-61 | 58, 60 | T07 | Behavior under fixture; section limits apply. |
| Worker uses the owner capability instead of randomized ciphertext equality | 63-77 | 72, 73-74, 75, 76 | T07 | Behavior under fixture; section limits apply. |
| Worker rejects an oversized Content-Length before reading the stream | 79-98 | 92, 96, 97 | T07 | Behavior under fixture; section limits apply. |
| Worker byte-caps a streamed body without Content-Length before JSON parsing | 100-111 | 109, 110 | T07 | Behavior under fixture; section limits apply. |
| Worker rejects irrelevant JSON padding around a short valid payload | 113-124 | 121, 122, 123 | T07 | Behavior under fixture; section limits apply. |
| Worker applies the payload limit in bytes, not UTF-16 characters | 126-138 | 136, 137 | T07 | Behavior under fixture; section limits apply. |
| Worker rejects non-client room-code lengths before allocating a Durable Object | 140-146 | 144, 145 | T07 | Behavior under fixture; section limits apply. |
| Worker rate-limits room creation before allocating more Durable Objects | 148-166 | 163, 164, 165 | T07 | Behavior under fixture; section limits apply. |
| Worker rate-bucket storage is hard-capped under fresh address churn | 168-192 | 178, 179, 188, 190-191 | T07 | Behavior under fixture; section limits apply. |
| Worker refuses legacy secret-bearing routes and advertises the private protocol | 195-214 | 200, 201, 205, 206, 207, 208, 210, 212, 213 | T07 | Source/behavior mix; section limits apply. |
| Worker keeps the earliest slot expiry and preserves a later live answer | 217-241 | 226, 229, 230, 232, 234, 235, 236, 239 | T07 | Behavior under fixture; section limits apply. |
| Worker rejects malformed v2 encoding and undersized crypto envelopes | 243-250 | 247, 249 | T07 | Behavior under fixture; section limits apply. |
| Worker accepts actual client envelopes including the minimum empty plaintext | 253-264 | 261, 262 | T07 | Behavior under fixture; section limits apply. |

### tests/unit/replay-buf.test.mjs

Target T08: ReplayBuf.create:70 / lerpCar:50 / audioRetired:14 / frameBytes:31 / capacityFor:38 (js/camera/replay-buf.js); game tickBody/render helpers; ExtraRigs.solve; GameAudio.feedReplayScrub.

Fixture and semantics: Small VM + mutable synthetic cars (22-44); actual ExtraRigs/mat4 straight-track stub (123-145); gameSource-extracted render helpers (278-282); real game-vm solo Monza + fake audio and trapped ReplayBuf.create (459-481); fake dock/tag controls and deferred PhotoStudio jobs (609-749), contact-sheet outcomes success/error/cancel and newer owners mode/debug identity/debug pose/photo pose/follow/scrub time/photo session; typed-array allocation tracker (783-787).

Limits: Budget title says 0.7 MB but asserted bound is MAX_BYTES=720*1024 plus separately reported fixed arrays. Restore case 71 checks selected captured fields; 269 and 751 additionally check whole live objects/property presence. Net gate disables sampling as well as entry. Contact-sheet pipeline is mocked, so no image artifact quality is shown; source pins do not prove scoring at runtime. Case 579 asserts listener external flag after chase resumes, not the rival pan claimed by its title.

Shared/helper assertion spans: 479, 528.

| Name / asserted meaning | Range | Assertion spans | Target | Evidence / limits |
|---|---|---|---|---|
| budget stays under 0.7 MB for 22 cars / 20 s | 46-51 | 48, 49, 50 | T08 | Behavior under fixture; section limits apply. |
| recorded heading and mesh yaw cross the ±π boundary without facing backwards | 53-69 | 63, 64, 65, 66 | T08 | Behavior under fixture; section limits apply. |
| sample wraps and at() interpolates; restore is bit-exact on captured fields | 71-109 | 82, 83, 91, 94, 95, 98, 99, 100, 101, 103, 104, 105, 106, 108 | T08 | Behavior under fixture; section limits apply. |
| beginScrub is a no-op when netPlay is active | 111-120 | 118, 119 | T08 | Behavior under fixture; section limits apply. |
| instant replay cuts the drone tether on entry, explicit seeks, LAST and exit, but eases playback | 122-163 | 147, 148, 149, 151, 154, 155, 158, 159, 160, 161, 162 | T08 | Behavior under fixture; section limits apply. |
| replay seeks preserve photo and debug-camera ownership | 165-177 | 172, 174, 175 | T08 | Behavior under fixture; section limits apply. |
| injected pose ownership denies sampling, pause-card offering and scrub entry even with a populated ring | 179-193 | 185, 188, 189, 190, 191, 191, 192 | T08 | Behavior under fixture; section limits apply. |
| a clock rewind discards the wrapped future ring and tags before rebuilding a fresh replay window | 195-211 | 201, 203, 204, 204, 204, 205, 205, 206, 207, 207, 209, 210 | T08 | Behavior under fixture; section limits apply. |
| a backwards timestamp within the same 30 Hz slot is recorded on its new timeline | 213-219 | 216, 217, 217, 218 | T08 | Behavior under fixture; section limits apply. |
| a paused checkpoint rewind cannot enter a stale ring before the next simulation sample | 221-232 | 226, 228, 229, 230, 230 | T08 | Behavior under fixture; section limits apply. |
| reopening Pause during scrub restores the live pose before checkpoint or other pause actions | 234-246 | 240, 240, 242, 242, 242, 243, 245 | T08 | Behavior under fixture; section limits apply. |
| a forward JUMP IN beyond the replay window cannot blend countdown poses into the mid-race timeline | 248-267 | 253, 256, 257, 259, 260, 260, 260, 261, 262, 263, 265 | T08 | Behavior under fixture; section limits apply. |
| scrubbed poses render wholly at recorded positions and yaw for every renderAlpha, then restore exact live history | 269-299 | 280, 283, 289, 289, 290, 291, 292, 292, 295, 296, 297, 298 | T08 | Behavior under fixture; section limits apply. |
| module never writes Ghost storage and stays under the RAM budget constant | 301-305 | 303, 304 | T08 | Source/behavior mix; section limits apply. |
| retirement edge auto-tags; jumpLastTag seeks; scrubbing blocks settle path in game.js | 307-338 | 317, 319, 320, 322, 323, 328, 329, 330, 334, 336 | T08 | Source/behavior mix; section limits apply. |
| a car crossing the start/finish line interpolates through the seam, not round the lap | 340-361 | 354, 356, 360 | T08 | Behavior under fixture; section limits apply. |
| a grid over 22 cars (MY TEAM / LEGENDS) records instead of resetting every sample | 363-374 | 365, 371, 372 | T08 | Behavior under fixture; section limits apply. |
| a red-flag re-grid (same clock, same cars) is a timeline break: two segments, never blended across | 376-411 | 392, 394, 396, 400, 401, 405, 406, 410 | T08 | Behavior under fixture; section limits apply. |
| a timeline discard does not re-tag cars that were already retired (BUGS M19) | 413-428 | 421, 424, 427 | T08 | Behavior under fixture; section limits apply. |
| one car's teleport (RECOVER / rescue) snaps without clearing; fast or stalled driving still blends | 430-457 | 447, 448, 449, 450, 451, 451, 456 | T08 | Behavior under fixture; section limits apply. |
| the replay ring is not a G expando: game.js never assigns G.replayBuf (1a-F3) | 483-487 | 486 | T08 | Behavior under fixture; section limits apply. |
| solo pause replay scrub feeds engine and rivals; rpm tracks speed; radio silent | 489-524 | 494, 495, 496, 500, 501, 504, 506, 507, 513, 514, 515, 518, 520, 522 | T08 | Behavior under fixture; section limits apply. |
| dbgCam during replay scrub pans rivals from the free camera, not chase | 532-562 | 536, 538, 557, 558, 559 | T08 | Behavior under fixture; section limits apply. |
| pause + free camera without scrub stays silent (#1262) | 564-577 | 568, 569, 571, 572, 574, 575 | T08 | Behavior under fixture; section limits apply. |
| clearing dbgCam and resuming chase restores player-track rival pan | 579-604 | 583, 589, 593, 595, 601 | T08 | Behavior under fixture; section limits apply. |
| the replay dock is styled from css (no inline cssText) and labelled for assistive tech | 606-629 | 621, 623, 624, 625, 626, 627, 628 | T08 | Source/behavior mix; section limits apply. |
| paused replay keeps unchanged contact-sheet options and refreshes changed tags without losing selection | 631-656 | 643, 644, 648, 649, 650, 652, 653, 653, 654 | T08 | Behavior under fixture; section limits apply. |
| css/dialogs.css gives #pm-replay-dock safe-area, wrapping and a viewport cap | 658-669 | 661, 663, 664, 665, 666, 667, 668 | T08 | Source/behavior mix; section limits apply. |
| "contact sheet restores scrub and camera on " + outcome | 671-689 | 676, 682, 684, 685, 685, 686, 686, 686, 687, 687, 687, 687, 688, 688 | T08 | Behavior under fixture; section limits apply. |
| "pending contact sheet respects newer " + change + " ownership" | 691-712 | 709, 709, 710, 711 | T08 | Behavior under fixture; section limits apply. |
| obsolete contact sheet cannot clear a reopened scrub's new capture busy state | 714-729 | 722, 724, 725, 726, 727, 728, 728 | T08 | Behavior under fixture; section limits apply. |
| contact sheet allows photo renderer to rebuild an unchanged debug pose | 731-738 | 737, 737, 737 | T08 | Behavior under fixture; section limits apply. |
| pending contact sheet respects same-open Studio session generation replacement | 740-749 | 747, 747, 748 | T08 | Behavior under fixture; section limits apply. |
| frame controls use adjacent recorded samples across gaps, discontinuities and a wrapped ring | 751-779 | 763, 766, 767, 768, 769, 771, 772, 774, 775, 776, 778 | T08 | Behavior under fixture; section limits apply. |
| ring byte accounting includes Float64 timestamps and separates fixed typed-array state | 782-799 | 788, 791, 792, 793, 794, 795, 797, 798 | T08 | Behavior under fixture; section limits apply. |

### tests/unit/repo-size.test.mjs

Target T09: summarize / render / main (tools/ci/repo-size.mjs); .github/workflows/repo-size.yml.

Fixture and semantics: Text object inventory including duplicate SHA, renamed fake song path and history-only blobs (22-41); test-created full/shallow git repositories under artifacts (48-75); git-fixture-env scrub.

Limits: Fixture paths/assets are descriptive. Synthetic full/shallow repo validates CLI refusal, not current repository size; workflow checks are textual.

Shared/helper assertion spans: none outside test callbacks.

| Name / asserted meaning | Range | Assertion spans | Target | Evidence / limits |
|---|---|---|---|---|
| summarize counts an object once and ranks blobs, directories and extensions by packed size | 21-45 | 31, 32, 33, 34, 35, 38-39, 40, 41, 43, 44 | T09 | Source/behavior mix; section limits apply. |
| against real git: a full clone is measured, a shallow clone is refused | 47-81 | 68, 70, 77, 78, 79, 80 | T09 | Source/behavior mix; section limits apply. |
| the workflow is read-only, dispatch-only and checks out full history | 83-91 | 86, 87, 88, 89, 90 | T09 | Source/behavior mix; section limits apply. |

### tests/unit/report-server.test.mjs

Target T10: startReportServer (tools/mcp/report-server.mjs).

Fixture and semantics: Temporary scratch/report-server-test-* tree (13-24), token/cookie HTTP loopback server, fetch and deliberately open Node request streams, bounded --help subprocess (129-138).

Limits: All fixture runtime/private/report paths belong to temporary tree and are descriptive. Tests exercise local HTTP behavior, not phone reachability/TLS/LAN configuration or arbitrary traversal attacks.

Shared/helper assertion spans: none outside test callbacks.

| Name / asserted meaning | Range | Assertion spans | Target | Evidence / limits |
|---|---|---|---|---|
| LAN report server requires its run token and serves only runtime files | 26-45 | 31, 34, 36, 38, 39, 40 | T10 | Source/behavior mix; section limits apply. |
| report POSTs require auth, valid JSON, quota, and never overwrite | 47-82 | 59-61, 62-64, 67, 68, 70-72, 73, 75-77 | T10 | Behavior under fixture; section limits apply. |
| concurrent report streams reserve quota before either one commits | 84-127 | 119-120, 122 | T10 | Behavior under fixture; section limits apply. |
| report-server --help exits 0 without binding a port | 129-138 | 134, 135, 136, 137 | T10 | Source/behavior mix; section limits apply. |

### tests/unit/res-scale-census.test.mjs

Target T11: parseArgs:22-37 (tools/gfx/res-scale-census.mjs).

Fixture and semantics: Direct parser calls with defaults, explicit spa/scales/settle/json/ls and unknown flag.

Limits: Parser only. Title says scale clamp but invalid scales are filtered; ls prefixing happens in browser init, not parser and is not asserted here. a.json is descriptive output argument.

Shared/helper assertion spans: none outside test callbacks.

| Name / asserted meaning | Range | Assertion spans | Target | Evidence / limits |
|---|---|---|---|---|
| res-scale-census parseArgs: defaults | 5-10 | 7, 8, 9 | T11 | Behavior under fixture; section limits apply. |
| res-scale-census parseArgs: overrides, scale clamp, ls prefixing | 12-19 | 14, 15, 16, 17, 18 | T11 | Behavior under fixture; section limits apply. |
| res-scale-census parseArgs: unknown flag throws | 21-23 | 22 | T11 | Behavior under fixture; section limits apply. |

### tests/unit/results-cam.test.mjs

Target T12: ResultsCam.enabled:16 / orbitPose:33 / highlightsReel:44 / create:77 (js/camera/results-cam.js); ReplayBuf; game tickBody; GameAudio.feedReplayScrub; RenderRate.

Fixture and semantics: VM camera/replay/M4 (18-33); recordedFinish with real ring and exact live snapshot (140-152); recording AudioContext + extracted real tickBody (274-365); liveCam callback spy (558-565); real RenderRate paused-settings rig (646-671). Cadence variants 30@60,45@60,half@120,auto@120,off@120,auto@60; previews lighting/camera/flyby/photo/garage/scrub.

Limits: Finite projection and field/audio node state are behavioral CPU evidence, not visual/audio quality. Some game integration tests are source pins. RenderRate rig supplies stubs outside tested branch.

Shared/helper assertion spans: none outside test callbacks.

| Name / asserted meaning | Range | Assertion spans | Target | Evidence / limits |
|---|---|---|---|---|
| orbitPose is finite and highlightsReel respects budget + order | 35-55 | 38, 39, 47, 50, 53, 54 | T12 | Behavior under fixture; section limits apply. |
| create: chequered → orbit; disabled on mobile / high PerfGov tier | 57-81 | 66, 67, 68, 69, 73, 74, 79, 80 | T12 | Behavior under fixture; section limits apply. |
| PerfGov tier >= 2 turns the results camera off; tier 1 keeps it | 83-99 | 92, 93, 94, 97, 98 | T12 | Behavior under fixture; section limits apply. |
| highlight windows fit end tags, short recordings and the actual budget | 101-113 | 104, 105, 107, 108, 109, 110, 111, 112 | T12 | Behavior under fixture; section limits apply. |
| untagged subsecond highlights stay inside the recording and finish promptly | 115-131 | 124, 126, 128, 130 | T12 | Behavior under fixture; section limits apply. |
| game.js gates results early-return on ResultsCam.live() | 133-138 | 135, 136, 137 | T12 | Source/behavior mix; section limits apply. |
| chequered and orbit cameras produce finite renderer projection matrices | 154-167 | 160, 162, 163, 165 | T12 | Behavior under fixture; section limits apply. |
| montage poses render consistently at every interpolation fraction and restore the finish | 169-187 | 171, 175, 179, 180, 181, 182, 184, 185, 186 | T12 | Behavior under fixture; section limits apply. |
| a retained highlights control cannot acquire an online session | 189-196 | 192, 193, 194, 195 | T12 | Behavior under fixture; section limits apply. |
| HIGHLIGHTS button stays hidden when ReplayBuf has no scrubbable footage | 198-223 | 218, 219, 220, 221, 222 | T12 | Source/behavior mix; section limits apply. |
| highlights frame the tagged car after posing, including a retirement, then return to the winner | 225-245 | 235, 236, 237, 238, 240, 242, 243, 244 | T12 | Behavior under fixture; section limits apply. |
| losing results eligibility during a montage restores the finish and releases replay | 248-259 | 252, 253, 255, 256, 257, 258 | T12 | Behavior under fixture; section limits apply. |
| game.js feeds feedReplayScrub from the results tick, off the race/count frames, unchanged #1262 call | 367-378 | 369, 371-372, 373-374, 375, 376-377 | T12 | Source/behavior mix; section limits apply. |
| results sheet without HIGHLIGHTS stays silent (chequered cut + orbit) | 380-389 | 382, 384, 385, 386, 387, 388 | T12 | Behavior under fixture; section limits apply. |
| HIGHLIGHTS: engine + field play over each clip, then silence exactly once on the return to the orbit | 391-421 | 394, 395, 397, 398, 399, 400, 401, 402, 410, 412, 413, 416, 417, 420 | T12 | Behavior under fixture; section limits apply. |
| leaving results mid-montage (NEXT / MENU / RACE AGAIN) silences on the next frame; a new race keeps its engine | 423-439 | 427, 434, 436 | T12 | Behavior under fixture; section limits apply. |
| SOUND off: the montage never starts the engine | 441-445 | 444 | T12 | Behavior under fixture; section limits apply. |
| results orbit uses the rendered subject and road elevation instead of a missing car.py | 447-464 | 458, 459, 460, 462, 463 | T12 | Behavior under fixture; section limits apply. |
| chequered and highlights frame the bank lift at each rendered subject pose | 467-495 | 485, 486, 487, 488, 489, 490-491, 492 | T12 | Behavior under fixture; section limits apply. |
| chequered framing tolerates absent track banking without a stale lift | 498-513 | 508, 509, 510 | T12 | Behavior under fixture; section limits apply. |
| results highlights expose the scene and restore the sheet on every exit | 516-542 | 528, 530, 531, 532, 537, 538, 539, 540 | T12 | Behavior under fixture; section limits apply. |
| dense same-subject highlights coalesce without losing event metadata or another subject | 544-555 | 547, 549, 550, 551, 553, 554 | T12 | Behavior under fixture; section limits apply. |
| orbit keeps turning: the eye circles the subject once per ORBIT_PERIOD_S | 567-576 | 575 | T12 | Behavior under fixture; section limits apply. |
| the chequered cut holds its finish-line shot for CHEQ_S before the orbit starts | 578-588 | 582, 583, 585, 587 | T12 | Behavior under fixture; section limits apply. |
| orbit redraws are capped at 30 per second even with a 120 Hz tick | 590-598 | 596, 597 | T12 | Behavior under fixture; section limits apply. |
| reset uninstalls the results camera and ends the session | 600-610 | 604, 606, 607, 608, 609 | T12 | Behavior under fixture; section limits apply. |
| a retired car is never the subject of the finish cut | 612-619 | 618 | T12 | Behavior under fixture; section limits apply. |
| highlight reel drops tags outside the recorded window | 621-625 | 624 | T12 | Behavior under fixture; section limits apply. |
| a second highlights() while one is playing is refused and does not rewind it | 627-642 | 635, 638, 639, 640, 641 | T12 | Behavior under fixture; section limits apply. |
| `ordinary paused Settings: ${mode} at ${hz} Hz keeps input/audio live and carries render time` | 675-682 | 678, 679, 680, 681 | T12 | Behavior under fixture; section limits apply. |
| `paused ${preview} preview keeps its existing full render cadence` | 686-692 | 689, 690, 691 | T12 | Behavior under fixture; section limits apply. |
| Settings skip then live photo flushes pending time and marks every preview present | 696-706 | 698, 700, 701, 703, 704, 705 | T12 | Behavior under fixture; section limits apply. |
| resuming after a forced preview judges the actual preceding draw | 708-720 | 710, 719 | T12 | Behavior under fixture; section limits apply. |

### tests/unit/retired-car-obstacle-vm.test.mjs

Target T13: retireCar / Collide collision list / Collide.parkedAhead / AI aim (game VM production modules).

Fixture and semantics: Shared real Singapore game-vm (24-25), parkAhead isolates rival and moves remainder half-lap away (29-41), feedback lane steering (42-46), AI ghost control vs live obstacle (79-97).

Limits: Specific Singapore locations, speeds and bounded 240/900-step drives; no fleet-wide collision coverage or visual result. Parked rival must remain statically fixed while player contacts/slows; AI control makes clearance non-vacuous.

Shared/helper assertion spans: none outside test callbacks.

| Name / asserted meaning | Range | Assertion spans | Target | Evidence / limits |
|---|---|---|---|---|
| singapore: a car retired with no runoff is parked on the road and flagged so | 48-53 | 50, 51, 52 | T13 | Behavior under fixture; section limits apply. |
| the player driven at a car parked on the road hits it instead of passing through | 55-73 | 68, 69, 70, 71, 72 | T13 | Behavior under fixture; section limits apply. |
| an AI whose line runs through a car parked on the road steers round it at speed | 99-108 | 101-102, 104, 105, 106, 107 | T13 | Behavior under fixture; section limits apply. |

### tests/unit/retro-shift-lights.test.mjs

Target T14: CarMesh.drawRetroTelemetry / getLedStrip (js/car/car-mesh.js).

Fixture and semantics: Real M4/PhysicsConsts/CarMesh VM and draw ledger (17-42), limiter RPM helper (44-47), time phases 0/0.05 and reduced-motion times 0/0.05/0.1/0.2.

Limits: Mesh identity selection, no visible lens brightness/browser motion media validation. Reduced motion comes from document dataset.

Shared/helper assertion spans: none outside test callbacks.

| Name / asserted meaning | Range | Assertion spans | Target | Evidence / limits |
|---|---|---|---|---|
| at the limiter, retro draws lit 9 then lit 8 — never lit 0 | 49-69 | 60, 61, 66, 67, 68 | T14 | Behavior under fixture; section limits apply. |
| reduced motion holds SHIFT (lit 9) steady at the limiter | 71-86 | 82, 83, 84 | T14 | Behavior under fixture; section limits apply. |

### tests/unit/ribbon-cpu-release.test.mjs

Target T15: Tracks.build ribbon upload/release (js/track/tracks.js via tools/track/verify-track.cjs buildContext).

Fixture and semantics: Real Monza/Monaco CPU builds and fake gfx upload/instancing handles (12-21); chunkRibbons true/false and retainGraph false.

Limits: No GPU upload confirmation. Debris case proves remaining pos/idx are convertible and triangle-shaped, not an actual debris physics trimesh creation.

Shared/helper assertion spans: none outside test callbacks.

| Name / asserted meaning | Range | Assertion spans | Target | Evidence / limits |
|---|---|---|---|---|
| player build with chunkRibbons drops ribbon CPU channels after upload | 23-32 | 26, 27, 28, 30, 31 | T15 | Behavior under fixture; section limits apply. |
| unchunked build keeps channels for a later quality-recovery chunk | 34-39 | 37, 38 | T15 | Behavior under fixture; section limits apply. |
| debris trimesh still builds from pos+idx after drop | 41-49 | 44, 47, 48 | T15 | Behavior under fixture; section limits apply. |

### tests/unit/rival-attach-init.test.mjs

Target T16: GameAudio.init:807 / stopEngine:1534 / setLayer / setTune (js/audio/engine.js); RivalAudio.attach:100 / silence:164 / create:209 (js/audio/rivals.js); audio/stub.js.

Fixture and semantics: fake-audio-vm plus connect destination ledger (31-41), real audio dependencies and lazy stub replacement (43-103), manual interrupted-context Date and async flush (132-155).

Limits: Graph attachment/gain scheduling and bounded voice count; no audible playback or browser autoplay proof. Recovery fake context is deliberately interrupted.

Shared/helper assertion spans: none outside test callbacks.

| Name / asserted meaning | Range | Assertion spans | Target | Evidence / limits |
|---|---|---|---|---|
| GameAudio.init calls RivalAudio.attach exactly once with the SFX bus | 107-118 | 109, 111, 113, 114, 116, 117 | T16 | Behavior under fixture; section limits apply. |
| the pass-by pool output connects to the GameAudio SFX bus | 120-130 | 123, 126, 128 | T16 | Behavior under fixture; section limits apply. |
| context recovery replaces the pool and does not duplicate voices | 132-155 | 139, 148, 149, 150, 152, 153 | T16 | Behavior under fixture; section limits apply. |
| the audio stub fallback does not throw when attach is missing | 157-162 | 159, 160, 161 | T16 | Behavior under fixture; section limits apply. |
| lazy first-bind: init before rivals.js still attaches once the module lands | 164-180 | 167, 168, 170, 171, 178 | T16 | Behavior under fixture; section limits apply. |
| stopEngine silences every pass-by voice (#2187) | 186-198 | 195, 197 | T16 | Behavior under fixture; section limits apply. |
| RivalAudio.silence(t) zeroes the pool; the title stub has it too (#2187) | 200-215 | 207, 208, 210, 214 | T16 | Behavior under fixture; section limits apply. |
| Rivals switch and zero level mute both engine and pass-by without another frame | 218-240 | 225, 226, 228, 230, 231, 233, 235, 237, 239 | T16 | Behavior under fixture; section limits apply. |
| Rivals mute survives lazy first binding | 242-250 | 249 | T16 | Behavior under fixture; section limits apply. |

### tests/unit/rival-audio.test.mjs

Target T17: RivalAudio.create:209 / sprayAhead:339 (js/audio/rivals.js); ReplayBuf.audioRetired:14; GameAudio.setRivals; GameCams listener methods (js/camera/vantage.js).

Fixture and semantics: 1000m synthetic lap/car fixture (21-42); real replay retirement VM (44-56), 2-engine-voice mobile stub (126-151); recording engine pan graph and five chase fixtures (332-390); real GameCams/M4 (440-447).

Limits: Track-sign/range/slot/data ownership CPU tests and mock AudioParam values, no audible Doppler or stereo correctness on device. Power-unit test title mentions re-sort but checks one initial sorted collection; rank-swap case separately pins slot retention.

Shared/helper assertion spans: none outside test callbacks.

| Name / asserted meaning | Range | Assertion spans | Target | Evidence / limits |
|---|---|---|---|---|
| replay rival retirement follows footage without changing lifecycle authority | 58-73 | 62, 63, 66, 67, 70, 71, 72 | T17 | Behavior under fixture; section limits apply. |
| replay audio cleanup handles clear, reset and changed field identities | 75-97 | 79, 88, 89, 90, 92, 93, 94, 95 | T17 | Behavior under fixture; section limits apply. |
| replay audio ownership cleanup does not erase a newer instance | 99-110 | 106, 108, 109 | T17 | Behavior under fixture; section limits apply. |
| a car alongside on your LEFT reads negative lateral, and on your right positive | 112-121 | 117, 119, 120 | T17 | Behavior under fixture; section limits apply. |
| mobile engine voice cap keeps car→slot stable across a rank swap (BUGS M32) | 123-152 | 142, 143, 144, 150, 151 | T17 | Behavior under fixture; section limits apply. |
| ahead is positive arc, behind is negative — across the start/finish wrap | 154-165 | 162, 163, 164 | T17 | Behavior under fixture; section limits apply. |
| approach is positive only when the gap is actually CLOSING | 167-181 | 171, 174, 177, 180 | T17 | Behavior under fixture; section limits apply. |
| only the nearest few survive, nearest first, and the far field is dropped | 183-194 | 189, 191, 192, 193 | T17 | Behavior under fixture; section limits apply. |
| the audible radius reaches out to 150 m, and stops there | 196-203 | 201, 202 | T17 | Behavior under fixture; section limits apply. |
| retired cars and the player are never in the field | 205-212 | 210, 211 | T17 | Behavior under fixture; section limits apply. |
| rev is normalised from their own rpm | 214-221 | 219, 220 | T17 | Behavior under fixture; section limits apply. |
| emitFieldSfx is exported and is a no-op without GameAudio.fieldContact | 223-228 | 226, 227 | T17 | Behavior under fixture; section limits apply. |
| the returned rows are reused, so a caller must read them before the next call | 230-240 | 239 | T17 | Behavior under fixture; section limits apply. |
| an empty or impossible field is quiet, not a crash | 242-250 | 244, 245, 247, 249 | T17 | Behavior under fixture; section limits apply. |
| each rival carries its own power unit's voice, and it follows the car through a re-sort | 252-260 | 258-259 | T17 | Behavior under fixture; section limits apply. |
| a voice stays with its car through a rank swap | 268-281 | 275, 278, 279, 280 | T17 | Behavior under fixture; section limits apply. |
| a voice is handed on only when its car leaves the voiced set | 283-299 | 291, 295, 296, 298 | T17 | Behavior under fixture; section limits apply. |
| net-owned rivals are flagged for heavier engine pitch smoothing | 301-316 | 313, 314, 315 | T17 | Behavior under fixture; section limits apply. |
| sprayAhead is rivals-ahead within 40 m only (Radio r9 wet wake) | 318-328 | 320, 321, 322, 323, 324, 325, 326-327 | T17 | Behavior under fixture; section limits apply. |
| external camera: rival on the visual left pans negative; 180° yaw flips the sign | 396-405 | 402, 403, 404 | T17 | Behavior under fixture; section limits apply. |
| external camera: rival ahead or behind the line of sight pans near centre | 407-413 | 411, 412 | T17 | Behavior under fixture; section limits apply. |
| chase and missing camera basis keep the pre-fix player-track pan law | 415-423 | 420, 421 | T17 | Behavior under fixture; section limits apply. |
| onboard → TV external flag clears cached pan targets so the next aim reschedules | 425-438 | 436, 437 | T17 | Behavior under fixture; section limits apply. |
| free listener basis is replaced when chase vantage publishes after dbgCam clears | 449-456 | 453, 455 | T17 | Behavior under fixture; section limits apply. |
| applyFreeCam copies dbgCam into the camera vectors and publishes an external free basis | 458-467 | 462, 463, 465, 466 | T17 | Behavior under fixture; section limits apply. |
| render republishes listener basis from dbgCam after camVantage (TV director / free cam) | 469-478 | 474, 475-477 | T17 | Source/behavior mix; section limits apply. |
| Doppler closing speed is the line-of-sight component: zero when level, full when in line | 480-493 | 485, 487, 489, 492 | T17 | Behavior under fixture; section limits apply. |

### tests/unit/rival-contact-sfx.test.mjs

Target T18: GameAudio.fieldContact / fieldContactState / collision / setLayer / setTune (js/audio/engine.js); RivalAudio.emitFieldSfx (js/audio/rivals.js); collideFx (gameSource union).

Fixture and semantics: Counting AudioContext and automation call recorder (26-74), real engine modules with held sample fetches and external listener (76-111); real rival emitFieldSfx, gameSource collideFx source slice.

Limits: Distance case asserts near/in-range acceptance and 200m rejection, not gain falloff despite its title. Player collision path is exercised by mute/envelope cases despite opening comment. collideFx forwarding remains textual; wall-clamp behavior belongs to wall-clamp.test.mjs.

Shared/helper assertion spans: none outside test callbacks.

| Name / asserted meaning | Range | Assertion spans | Target | Evidence / limits |
|---|---|---|---|---|
| fieldContact: a bump fires a voice and arms the pool (≤3) | 113-123 | 117, 119, 120, 121, 122 | T18 | Behavior under fixture; section limits apply. |
| fieldContact: per-car cooldown ≥250 ms holds a second bump | 125-133 | 127, 128, 129, 131, 132 | T18 | Behavior under fixture; section limits apply. |
| fieldContact: hard cap of pool size — excess denied | 135-146 | 143, 144, 145 | T18 | Behavior under fixture; section limits apply. |
| fieldContact: gain falls with distance (far quieter than near) | 148-166 | 157, 161, 162, 164 | T18 | Behavior under fixture; section limits apply. |
| fieldContact: silent in countdown (setGridIdle) and when SFX off | 168-180 | 171, 172, 175, 177, 179 | T18 | Behavior under fixture; section limits apply. |
| fieldContact: stopEngine (pause / results) disarms and tears the pool | 182-190 | 184, 187, 188, 189 | T18 | Behavior under fixture; section limits apply. |
| RivalAudio.emitFieldSfx: lock-up triggers squeal for a rival, not the player | 192-211 | 205, 210 | T18 | Behavior under fixture; section limits apply. |
| collideFx gate: rival–rival forwards fieldContact; player branch keeps collision() | 216-226 | 220, 222, 223, 224, 225 | T18 | Source/behavior mix; section limits apply. |
| Rivals mute gates field squeal/scrape/bump but preserves player contact | 229-243 | 232, 235, 237, 240, 242 | T18 | Behavior under fixture; section limits apply. |
| muting rivals cancels their active envelope and leaves active player contact intact | 246-263 | 250, 252, 256, 259, 260, 261 | T18 | Behavior under fixture; section limits apply. |

Declaration total: 197 test call sites (parameterized loops expand runtime cases).

## Production byte pins and navigable ranges

Complete-file hashes pin loaded production bytes. Ranges below are syntax-derived declaration bounds following the LSP module resolution, not claims that every production line was read. Empty range cells denote supporting assets/config/constants whose full bytes are pinned. Duplicate names may be nested helpers in the same file.

| Production file | SHA-256 | Relevant declaration ranges |
|---|---|---|
| `js/render/renderer-boot.js` | `558313586a3d86144929fa667f5cb608d8b5a43867852febcc332fa13d2757e6` | preloadThreeVendor:11-31; create:32-444; start:202-429; guess:462-476; preloadLikelyBackend:509-528 |
| `js/render/gfx.js` | `879c63bb0eb55022f20b43c55e218cba220c896af7dc1da995f5712cd7f9ea3d` | createInitOwner:239-257; create:267-312 |
| `js/render/shared/compatibility-recovery.js` | `7c83510df2889d0eea57edcf6e37d19cf4f3825eaf40b26e39c75ec7b01653b6` | create:19-120 |
| `js/perf/renderer-picker.js` | `8e3df787b58c97d5371e77361d52973f5cd55e65ca5fe835141be70794c0e111` | setUnavailableDefaults:265-267; clearGfxBootRecovery:301-313; showUnavailable:314-397; applyBackend:399-435; init:954-963 |
| `js/perf/gfx-escalation.js` | `357547c8c12ee5e7f174bc206d5d01251d6d3253cd6009457c6a393e02db73dc` | supporting source/config |
| `js/render/three/tlx-post.js` | `3d9a328acc1cd51be49e8d853cbfa3a0f2eba4311bad30d3475610b5d5b315b1` | postChain:57-1309; resize:605-643 |
| `js/render/three/tlx.js` | `58669a10791324112e956d2b63adefd0c2b793147945a148d2eda447340922a2` | readGlCapture:81-142; create:174-6794; applyResize:4391-4468; resize:4469-4485; _startSoftBlitRead:4596-4634; _queueSoftBlit:4653-4676; _cancelSoftBlits:4683-4687; init:4832-4832; awaitSoftPresent:5636-5658 |
| `js/render/three/tsl-post.js` | `a714785117cdd210bba3d2ed22ca4474a5a647204e004dddf220c9a3caf5d580` | supporting source/config |
| `js/render/shared/post-common.js` | `7dc6456d40aa6ef156a3491447fb05a935e9ee8c94708ea3eb0369489474d7a9` | supporting source/config |
| `js/render/glx/soft.js` | `448e29f42a06205cce956f0fb5d8a01618380bfa1c7e7c84d96c081bfd425976` | create:12-212; softBlit:67-133; awaitSoftPresent:165-195; blitIfDue:197-199 |
| `js/render/glx/glx.js` | `9453e308fc6f88160634c29d2d4bee36ec6ca7074fc8b8381ce26f457baf553f` | init:564-982; resize:1017-1076 |
| `js/render/glx/post.js` | `bee401242ac69ab9a0529848d324b43ba16cd6ea257f9dce73eaafef5b6c86d1` | init:15-1350; ensureSpatial:132-140 |
| `js/render/webgpu/wgx.js` | `7ce7dd4b81578e15a31cd102eb36229a8c2b7c8e59f65aed837cbfbe1888d855` | create:342-6059; _softFrameHeld:592-594; awaitSoftPresent:2080-2106; resize:2121-2186; _mkBuffer:2654-2675; init:5874-5874 |
| `js/render/webgpu/wgx-chunked.js` | `bd51ea5391167d4055fc5a8c6374a782aa4d53475a5071343008367b37806b2b` | init:10-504 |
| `js/render/shared/canvas-css-size.js` | `6e212edfc56e7e223babaabc2bf9856c5000643780da3ece5739445f689d779f` | create:7-65 |
| `js/track/core/geom.js` | `b26d3ac24079b41009a095c9ca6f38ac44720d284c376a588932ac160ce0187a` | supporting source/config |
| `js/track/scenery/graph.js` | `ced880aaf25fd30b966dd44b2675737c196f17f2209adb756144215f139cf2c1` | create:52-501 |
| `js/track/scenery/structures.js` | `28c1d77dcdef94fa5ae828dcf6ea7693cd9aca7878fc12c9320ac8e23942b8b5` | create:5-1126 |
| `worker/rendezvous.js` | `52ab53164ed8d5f98ff82f417b7c0b3d2aa4390e8fab9b05c7a71990496acec6` | fetch:218-246 |
| `js/net/bytes.js` | `bcbd948cab766323fb0277c834e0e942a10120eb6118c7870d808a844d4f13fc` | supporting source/config |
| `js/net/rendezvous.js` | `928f275c5b914e1f9414c270a5a9f505f78decc0be369505239741d59c9fe087` | sealPrivate:296-298 |
| `js/camera/replay-buf.js` | `531a8e9df6a0911a67bac103e5fc138b6e9cca0b17f4194947262b90d351a344` | audioRetired:14-18; frameBytes:31-33; capacityFor:38-43; lerpCar:50-67; create:70-552; breakTimeline:123-125; sample:144-169; at:198-235; beginScrub:266-281; stepFrame:311-324; endScrub:325-334; contactSheet:364-402 |
| `js/camera/results-cam.js` | `754dee8b4de1773843fa20f30e42e975a6c762e0ea86daf5f04d7de219425616` | enabled:16-21; orbitPose:33-41; highlightsReel:44-75; create:77-273; onFlag:161-169; startOrbit:170-177; startHighlights:178-194 |
| `js/camera/extra-rigs.js` | `81573fd42bb72613dcf325770e961597b04997b643f612ecf209847e45d45872` | supporting source/config |
| `js/camera/vantage.js` | `21282adf2988d472d5130f49fb1d45e0e7ba4a5afdabfb0902ae204ae7167b11` | init:6-9; publishListenerBasis:944-956; applyFreeCam:960-963; getListenerBasis:964-964 |
| `js/perf/render-rate.js` | `2d90c3668a64a9cbdb515ecbbe8b4be8fcb34445c229cbb89a8446ca45d4bd82` | init:51-58 |
| `js/audio/engine.js` | `4d3957e1c67cf8575b4cc452c2a06afe3336b5595633aa14ec1ae1a626a9aa71` | init:807-829; enabled:1002-1004; stopEngine:1534-1537; feedReplayScrub:2204-2227; setTune:2573-2583; setRivals:2645-2755; setLayer:2773-2782; collision:2812-2823; fieldContact:2894-2916 |
| `js/audio/rivals.js` | `60f7b6f9f8ccd38412bcdd6dea053d364fce39c452fa4fdbdcd4768c5c57e7b8` | attach:100-127; silence:164-174; create:209-334; collect:221-305; emitFieldSfx:310-331; sprayAhead:339-352 |
| `js/audio/stub.js` | `e8ec8b7096ece9d6a174aefe1545c1bb74f59e8effc7047e9a9475d23ba70133` | supporting source/config |
| `js/audio/tone-model.js` | `0ee5d44030cbd4f5df01a196c999945624ea5cd39fbda9dbc997d1f90d5634cc` | supporting source/config |
| `js/audio/signal.js` | `4abe27130018800ab1bf7f7f74d135877ebeb045bc0cfceea75e3768d2f7fe04` | create:78-235 |
| `js/audio/soundtrack.js` | `b7d67f2e6270a3d76b223245393d7fe6adc167a2d29f39494b18ce8a17b42012` | create:5-615 |
| `js/audio/radio-fx.js` | `dbd267abfb3c9e9afee92757122a2b6abcb1b9b99fcaaa7ad06841ae97426c35` | create:7-599 |
| `js/core/mat4.js` | `8b80f0f6223622840031c736453f9d84862f049e70ce49a1709090098f7d121d` | supporting source/config |
| `js/physics/consts.js` | `5b4ca20dff59b0139fa2e4bb531d092a54738274dcca666a40067cad42c005aa` | supporting source/config |
| `js/physics/collide.js` | `c62b984abfe3a51ff99921cb5b46991755f627b57b6fccef1e1033eb804c1708` | create:281-871; parkedAhead:875-883 |
| `js/car/car-mesh.js` | `c13a3031510b4f20ac8c658c300a2e8bcee98f0599c658c5fd59d80deae28003` | init:6-6; getLedStrip:1633-1645; drawRetroTelemetry:1793-1825 |
| `js/track/tracks.js` | `62abbda18aae41e6e016b4fdc1a6dbd346810f72c92058521405fd0b7149f9bb` | build:471-478 |
| `js/game.js` | `20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d` | renderPosOf:1081-1092; yawVisInterp:1126-1133; headInterp:1158-1165; retireCar:6570-6605; render:7239-8457; tickBody:8502-8615 |
| `css/dialogs.css` | `2a07f99fa83929e4ad969c5c635829f2317b54dbf49cece23bcdb83438e318c8` | supporting source/config |
| `tools/ci/repo-size.mjs` | `262f1a34bd033e133fa735fed23ed07c311e238906ab937cd92b545c4f4bb55c` | summarize:28-56; render:61-76; main:78-97 |
| `.github/workflows/repo-size.yml` | `c47f7c91f2f4a280624ba313adcde740ac4783d9f8d822e4958520917fe4b380` | supporting source/config |
| `tools/mcp/report-server.mjs` | `930697856dddebf6d6bed56eb24a87aa5764d934b3eea3dc690745b92d788e48` | startReportServer:246-264 |
| `tools/gfx/res-scale-census.mjs` | `82d4b55593b4934076b9547544bf5bacae257d5736e90bef766955a07e0830b3` | parseArgs:22-37; main:39-92 |

Additional LSP definitions: retireCar → js/game.js:6570; Collide.parkedAhead → js/physics/collide.js:875; CarMesh.drawRetroTelemetry → js/car/car-mesh.js:1793; getLedStrip → :1633; Tracks.build → js/track/tracks.js:471. GameAudio.fieldContact and setRivals returned engine/stub candidates (re-injected global ambiguity); fixtures explicitly load the real engine and sometimes intentionally the stub, so no unique runtime winner is inferred from LSP alone.
