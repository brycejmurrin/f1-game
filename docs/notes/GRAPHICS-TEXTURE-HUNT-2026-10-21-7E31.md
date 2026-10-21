# Graphics, texture buffers and physics follow-up

## Identity and ownership

This investigation starts at deploy `174541508125e191d8c3034e1b57b68b02212e21`,
on `cursor/graphics-physics-hunt-7e31`. At 2026-10-21 18:54 UTC, Pages served
`e385daa06f28cbf737b32f236c482a76e88dbcd6`; GitHub's compare API placed deploy
five commits ahead. Later fleet messages report Pages reached the pinned deploy
and #3430 merged as `e696b626`. Those observations do not change the source of
these reproductions.

Six native lanes used isolated worktrees. The parent owned the only Chromium.
Current open PRs and claims excluded #3407, #3423, #3424, #3430, #3421, #3387,
and active H26/H27/H28/H29 work. The H19 Assets claim was stale by 823 minutes
and had no open path overlap. Fleet B explicitly carved out shared Assets and
MirrorPass from H26's work. Parent/worker exact claims precede implementation.
No physics, TLX, WGX, shader or quality/default changes are included.

## Ranked findings

| Rank | Trigger | Finding and evidence | Impact and action | Validation |
| --- | --- | --- | --- | --- |
| 1 | Synchronous bitmap-layer readback gets a WebGL error flag | Upload failure leaves the previous texture readable; read failure leaves destination bytes unchanged, but both indices were returned as successful | Consumers skip their existing fallback and use wrong pixels. Assets now returns only validated layer indices; raw-byte fast path unchanged | Native WebGL negative-width error injection reproduced stale pixels without throwing; candidate excludes failed layer, preserves healthy bytes and siblings |
| 2 | Chunk-index typed-array allocation throws after GPU allocations | Actual GLXChunked constructor leaves two buffers and one VAO unreachable; same failure in first or third bucket | Transactional cleanup deletes unpublished resources and rethrows the identical error; successful packed output unchanged | Actual constructor/recording-GL tests fail before and pass after, including partial uploads and next-draw binding |
| 3 | Decompressing the shipped material PNG strips | All stream chunks were retained until a full output buffer was allocated and filled | Stream into a bounded scanline-prefix buffer, still draining and validating the whole stream. Less simultaneous application-buffer retention; copied bytes unchanged | Four real PNGs, 9,175,040 decoded layer bytes identical to baseline and independent sharp; native Chromium chunk accounting below |
| 4 | Three full mirror passes, then standDown and a different eye | StandDown leaves the consecutive-pass counter odd, so first new full pass freezes the old resident instance pack | Reset cadence on interruption. Actual GLX pack changes from old z=80 to required z=1080 at eye z=1100 | Two fail-before regressions; normal alternating reuse and repeated standDown preserved. Same-world restart's first visible frame was already refreshed: no visible restart improvement claim |
| 5 | WheelState enabled while travelling backwards | Lock/spin classification uses kappa sign without travel direction; mirrored axle cases swap labels. Actual wet-grass reverse case body -4 m/s, rim slows toward zero to -0.487 m/s, yet wheelSpin=1 | New confirmed telemetry classification bug, default feature OFF. H27 owns physics; owner handoff only | Actual axleStep and PlayerForces source fixture; rendered FX/handling impact unmeasured |
| 6 | WGX decal minification | Shared sampler defaults to nearest mip and anisotropy 1, while GLX/TLX use trilinear filtering and higher anisotropy | Held cross-backend quality hypothesis, not a demonstrated visual defect; handoff to #3423/#3387 | Actual descriptor/consumer and WebGPU default contracts checked; no rendered comparison |
| 7 | WGX instance tail becomes visible/hidden | Synthetic 5-to-4 instance change recopies 64 matrix values and uploads 320 bytes despite shared prefix; same cells do no upload | Held operation-count opportunity for #3423; actual camera-workload cost unknown | Exact packed values and invalidation checks pass; no CPU/FPS or GC saving established |

## Texture memory evidence and limits

Chromium 154.0.8037.57 emitted 64 KiB maximum chunks for the actual four PNGs.
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

The mobile-shaped browser is 844 by 390, DPR 2, touch 5, reduced motion false,
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
