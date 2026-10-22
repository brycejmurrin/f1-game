# Graphics, texture buffers and physics follow-up

## Identity and ownership

This investigation starts at deploy `174541508125e191d8c3034e1b57b68b02212e21`,
on `cursor/graphics-physics-hunt-7e31`. At 2026-10-21 18:54 UTC, Pages served
`e385daa06f28cbf737b32f236c482a76e88dbcd6`; GitHub's compare API placed deploy
five commits ahead. Later fleet messages report Pages reached the pinned deploy
and #3430 merged as `e696b626`. Those observations do not change the source of
these reproductions.

Six native lanes used isolated worktrees. The parent owned the only Chromium.
The initial open PRs and claims excluded #3407, #3423, #3424, #3430, #3421, #3387,
and active H26/H27/H28/H29 work. The H19 Assets claim was stale by 823 minutes
and had no open path overlap. Fleet B explicitly carved out shared Assets and
MirrorPass from H26's work. Parent/worker exact claims precede implementation.
No physics, TLX, WGX, shader or quality/default changes are included.
During verification, #3423 merged as `89413c86`. Its WebGPU diff only skips
unused SSR setup on the lite tier and exports WGX_LITE; it does not address
the sampler or instance-tail observations. Those remain owner handoffs, not
part of this patch. A neighboring mirror-LOD investigation explicitly withdrew
its MirrorPass overlap request and uses its existing car-draw seam instead.

## Ranked findings

| Rank | Trigger | Finding and evidence | Impact and action | Ownership | Validation |
| --- | --- | --- | --- | --- | --- |
| 1 | Synchronous bitmap-layer readback gets a WebGL error flag | Upload failure leaves the previous texture readable; read failure leaves destination bytes unchanged, but both indices were returned as successful | Consumers skip their existing fallback and use wrong pixels. Assets now returns only validated layer indices; raw-byte fast path unchanged | Parent Assets claim; H26 carve-out | Native WebGL negative-width error injection reproduced stale pixels without throwing; candidate excludes failed layer, preserves healthy bytes and siblings |
| 2 | Chunk-index typed-array allocation throws after GPU allocations | Actual GLXChunked constructor leaves two buffers and one VAO unreachable; same failure in first or third bucket | Transactional cleanup deletes unpublished resources and rethrows the identical error; successful packed output unchanged | Lifecycle lane claim; parent integration | Actual constructor/recording-GL tests fail before and pass after, including partial uploads and next-draw binding |
| 3 | Decompressing the shipped material PNG strips | All stream chunks were retained until a full output buffer was allocated and filled | Stream into a bounded scanline-prefix buffer, still draining and validating the whole stream. Less simultaneous application-buffer retention; copied bytes unchanged | Parent Assets claim; H26 carve-out | Four real PNGs, 9,175,040 decoded layer bytes identical to baseline and independent sharp; native Chromium chunk accounting below |
| 4 | Three full mirror passes, then standDown and a different eye | StandDown leaves the consecutive-pass counter odd, so first new full pass freezes the old resident instance pack | Reset cadence on interruption. Actual GLX pack changes from old z=80 to required z=1080 at eye z=1100 | Rendering lane claim; H26 carve-out | Two fail-before regressions; normal alternating reuse and repeated standDown preserved. Same-world restart's first visible frame was already refreshed: no visible restart improvement claim |
| 5 | WheelState enabled while travelling backwards | Lock/spin classification uses kappa sign without travel direction; mirrored axle cases swap labels. Actual wet-grass reverse case body -4 m/s, rim slows toward zero to -0.487 m/s, yet wheelSpin=1 | New confirmed telemetry classification bug, default feature OFF. H27 owns physics; owner handoff only | Held by H27 physics owner | Actual axleStep and PlayerForces source fixture; rendered FX/handling impact unmeasured |
| 6 | WGX decal minification | Shared sampler defaults to nearest mip and anisotropy 1, while GLX/TLX use trilinear filtering and higher anisotropy | Cross-backend quality hypothesis, not a demonstrated visual defect; Fleet B/#3387 handoff (#3423 was the initial hold) | Fleet B WGX handoff; #3387 still open | Actual descriptor/consumer and WebGPU default contracts checked; no rendered comparison |
| 7 | WGX instance tail becomes visible/hidden | Synthetic 5-to-4 instance change recopies 64 matrix values and uploads 320 bytes despite shared prefix; same cells do no upload | Operation-count opportunity handed to Fleet B; #3423 was the initial hold; actual camera-workload cost unknown | Fleet B WGX handoff; recheck claims before edits | Exact packed values and invalidation checks pass; no CPU/FPS or GC saving established |

