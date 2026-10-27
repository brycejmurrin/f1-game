# Unit group 21b — raw-source continuation

This supplements [the AST and semantic map](tests-unit-21-complete.md), reusing its declaration inventory, assertion spans, helper map and production P identifiers. Source: `tests/unit/gfx-backend-canary.test.mjs`, 7648 lines, 492646 bytes; whole-file SHA-256 `33a435d522a6bb6672574f77e199265d4a658d6c6119d371bbf88692e60ef080`.

Assigned raw review is complete: **2301–2842, 2879–3149, 3164–4103, 4141–4640** (2253 lines). Each ledger row was returned verbatim by one successful, untruncated source-read call. Each call returned at most 100 source lines and 8849 Unicode characters, below the 150-line/10000-character bounds. Hashes cover exact UTF-8 range bytes including terminating newlines. Gaps between assigned intervals are intentional and belong to other review evidence; this document makes no whole-file raw-review claim. The oversized combined AGENTS/map output is not credited as source evidence.

## Semantic additions from raw review

| Source range | Additional meaning and evidence limits |
|---|---|
| 2301–2430 | Picker availability is roster-derived: unavailable alternatives remain visible, do not persist a new selection, preserve existing stale preferences, and expose a WEBGL2 fallback marker. `liveBackend()` prioritizes a successful bind/TLX seam over the saved pick. Invalid preferences normalize and persist WEBGL2 while an unset preference remains THREE. Diagnostics/debug wiring is pinned by source identifiers, while picker behavior uses the minimal DOM VM fixture. |
| 2432–2573 | Terminal recovery separates CSS tap/phone-column rules from extracted early game recovery behavior. The local `element()` fixture implements event registration, async click, dialog open/close, focus, children and attributes. Actual escalation/picker modules run with synthetic storage, clipboard and lazy Data Hub. The test checks ordered recovery actions, hidden/inert game UI, primary focus, limited diagnostics, early HELP/DATA HUB close/Escape behavior, and WEBGL2 latch clearing/reloads. Native dialog focus trapping, layout and clipboard permissions are outside the fixture. |
| 2575–2733 | Picker rows/select arrows and advanced disclosure placement are DOM structure checks. Timers are collected then explicitly fired to establish deferred reload behavior. THREE PATH and SCREENSHOTS update preferences even on GLX but reload only for relevant live backends; status distinguishes native swapchain, copied canvas, forced paths and actual AUTO binds. Storage and backend seams are injected. |
| 2735–2842 | Shadow Z01 and main raster remapping remain backend-specific; post receives the GL inverse projection because TSL remaps depth itself. The shadow test computes matrix arithmetic on two points in addition to shape pins. Capture API, resize coalescing, garage off-axis view and post-init canvas-claim rules are source contracts, not shader/present execution. |
| 2879–3090 | GLX env/shadow latches must clear before early exits; tab resume preserves the governor budget. Vendor pins cover swizzle omission, scratch-array cache hashing, shared TextureNode uniforms and conditional matrix rebuild, function-scope WGSL node variables and layouted noise helpers, bind-group cleanup, polygon-offset pipeline keys, and storeOp-only discard hints. These recognize emitted source shapes and cannot establish allocation savings or WebKit limits on hardware. |
| 3091–3147 | The RGB-output test imports real vendor builders and a real RenderTarget, calls methods through prototypes with an injected renderer, and checks WGSL-only vec3 widening; it never creates a GPU pipeline. Manifest coverage hashes listed files, checks the terser pin and required files/license/import, and source-pins shared groups, MRT resolve, upload caching and GL resource destruction. Hash agreement establishes provenance consistency rather than successful rendering. |
| 3164–3290 | GLX context attributes and soft-present behavior run against the recording GL mock. Local `lit`, `frame`, and `armed` helpers inject pixel content and overlay/context state. Tests cover automation arming/native opt-out, initially hidden opaque overlay, dim-frame waiter retention, drawing-buffer sizing, generation freshness, request-only readback, one-shot invalidation, and timed-out waiter removal. Pixels are filled by the mock; no compositor or real readback timing is measured. |
| 3292–3467 | Source pins preserve screenshot overlay routing, pack layer gating, pooled matrixWorld stamps, real alpha versus SSR tags, garage floor reflection depth/bias, opaque renderer parameters, zenith fallback, observable software sky fallback, late-sky depth state and sky pinning before HDR render. Canvas opacity and visual appearance remain unverified by these source tests. |
| 3469–3769 | The large TLX software-WebGPU declaration distinguishes adapter classification/content skips from headless presentation needs. It requires per-part hardware overrides and explicit default-off batch/chunk-release opt-ins. One lifted cache-key function is actually executed with changed attachment state: store/delete keys stay stable per render object and differ across instanced identities. Env readiness checks face success/errors, bounded give-up and safe restore destinations. Current chunk release pins require null mirrors, superseding historical zero-length-array commentary; the withdrawn allocation explanation is not evidence. Most other checks in this declaration are text/ordering gates. |
| 3771–3946 | Instance tint must preserve canonical vertex colors and avoid three's instanceColor path. GLX cull behavior checks uploaded resident packs, all four plane components, count freshness, cell-key hit semantics and shadow invalidation. TLX/WGX parity remains source-pinned; WGX has separate shadow buffers and submits the previous shadow encoder before repacking for the next light. Recorded uploads establish mock call/state behavior, not GPU queue execution. |
| 3948–4103 | Cadence KEEP differs from stopping a pass: unprimed depth maps cannot arm; lamp content keys include lamp identity and quantized caster content with a shared bound. Accessor windows are sibling-bounded to avoid matching another accessor's armed flag. Boot canary disarms on hide/clean exit, requires a run of frames and an actual bind, and must not arm on a skipClaim escalation path. WGX env reset must not clear a static shadow latch whose caller cannot rebuild it. These are source-shape contracts. |
| 4141–4350 | Synthetic RendererBoot VMs test null-adapter unset fallback without fetching TLX or persisting WEBGL2, XR overriding the live backend while preserving the 2D pick, per-backend crash strikes and same-backend retirement, legacy strike migration, and proof clearing only for an actually bound alternative. Hand re-picks clear the ledger. Source pins additionally cover preload hunch rejection, software-GL readback/teardown cover, progress-based boot timeout and recovery scrubbing. |
| 4352–4528 | Source checks prohibit cadence/tier omission inside snap-cached prop rebuilds and require TLX's culled shadow transform/count forwarding. Env anisotropy is GLX mock behavior with/without extension plus TLX/WGX shader/sampler pins. Paint object-space noise, uniform-control-flow derivative hoists, implicit-LOD pack taps and pre-bump SAA normal snapshots remain source parity assertions; no shader compiler validates them here. |
| 4530–4640 | `softwareGlowScale` runs the actual PostCommon module with injected governor state, proving the shed knee follows lookPostShed even when autoTier is zero. GLX MSAA uses mock format caps with JSON/raw/legacy preferences and precedence; WGX decoding is text-pinned. The final assigned portion begins the shadow-pool/lifecycle declaration: actual lifted disposeInstancedObject dispatches for plain Mesh and calls dispose for InstancedMesh; further assertions pin parked geometry, per-target pools, batch disposal and warm-aware deferred retirement. This declaration continues beyond line 4640, so this supplement claims only its assigned prefix. |

