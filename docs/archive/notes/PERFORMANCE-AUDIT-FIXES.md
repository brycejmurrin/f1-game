# Performance audit: confirmed mechanisms and scoped repairs

2026-10-19. Findings were established against game source
`138fc6099926c3c9c2fb1edd44af8cb7854b4124`, with later diagnostic-only working-tree
experiments identified separately. The repairs below have isolated implementation
and focused controls. This note records local integration and software experiments; combined-gate and
hardware verdicts remain separate from deployment, physical-phone improvement
or leak freedom.

## Resource ownership and quality control

| Confirmed mechanism | Scoped repair and retained boundary |
|---|---|
| Three's long-lived shared bind-group cache retains old groups and texture-node identities through repeated track changes. | Adapt upstream Three PR34707 through the vendor patch generator, evicting only after the last group owner releases. Preserve local binding keys, clone ownership and upload mirrors. Issue [2969](https://github.com/brycejmurrin/f1-game/issues/2969) contains reproduction and acceptance. Retained bytes and player-session slope remain unquantified. |
| TLX memState reports zero programs although installed Three Info reports programs and byte/count fields. | Expose installed telemetry with its renderer scope; an unrelated Three upgrade is unnecessary. Resource estimates are not GPU residency. |
| WGX capture staging lacks explicit destruction if encoder finish or queue submit throws after capture encoding. | Carry ownership through exceptional cleanup, with exactly-once destruction and request settlement. Existing outer catch already rejects the request; neither permanent GPU leakage nor real-device occurrence was proved. |
| A graphics-preset change preserves pending scale attribution from the preceding frame-cost regime. | Invalidate pending attribution on actual preset change while retaining current provisional resolution, cooldown, manual settings and same-preset no-op behavior. Preserve external-cap/Low Power Mode policy. |
| Ready model responses synchronously parse before the later consumer-loop yields. | Share a parse-admission lane across direct and bulk model callers, retain concurrent fetch/body reads and deduplication, yield a browser task before synchronous parsing, and check generation around admission/decode. Browser long-task benefit requires measurement. |
| Failed primary persistence can leave its sole queued mirror copy awaiting debounce when the document becomes hidden. | Request the existing serialized flush on document-hidden as well as pagehide. Queue removal is not transaction commit; lifecycle flushing remains best effort. |
| Shared release staging omits locale assets requested by runtime/SW. | Stage the locale manifest and declared catalogs through the shared staging contract, preserving English fallback. Verify deployed HTTP/JSON separately. |
| A worker request superseded while awaiting model readiness still builds and transfers before the page rejects adoption. | Carry caller-scoped liveness through worker admission, preserve legitimate same-key sharers and settle abandoned callers. Avoid global newest-wins cancellation and shared-worker termination. Existing page guards already prevent stale adoption. |
| Hidden HUD still mutates its subtree and reads geometry. | Preserve input/best-lap sampling, physics and spoken notifications while suppressing hidden visual work; refresh on reveal/invalidation. The stale pause-review chart found in review is corrected, including reset on reveal. |
| Replay ring byte arithmetic omits its Float64 timestamp lane. | Include per-frame timestamps and distinguish reserved storage/fixed overhead from populated payload. The original maximum supported grid remained below its cap; an actual cap breach was not demonstrated. |

## Measurement corrections

The session status parser also mistook the nested tooling-stage success for a
completed deploy gate while later geometry checks were still running. Deploy logs
now require their own terminal metadata or complete final gate result. Nested
success remains provisional; outer failures remain failures. Fifteen focused
parser controls include the actual still-running log reproduction.

The heap CLI's original successful verdict could survive missing data, page errors
or an unasserted actual backend. The diagnostic batch separates completeness,
correctness and budget, retains raw bytes/visit series and records actual API,
observer coverage and collection policy. Identity deduplication and dead-WeakRef
metadata pruning reduce observer errors; they do not create a comprehensive
native-memory census.

