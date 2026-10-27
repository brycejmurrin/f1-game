# Notes batch 16 — live debugging, phone performance and livery provenance

Read 2026-10-27: all eleven assigned parts, 100,000 bytes, in individual source chunks of at most 9,000 bytes. Ranges are zero-based and end-exclusive. The opening phone-performance slice continues batch 15. Historical instructions, grants, lane ownership and next actions carry no present authority. No runtime, network, browser, tests or historical commands were executed.

[Provenance inventory](notes-16-provenance.json) records whole-file and assigned-part hashes, individual read-chunk ranges/hashes, file sizes and incoming documentation backlinks. Whole-file hashes match the batch manifest. Backlinks are textual references outside this map, not evidence that a claim remains current. [Historical path inventory](notes-16-historical-paths.json) keeps raw local and vendor references separate; their existence and suitability were not verified.

## Semantic map

### Phone-performance hunt continuation — 2026-10-24, updated 2026-10-25

Producer A·H10; assigned bytes 6463–18810 start within PP-11 and cover PP-12–19 plus handoff and reversal. PRs #3679/#3690 and A·W47's vendor work connect attachment-bandwidth experiments, cache residency, lamp upload, CPU sampling and real-GPU validation. The important sequence is preserved: RGB scene targets initially broke WebGPU blending because fragment outputs lacked alpha; a backend guard restored validation, a vendor patch later enabled the WebGPU path, and actual iPhone WebGL2 measurements then prompted reversal of that leg. The final dated addendum supersedes the earlier WebGL2 recommendation. Resource-growth leads are downgraded to bounded warming, with hardware WebGPU race cycling still missing. VM CPU shares and paravirtual census rates cannot establish phone gains. Use to understand rejected optimizations and backend-specific evidence, following current renderer references before applying anything.

### Race-weekend debugger — 2026-10-16

Unnamed race/AI lane, PR #2549, fix 86419660. Records a live shower-end temperature discontinuity and a VM-only storm safety-car rewind defect; their different evidence levels matter. AI stopped-car braking #2565 is a separate handed-off finding. Pit stress, rescue, classification and wet-race checks distinguish real scenarios from synthetic placement and incorrectly applied safety-car setup. Some final-lap classification cases remain ambiguous. Historical tooling and physics-core results cover only their named revisions; multi-lap weather combinations, final-lap pits and live rewind remain absent. Use for weather interpolation and rewind rationale, pit-scenario pitfalls and original test navigation.

### Race-flow hunt — 2026-10-24

Fleet A hunter A·H11, seed b3779370. S1–S16 cover SC/VSC release, overtake eligibility, tyre strategy, red-flag regrids, time trial, qualifying, restarts and transitions. No confirmed player-facing defect was found; stale frozen state is code-only hygiene, and apparent missing pit plans were caused by changing wear after grid creation. Pause VM stepping bypasses the real frame gate, and one restart tap merely arms confirmation. Natural debris cautions required an explicit software-renderer switch; the six-second SC minimum is recorded as a design question. Heap cycles were flat after warming; increasing GPUBuffer counts were a renderer lead, not proof of leakage. The later race-flow VM test and CPU profile give reproducible scenario provenance, while handset caution/pit behavior remains unverified. Use for scenario design and distinguishing probe artefacts from product behavior.

### Render-backend debugger — 2026-10-16

Unnamed render lane, PR #2555, fix fc1926e9. A live ResizeObserver failure on an init-owner canvas Proxy explains why CSS-box-only changes were missed; observing the underlying element is the recorded correction. Coverage separates live, mock, code-read and unrun rows across TLX/GLX/WGX. Counts generally plateau after warm-up, but headless counts omit lazy uploads and drawn SwiftShader loops stall. Context-loss build rejection/reload is clean in recorded GLX/TLX runs. Externally destroyed WGX devices freeze without recovery, explicitly DevTools-only. Several early not-run statements are qualified by the later expanded matrix; use the final per-scenario account. Current boot defaults and backend selection must come from current code and architecture, not this dated environment.

### Drawing-runner evidence — 2026-10-17

Unnamed evidence compiler; Grok Bot selected historical route B for #2572/#1651. Apple/Metal workflow samples establish that race-entry instrumentation produced numbers on Vegas and Spa, with PR #571/#575 revision attribution. They do not establish improvement: unmatched revisions, higher total blocking in the available Vegas comparison, absent Spa baseline and missing detailed spans preclude causal A/B claims. Same-circuit resource, context-loss, visibility, orientation and quality sweeps remain unrun on hardware. Use as a precisely bounded evidence inventory.