## Exact read ledger

| Inclusive range | Characters | SHA-256 |
|---|---:|---|
| 2301–2400 | 5774 | `3018f874eeefda448afce73ef5ce9541c570a8fa7e2fc95895a709f50330a9e1` |
| 2401–2500 | 4846 | `a5ea65a62dd27a2c7ce1efbc17e5c45a8fc66c0e79b6d85941f877bde55ae261` |
| 2501–2600 | 5112 | `f25728c88a8471ebcd6505fd7ed51626eefda07da762de2b3400eff2c49114d0` |
| 2601–2700 | 4407 | `b28b75a401dc2c22b20670184efc7cbda5b69c7a48d640b7ee9d542c8ed89208` |
| 2701–2800 | 6116 | `6fbfad34efbc186383be36d1c8336f31a23c58c85e7cfb066af30878aeb7652a` |
| 2801–2842 | 2237 | `b9a7797192bd2078f13fdfccf36bbc2edac17ad3887baf4e6b98749a614ef657` |
| 2879–2978 | 7386 | `44cb713b354012befc40f4ee2f1e016d0f26d6ba7fc7744396c5a59d829a704b` |
| 2979–3078 | 8236 | `90d7c729ee316a0dc36c86d9ed7f8307ce1003cd2ebaa18be18d2b7f29fb7ea1` |
| 3079–3149 | 7273 | `271da9e1d2274861c50e84c53a48a35d8ce08cc840df38c612379d4fb293a05d` |
| 3164–3263 | 5670 | `af2fc60f75bd2cd17a9da3d02fd251a643c1c328ba46cb50c3d1f70b335755f2` |
| 3264–3363 | 5725 | `22abe8a8a6ebd64e2070aa244d089e7f3430ed8acea72b5950416f2ff65b7963` |
| 3364–3463 | 5781 | `90dffe8549e8f6f098a9f93cfafbc544a43a67c7ad3f1f500eb75e70f494707c` |
| 3464–3563 | 8027 | `fd16079b94954824b40100f57e79d56be65cf09bb07df709561283c0a4bc204f` |
| 3564–3663 | 7380 | `f1d83005b34a135cf3e85363b8523efd660b47b4ccf0477270c5272adf2f0db8` |
| 3664–3763 | 7346 | `bf06290fc371780cb5965c438f163a206ae7614fca70989885f5384d916bfa00` |
| 3764–3863 | 6036 | `99d1e53bcb508a3f8f7b17de8fbeb8aa9d41ab8ea6a200698f66b47a99f7b895` |
| 3864–3963 | 7070 | `73f1779e546c594b1bfafc4e4c681ad66ac336f342ebdf03c134095a7a2fce3a` |
| 3964–4063 | 6542 | `3bd1e97f36674b3dbbd95e88e92c70814f5135a228bc1957a182bd0abf882e2d` |
| 4064–4103 | 2625 | `5376220487a2aff8b0491942a7b84f61baf210a00cd77a087a1cfc31ec098a0d` |
| 4141–4240 | 6174 | `d8f48e285a53fc065f77d93443c7f52a49bef7537d9b6832ebf7aba547af349d` |
| 4241–4340 | 5582 | `3eec3a8a854ddd582cc5c337eb30d5d7557803a573d409f32d34f739e6834ce3` |
| 4341–4440 | 6740 | `aa0acce210125ef8cd4d5f35a4b8b121691cf350f035d91514c6807ef6c05eef` |
| 4441–4540 | 6378 | `a48d91e3548aaf9d1503773ca05ae082ae576a695b9e91f9e64f14a2a32d7df0` |
| 4541–4640 | 8849 | `924c00caea4c83eb9b19aeb1e116198f4bcd175b9edd2bcb7e5997cab9f7b253` |

No tests or browser sessions were run. No production or test source was edited. This is static review evidence; it does not promote source pins or synthetic fixtures into live renderer or hardware verification.