GPU requested-allocation bookkeeping needs context/unit/face/level-aware storage,
format/type and mip accounting, deletion/unknown handling, and explicit
initial/final snapshots. Shader-stub and real-link populations must stay separate.
Driver padding, caches, compression and drawing-buffer residency remain outside
these requested-storage estimates.

**Correction to the texture-unit experiment:** the original audit fixture expected
80 bytes from two units but never issued the required `activeTexture` calls, so
that fixture did not establish a unit-switch defect. The corrected control
explicitly switches units and reproduces the original estimator reporting16 bytes
instead of80. Other independently demonstrated format, mip, renderbuffer and
buffer-subrange defects retain their own controls. An invalid fixture must not be
presented as evidence merely because the implementation also has a real defect.

An empty supported CDP response now has unavailable domain status when no usable
counter exists. Valid zero remains available, and unavailable fields remain null.
Heap bytes, DOM counters and protocol-dependent Performance metrics retain their
separate units/scope; collection performs no forced GC or intrusive preparation.

Standalone saved-report queries keep successful reading separate from measurement
validity. An optional bounded, path-guarded adjacent producer manifest reports
source SHA/dirty state, exit/stop/cleanup, intended result-file identity and
freshness within producer start/end with filesystem timestamp tolerance. Missing or
legacy provenance remains unverified. A failed/stale producer cannot become a
measurement pass because an older report says `ok`. Historical source SHAs remain
readable; source or result differences do not imply automatic A/B comparability.

RAF callbacks, successful render-gate decisions, completed renderer submissions
and visible soft presentation are different events. Bounded probes must bind a
fixed intended-scene receipt before sampling; a menu warm log plus four RAFs can
precede the new scene's completed readback. Requesting another draw after the
picker's last warm frame can wait indefinitely. Physical scanout is a further
boundary. GPU timer results need scope, age and freshness before comparison.

The minimum later heap-growth interval can hide intermittent drift. The growth
follow-up retains the full series and introduces a five-visit median policy with
controls for documented Metal warm releases, known leaks and intermittent growth.
A growth budget remains a diagnostic policy, not proof that all resources retire.

## Focused evidence and remaining validation

Isolated controls covered governor attribution, asset scheduling/unload, worker
liveness and epoch replacement, replay byte budgets, hidden HUD sampling/speech,
WGX exceptional cleanup, shared-binding ownership and reporting contracts.
The assembled candidate passed a focused selection with 137 reported outcomes and
8 supplemental parameterized cases. Some selected files had no matching named
cases, so 137 is not a count of individual changed regressions. Latest complete
focused suites passed 32 GPU/query controls, 55 HUD controls, 26 presentation/growth
controls and 15 status-parser controls. Changelog/document checks passed 45 cases.

The HUD repair adds 34 code lines and 30 total lines after shared speech removes
duplicate paths. The repository's generator records that justified growth through
its existing 40-line allowance and a commit reason; no functional tolerance was
changed. The vendor generator confirms 26 files match the manifest and the
sanctioned patch set. Monza geometry verification passes. LSP reports no
high-signal errors in the final HUD; game/worker diagnostic messages match the
baseline, including existing ambient-type gaps.

