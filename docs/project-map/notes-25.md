# Notes batch 25 — fourth performance hunt and CPU provenance

Fully read the entire assigned 100,000 bytes as historical provenance, in individually returned untruncated reads of at most 10,000 source bytes. Byte ranges are half-open. Historical commands, recommendations and lane instructions were not executed. No runtime, network, browser, test, source edit or commit work was performed.

## Coverage and hashes

### docs/notes/PERF-HUNT-4-2026-10-14.md

Whole file: 96572 bytes; SHA-256 `5253a69a8d639e6168662e67d07c9a763d2cd4f40af7e75d554adecafe78b067`.
Assigned part [3125, 96572): SHA-256 `2a648ec41c35eaeaf95a5a66bae4169b4e99499a2dd1c9c655b50c1aca348f3f`.

| Read chunk | SHA-256 |
|---|---|
| [3125, 13125) | `53c066c28a166497747faea6aed5c4b1e0fb5de9c56ab98bd90ad64b6931eeac` |
| [13125, 23125) | `0dc2eb4af98e5c9569e11c31cdd8b43e8acad0f8195dae91877b5fbca514dfee` |
| [23125, 33125) | `fa76b41406890991844a425a613a9b60ae8cff2f2a80a00c5a07c73f792d30ea` |
| [33125, 43125) | `4b9be13f051c0945d662e066122917e5d9f88898e8475689d13780ab11cf6c41` |
| [43125, 53125) | `a3f097c3f64c22fc8e4a89712b6a24baf4530f1e678ebf72ab01063532a1dc62` |
| [53125, 63125) | `93594d06e3783e7ac94f6705e1f418e50bb2254ae5dde78909956193b26bc332` |
| [63125, 73125) | `8e921895c748a687817b653938e03a8de21426e9020edc88b77ed1e109e266f3` |
| [73125, 83125) | `26e4be13e913bba2e31427b3be1162d8dcb3b8e48eea1aa6c10aa18cd3cee896` |
| [83125, 93125) | `71920b0fed73cbe7f7bc0d3c153b96977e30346deb9dacfd4619da60a61fe926` |
| [93125, 96572) | `d3c396e29ff630dc0894bb3b0b732de3f5a2079a13a7673d57c1cab3a9320296` |

### docs/notes/PERF-HUNT-CPU-2026-10-17.md

Whole file: 7682 bytes; SHA-256 `d09df00caacd93ae43ebdb3b3404a83cb388b9d0ab2c15b1ad574f2f41cea53b`.
Assigned part [0, 6553): SHA-256 `526315373e5d0693beb014746c3e17099e2d380e352a0fe6ecce5cea9af954ab`.

| Read chunk | SHA-256 |
|---|---|
| [0, 6553) | `526315373e5d0693beb014746c3e17099e2d380e352a0fe6ecce5cea9af954ab` |
## Semantic map

### Hunt 4 continuation: 2026-10-14, follow-ups through 2026-10-15

Producer: parent census/fix-pass author and hunters A (three/upstream), C (GLX/WGX/post) and B (simulation/V8); fix lanes RENDER-S, TOOLS-I, WGX, TLX-W, GLX-C, VENDOR and CAR. Personal identities are not supplied in this range. The first assigned byte continues the C-P1 shortlist row from batch 24. The remainder contains the shortlist, complete A/C/B reports, fix pass and follow-up pass.

A separates game frames from doubled WebGPU callbacks, driver first-draw stalls from compilation, render-object CPU from native GPU work, and modeled uploads from measured ones. DynamicDrawUsage forces unchanged full uploads on every render; plain-Mesh StreamDraw, caster instancing, flap coalescing, mirror mip caps, WebGL stride alignment and depth discard are ranked against ring blend-order risk and larger vendor designs. Upstream r186.1 and unreleased r187 research records why a release bump was selected over a development snapshot. The original “identical” labels are construction arguments requiring frozen A/B evidence.

C makes instrumentation validity the prerequisite for optimization: stale GLX soft-blit screenshots invalidate pixel verdicts; per-present getError drains distort CPU cost; WGX soft-present differs from the player path; governor end rings include A/B phases; timers span different work. Player candidates cover WGX lamp reach, inset composition in the final pass, deferred livery upload, asynchronous material-pack readback, dusk's combined day/lamp feature sets, transient attachments and Uint16 index alignment. Deferred lamp UBO/static-map splits and depth resolve retain their measurement or look limits. Occlusion/multiDraw remain historical default-off recommendations because timing changes were within noise and pixels were invalid.