## Texture memory evidence and limits

Chromium 154.0.8037.57 emitted 64 KiB maximum chunks for the actual four PNGs.
A follow-up observation checked each view offset, backing-buffer capacity and
ArrayBuffer identity: no chunks alias and their capacities equal payload lengths.
The diagnostic counted application-visible output backing stores:

| Strip | Inflated bytes | Chunks | Original peak bytes | Bounded destination plus largest chunk |
| --- | ---: | ---: | ---: | ---: |
| albedo 256 | 4,460,800 | 69 | 8,921,600 | 4,526,336 |
| normal 256 | 4,460,800 | 69 | 8,921,600 | 4,526,336 |
| albedo 128 | 1,116,288 | 18 | 2,232,576 | 1,181,824 |
| normal 128 | 1,116,288 | 18 | 2,232,576 | 1,181,824 |

This is a buffer-lifetime ledger, **not measured live heap or physical-phone
memory**. Native decompressor buffers, allocator behavior and GC are excluded.
Chunk partitioning is implementation-defined; a browser emitting one whole
output chunk may show no such peak reduction. Each shipped strip still copies
the same number of bytes. No zero-copy, GC, load-time or FPS improvement is
claimed. The full compressed stream is drained even when the required prefix
is filled, preserving late-checksum failures and browser-decoder fallback.
Short streams, all PNG filters, sparse layers, invalid filters/color tags,
corrupt/truncated inputs and cancellation were checked.

Native readback uses real OffscreenCanvas/WebGL2 and ImageBitmaps. A deliberate
negative width produces GL error flags without a JS exception. Healthy first
and second pixel samples are `[44,44,44,41]` and `[98,98,98,99]`; upload failure
previously copied the first into the second while returning `[1,2]`. A failed
read left sentinel `[173,173,173,173]`, also returning `[1,2]`. Candidate returns
`[1]` for either fault, so existing consumers can fall back. The source bitmap
creation uses 2D canvas and therefore these byte values include its alpha
rounding; comparisons use the healthy native reference. Added error queries
are confined to synchronous setup fallback, and are a correctness cost.

## Profiling and reproducibility

The source-controlled race profile records 844 by 390, DPR 2, touch 5, reduced motion false,
with an iPhone user agent. It remains desktop Chromium with ANGLE Vulkan
SwiftShader, not Safari or a physical GPU/phone. The initial selected Three
backend ran TLX/WebGL2; a later uncached boot used GLX/WebGL2. Actual backend is
recorded per run instead of inferred from selection.

The fixed-step scenario seeds 42 before awaited Monza/day/dry race construction,
20 laps, full 22-car field, helmet view, throttle and steering 0.02, reset at
55 m/s and fraction 0.02. Warm-up is 1,000 fixed steps; diagnosis samples 3,000
advancing steps at 1/60 s. Render diagnosis warms three frames and samples eight
advancing frames. This is one CPU diagnostic, not matched timing evidence.

An initial readiness probe selected an about:blank tab and timed out without
running a workload. Later browser source guards caught stale cached Assets
code before candidate assertions. Cached-source diagnostics are excluded from
final cost attribution. The retained source-controlled run bypasses service
workers and HTTP cache, compares seven compiled script bodies against checkout
bytes, and disables the debugger before sampling. Diagnostic `diag()` calls
are outside the retained recording: an earlier recording incorrectly included
its expensive GPU getParameter calls and was discarded as a render profile.
No timings from those operator attempts justify any improvement claim.
Host load was not recorded alongside the retained source-controlled capture;
the earlier cached capture's load observation is not substituted. This is
another reason the retained profile is diagnostic, not comparative timing.