The full combined gate and hardware verdicts are recorded in
[PR2982](https://github.com/brycejmurrin/f1-game/pull/2982). Software checks below
are not physical-phone validation or deployment evidence.

## Integrated software experiments

The integrated working tree based on `7df011b4f` completed eight alternating
Monza/Monaco picker visits at 480×270, DPR1, reduced motion, with forced GC.
The same observed render-context cache previously measured
`1,1,4,7,10,13,16,19` groups; the candidate measured
`1,0,3,3,3,3,3,3`. Its initially observed group 220 was absent at the end.
Every candidate visit had the expected public track root, actual WebGL2,
a completed native-frame receipt and zero GPU/page errors. The newer receipt
boundary differs from the exploratory baseline; these are cache-ownership
observations, not a retained-byte or FPS comparison.

A native WebGL2 control estimated 672 texture bytes, 24 renderbuffer bytes and 12
buffer bytes for known allocations, then 656 texture bytes after one deletion.
A duplicate deletion did not increment the lifecycle count. An intentional invalid
allocation preserved `INVALID_VALUE`, left the estimate unchanged and counted one
failed call; a real linked shader drew the expected red pixel. These small known
allocations validate API arithmetic, not physical residency.

Three real baked models decoded across three browser task boundaries. Reading
them again returned the same cached objects without further yields. An initial
experiment incorrectly treated `Assets.models()` as a decoded-cache count; that
API lists all 77 catalog IDs. The corrected control checks object identity and
`modelSync`, and the invalid control is retained separately. This establishes
admission behavior, not a long-task or loading-time improvement.

Montreal probes rendered WGX and TLX/WebGPU (Lavapipe), including the TLX
environment gate, with zero GPU errors and changing visible frames. At 844×390
with touch and rendering suppressed, a three-second visible HUD window recorded
259 subtree mutations and 29 input-canvas paints. API-hidden and class-hidden
windows each recorded zero mutations/paints while retaining 90 input samples.
The API-hidden window still observed isolated geometry reads; the class-hidden
window observed none. No phone FPS or complete absence of layout work follows.

The full five-visit browser spec exposed two receipt defects: preparation may
resize the display, and TLX backpressure can leave the final warm draw waiting on
an earlier draw of the same world. Receipts now freeze an actual submission
observed after the fresh build, require its completion, and reject prior-world
submissions or later display changes. Twenty-six focused controls pass. Both
initial failures remain recorded; the corrected complete sequence passed all ten
samples, with one live world and zero orphaned node-builder states throughout.
Median post-warm-up growth was about 0.6 MiB for Monza and 0.4 MiB for Monaco,
within the unchanged 10 MiB budget. This finite sequence does not prove leak freedom.

## Existing outside ownership

Open PR snapshots reviewed during this audit:

- [#2954](https://github.com/brycejmurrin/f1-game/pull/2954) owns duplicate first garage-atlas upload and three retained crew meshes.
- [#2948](https://github.com/brycejmurrin/f1-game/pull/2948) owns garage/preview frame-delta pacing at slow frame rates; it does not claim sustained iPhone FPS recovery.
- [#2955](https://github.com/brycejmurrin/f1-game/pull/2955) owns opting the historical pinned garage experiment into the GPU workflow. Source-pin rejection occurred before the browser/report; four green renderer controls did not make that workflow green.
- [#2941](https://github.com/brycejmurrin/f1-game/pull/2941) and [#2956](https://github.com/brycejmurrin/f1-game/pull/2956) own HUD fit correctness/manual geometry. [#2973](https://github.com/brycejmurrin/f1-game/pull/2973) also touches paused input telemetry. Hidden visual suppression must preserve their contracts.
- [#2951](https://github.com/brycejmurrin/f1-game/pull/2951) concerns memory infrastructure/configuration and browser cancellation ownership; it is not the shared-binding vendor repair.

These are ownership snapshots, not assertions that those PRs are merged or that
their changes are deployed.

## Profile-only opportunities

Replay location data is filtered/sorted in the API and again by trace packing;
WATCH restart projects samples synchronously. Removing duplicate work needs a
normalized-input contract, representative full-race cost and dropout/order/cadence
controls. Whole backing buffers transfer, but the synthetic tiny-view/large-buffer
ratio does not establish production over-allocation. Separate page/worker model
caches likewise need capacity and lifecycle measurements before deduplication.

Steady garage room-key allocation/atlas replacement, repeated quota-cleanup scans,
eager JavaScript/service-worker install pools, indivisible track-build stages,
physics swept-pair/corridor work, chunk folding and conditional CPU-array release
remain profiling opportunities. Preserve offline contracts, later shader compile
requirements, alias ownership, lamp/night/culling parity and existing quality.

Corrected software runs visibly render TLX/WebGPU and WGX; the initial black
capture did not establish a persistent renderer defect. Serviced lifecycle queues
plateaued, and much observed heap growth was compiled code. Neither those controls
nor a passing growth budget proves general leak freedom. Constant slow governor
intervals remain ambiguous between workload and external cadence; no control-policy
redesign or hardware FPS ranking follows from them.