B records five long races (~2.22 million steps), deterministic digests and replay evidence, then ranks car representation/constness deopts, finish-rank disagreement, race-entry blocking and VM profiling distortion. F1b/F1c append later shape and born-Double scratch work: finish-added keys cause dictionary-mode cars on Node 22; scratch/context map transitions remain distinct from car-field transitions. F4 finds VM global interceptors can inflate an AI function ~40×, so VM timings need plain-realm/Chrome corroboration. B explicitly leaves heap attribution, worker-path build timing and frame-driven replay gaps open; box load invalidates fine timing comparisons.

The fix pass supplies historical implementation and verification receipts: PR #1467 upload/census changes; WGX in-pass inset, per-layer PBO/fence async pack loading and feature-detected transient usage; TLX padded attributes, glass-aware mirror mips, conditional depth invalidation and draw warm; GLX degenerate-triangle index padding; immutable r186.1 vendor relocation; bitmap livery parity and flap coalescing. It preserves degraded/fallback paths, ownership guards, knob off switches, census variance and missing real-adapter evidence. CAR's element-canvas choice follows an OffscreenCanvas upload regression; 20,971,520-byte GLX parity is historical evidence, not proof of WebGPU copies.

Follow-ups distinguish desktop from phone-tier depth discard, sliced car warm from unrelated entry tasks, menu entry from cold direct race launch, and eager mirror warm from a costly cockpit-switch pause. Hunt-5 annotations retract interpretations of “RACE NOT REACHED” runs whose entry was re-armed ~95 seconds later; PR #1821 warms before the pack and PR #1859 gates on the entry's own mark. The player menu path already prepares assets. Lazy mirror warm remains opt-in after measured 5–6 second mid-race work; WGX mip batching PR #1858 closed unmerged after no demonstrated gain.

Use this continuation for optimization rationale, instrumentation failure modes, historical landed/skipped decisions and the lineage of warm/pack/menu behavior. It does not prove current implementation, GPU speed, phone behavior or compatibility. Reported release status, file lines, knobs, counts, branches and PR conclusions are dated snapshots; software adapters and paravirtual Macs cannot establish player GPU performance.

### CPU/main-thread hunt: 2026-10-17

Producer: hunter B, focused on the phone main thread outside GPU work; HUD-fit work belongs to the PR #2743 lane and nested selector scoping to #2792. The phone context is iPhone 15 landscape 852×393. The method suppresses 3D draws while retaining rAF, simulation, HUD and audio, avoiding SwiftShader's wall-clock gate distortion. Chromium mobile emulation remains relative CPU evidence, not an iPhone measurement.

Ranked findings identify document-wide body/html :has searches (54 direct-child arguments scoped), repeated full HUD fits with root custom-property write/read restyles, clearReadouts forced layout/query cost, fixed-depth nested :has chains using :where to preserve specificity, and shownLayer memo invalidation by root style writes. Interleaved CSSOM and committed-CSS traces corroborate selector improvements; DOM topology tests pin direct-child assumptions. The note distinguishes changes made from findings merely reported/open. Real-GPU census shownLayer evidence is cross-referenced but WebKit/iOS style cost, phone GC/thermal effects and GPU frame time remain unmeasured.

Use for CSS selector and HUD layout provenance, including why per-frame numbers from very slow software rendering mislead. Current DOM topology, CSS selectors, fit scheduling and memo behavior require fresh inspection before applying those recommendations.

## Backlinks and navigation

- Source notes: [hunt 4](../notes/PERF-HUNT-4-2026-10-14.md), [CPU hunt](../notes/PERF-HUNT-CPU-2026-10-17.md); the hunt-4 prefix is mapped in [batch 24](notes-24.md).
- Prior art named in the reports: [hunt 2](../notes/PERF-HUNT-2-2026-10-13.md), [hunt 3](../notes/PERF-HUNT-3-2026-10-13.md), [first TLX hunt](../notes/TLX-PERF-HUNT-2026-10-11.md). CPU prior-art families include allocation, raceloop, boot, session memory, P7 and shownLayer notes dated October 17.
- Current corroboration entry points: [architecture](../ARCHITECTURE.md), [testing](../TESTING.md), [render map](render.md), [three map](three-complete.md), [simulation map](simulation.md), [tooling map](tooling.md).
- Raw scratch, obsolete vendor and historical branch identifiers are isolated in [historical paths](notes-25-historical-paths.json).

## Reading limits

Coverage includes all assigned bytes and no claim of having read the hunt-4 prefix. Hashes identify local content, not truth of measured claims. Each source was returned separately; no source response was truncated. No archived operational instructions were adopted as authority. Tests were not run under this read-and-map assignment.