Retained evidence paths: `artifacts/hunt-7e31/fresh-profile.json`,
`fresh-monza-fixed.cpuprofile`, `fresh-monza-render.cpuprofile`,
`compiled-source-proof.json` and `profiled-candidate.patch` in that directory.
The executable driver is `scratch/hunt-7e31-fresh-profile.mjs`; the curated
bundle copies it under `reproduction-scripts/`.
[The durable patch/evidence comment](https://github.com/brycejmurrin/f1-game/pull/3440#issuecomment-6324623628)
and [final native source/backing proof](https://github.com/brycejmurrin/f1-game/pull/3440#issuecomment-6324840405)
preserve the core results; the final PR handoff identifies the full archive.

In the retained render capture, 36.79% of samples are in native getError
through GLX.present -> drainGlErrors and 62.68% idle. These are sample counts,
not call counts. Three rendered warm-up frames do not establish completion
of the 30-present startup drain. SwiftShader synchronization and queued GPU
work cannot be attributed to JavaScript arithmetic or physical-GPU cost. The
safety drain is preserved; this recording is not a steady-state FPS baseline.

## Review, verification and negative findings

Independent reviews: rendering reviewed GLX construction cleanup; materials
reviewed the combined Assets patch; pose/copy reviewed mirror cadence. No
remaining actionable defects were reported. Lane focused runs passed with no
skips: Assets 84, GLX related 57, mirrors 41. These are separate lane results,
not a substitute for the integrated checks or full CI.

Integrated seven-file regression batch: 159 passed, zero failed/skipped.
The final inflate correction also allocates the destination before starting
its writer; an injected recoverable RangeError reaches bitmap fallback with
zero stream constructions or writes. The recorded profile predates this
allocation-order guard; `profiled-candidate.patch` pins its exact source.
No timing comparison depends on that diagnostic.

Targeted browser verification uses the existing desktop Chrome fixture
(1280 by 720, DPR 1, no touch, reduced motion), not the mobile race profile.
These are correctness checks, with repository inputs unchanged, not seeded
performance comparisons. Native API fixtures do not assert viewport and do
not exercise a rendered race. Assets-api passed 10/10 on its first run.
The mirror suite passed GLX rendering/compositing and actual TLX countdown
preparation, then failed its third test on the 300-second whole-test budget
while entering PiP. Its mirror assertions had completed, but requested TLX
had fallen back to GLX after the 15-second initialization deadline. This is
a failed test, not a TLX composite pass; attribution remains unresolved
without a quiet clean-baseline reproduction. No thresholds were changed.

Follow-up reproduction on unchanged baseline `174541508125` also failed, at
a different step: the 45-second expanded-mirror wait after tapping the chip.
That run did not record the bound backend and never reached PiP. It neither
establishes a common cause nor exonerates the candidate. The click callback
clears the collapsed flag synchronously; frozen races keep rendering. The
retained evidence does not distinguish a stale hit-test coordinate from a
starved render, so no product input or mirror-visibility change is justified.

The completed source-head CI run
[39674934878](https://github.com/brycejmurrin/f1-game/actions/runs/39674934878)
ran the full `gfx` group on four llvmpipe shards, not just boot smoke. All
58 gfx tests passed without retry or skip. Its first shard passed GLX mirror
in 41.7 s, TLX preparation in 16.1 s and TLX composite/PiP in 22.7 s; the
macOS Metal renderer job also passed. These are correctness results on those
hosts, not physical-phone performance measurements. The local failures remain
part of the record.

The local candidate's explicit TLX-to-GLX fallback exposed a test defect:
the composite case checked the requested preference but never asserted the
bound renderer. The follow-up guard reads RendererBoot's `apex26.gfxBound`
fallback override, otherwise the bound `GLX.backend` descriptor, and includes
`apex26.gfxFallbackWhy` in the failure. Successful TLX binding clears the
override; native GLX sets it and has no backend descriptor. An independent
PiP case preserves the prior frozen-world precondition and every transition
assertion, with the same per-case 300-second limit. This separates two
contracts whose combined local runtime exhausted that limit; it does not
relax pixel thresholds, skip unsupported paths or change product quality.

Remaining gates and final check results are maintained in the draft PR.
No merge/deployment is part of this research pass. Native fatal process OOM,
conforming-driver allocation-failure behavior and physical hardware are outside
the injected recoverable RangeError tests.

Negative findings: previous-pose scalar snapshots and pooled deferred matrices
preserve required ownership; removing those copies would change interpolation
or submission. Existing InstCells cache invalidation and conservative frustum
bounds did not show a new supported bug. Assets.adopt's known synchronous
consumer does not justify an async rewrite. The previously reported WheelState
normalization issue is not counted again. Merged #3428/#3432 and prior #3407
changes were reviewed and excluded rather than reimplemented.

## Primary references

- [Compression Streams infrastructure and chunk emission](https://compression.spec.whatwg.org/#infrastructure).
- [PNG filtering](https://www.w3.org/TR/png-3/#9Filters).
- [WebGL error flags](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/getError).
- [Eager WebGL object deletion](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#delete_objects_eagerly).
- [WebGPU sampler defaults](https://www.w3.org/TR/webgpu/#dictdef-gpusamplerdescriptor).
- [WebGPU writeBuffer offsets](https://www.w3.org/TR/webgpu/#dom-gpuqueue-writebuffer).
- [CDP script source](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/#method-getScriptSource).
- Actual vendored Three version: 0.186.1. Native stream and GL proofs, packed
  output fixtures and exact runtime source hashes remain in the evidence bundle.