### Live frame census — 2026-10-20

Fleet B B·H10, live revision 2eda36c6. Multiple census rounds identify synchronous TLX-WebGL2 first-draw program links and bindings for post scene/mirror contexts that the warm did not compile. Warm-all-chunks alone did not cover different target program keys; B·H8/#3246 owns that follow-up. WebGPU long-frame rates varied sharply, defeating attribution to periodic game work. Local physics/GC and HUD shares rank smaller CPU costs. The macOS GPU is paravirtual; huge stalls establish blocking structure, not handset duration or fill-rate cost. Historical iPhone backend assumptions differ from later notes and must not be promoted to current selection rules. Use for warm-context correctness and census field interpretation.

### Live input and HUD — 2026-10-20

Fleet B B·H11, PR #3245 and later HUD-fit branch. Throttled SwiftShader headless probes isolate main-thread work: a gap-chip selector combining has/empty caused broad style invalidation, and a data attribute reduced measured style cost by 42 percent in interleaved windows. Cheap remote-active checks moved before UI-layer walks. Follow-up records resize-aware same-key HUD fitting and cached viewport dimensions for touch drags. Touch handling itself and steering ramp feel were distinguished from latency. Browser-engine sources explain mechanisms; CPU-times-four and skipped rendering are explicit limits, not a phone benchmark. Use for invalidation rationale, avoiding forced layout and locating behavioral regression tests.

### Live session memory — 2026-10-20

Fleet B B·H12, baseline 2eda36c6, final recorded head 768a9690. Repeated race/menu/garage/track cycles trace unbounded old-field retention through collision arc buckets, one-generation field scratch and overtaking caches into whole tracks. Nulling dropped references produces a plateau, with raw-field and browser digest agreement and a WeakRef guard. One-race heap is flat; idle garage prebuild is a separate transient cost. Backend fallback removed renderer-info access, so JS/ArrayBuffer evidence does not validate GPU lifetime. The proposed 300 MB phone budget is anecdotal working guidance, not a vendor guarantee. Use for ownership/lifetime rationale and cycle-based leak checks.

### Launch-livery sourcing — written 2026-09-08, additions 09-09, erratum 09-16

Unnamed researcher, with owner photographs for Ferrari/Mercedes and launch-gallery observations for other teams. Explains cover versus spine fields, rejecting an initially misidentified Williams tribute, correcting Audi silver/black, adding independent spine tint for Aston Martin, and treating Alpine's unchanged blue cover as a resolved negative finding. Cadillac body split and Racing Bulls streaks are also recorded. The opening erratum supersedes Alpine pink crown claims below: white replaced pink for contrast. Source photographs have angle uncertainty; old egress/browser workarounds are historical environment facts. Use to preserve visual sourcing and avoid forcing a known appearance through the wrong model field.

### Classic paint layouts and stations — 2026-10-19, round 4 on 10-20

Unnamed design producer, later D5c. Five generic patterns cite historical visual references while retaining original geometry. Four decal stations derive placement from actual car anchors: nose tip, cockpit side, pod top and halo top. Floor-edge placement remains excluded because ride height is absent from decal-cache keys. The halo follow-up corrects a misleading unfared-car probe: stock fairings suppressed the strip, so it was moved onto the fairing tube. Use for pattern intent, geometry ownership and representative test setup; historical named gates were not rerun.

### Grid design vocabulary — 2026-10-18

Unnamed research producer for livery-design worker LD. Eleven launch-image/text rows feed paintable-part zones, original procedural motifs and fixed logo/number stations; the companion launch note owns shipped team values. Sources RR/TA/SV/MT/GM/F1 support different claims, with Cadillac asymmetry relying on text and crown/underside claims weaker than flanks. Proposed gaps include keylined splits, halftone/chevron fades, tapered triple bands and extremity coverage. The entire assigned file ends mid-word in the proposed pattern list; no missing continuation was inferred. Originality constraints and reference-only images are historical design scope. Use for design vocabulary and source attribution, not proof those proposals shipped.

## Current-use boundary

This batch maps why changes and investigations happened. Current engineering authority starts at [AGENTS.md](../../AGENTS.md), [architecture](../ARCHITECTURE.md), [physics](../PHYSICS.md), [debug-hook reference](../DEBUG-HOOKS.md) and [verification](../VERIFICATION.md). Dated branch/PR statuses, source line numbers, backend defaults, benchmark values and tests cited above require independent current corroboration. No source or operational state was changed by this reading.
