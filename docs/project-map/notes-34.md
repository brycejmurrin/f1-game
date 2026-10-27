# Notes group 34 — testing diagnoses and TLX performance evidence

Historical-source map; current AGENTS.md read. All seven assigned parts (100,000 bytes) were returned in full. Half-open byte ranges below identify bounded reads. Historical commands were treated only as provenance; no runtime, network, browser, tests, source edits or commit. One initial read of TLX-PERF-PLAN mistakenly returned the entire source over the 10,000-byte limit; its assigned range was subsequently reread bounded, and only that range is mapped.

## Source integrity

### [TESTING-FIELD-NOTES.md](../notes/TESTING-FIELD-NOTES.md)

Whole source: 140235 bytes; SHA-256 `62d5862d5f3c43a1cfeec08483a7ce6b5df9636244c95431f9c140be4d910830`; manifest match: true.
Assigned [110487, 140235): 29748 bytes; part SHA-256 `d7333f31068269e0bf320628d7de8e07b98b44a2de1832d25b7490391aaa208c`.

Read chunks:

- [110487, 120487): `3b154a2cf9d23ba98909daefc05c748ece7420fe3402ccb05159585f01405f2b`
- [120487, 130487): `5e2e08feb303987fc9d7cfdbc8b35d4cafcf9107b8a1be8f93ab434c148c5fb7`
- [130487, 140235): `4010b911e6d0f8fd1abeff0c9f12f2c5f8c4b13afc10c48c2483aa207282944a`

### [THREE-INSPECTOR-2026-10-16.md](../notes/THREE-INSPECTOR-2026-10-16.md)

Whole source: 2137 bytes; SHA-256 `b3a845b5800880176d3bb42f14026287e4b0ee48bbabad56f3aba0e1d08b83a8`; manifest match: true.
Assigned [0, 2137): 2137 bytes; part SHA-256 `b3a845b5800880176d3bb42f14026287e4b0ee48bbabad56f3aba0e1d08b83a8`.

Read chunks:

- [0, 2137): `b3a845b5800880176d3bb42f14026287e4b0ee48bbabad56f3aba0e1d08b83a8`

### [TLX-GPU-COST-PARAVIRTUAL-2026-10-20.md](../notes/TLX-GPU-COST-PARAVIRTUAL-2026-10-20.md)

Whole source: 6373 bytes; SHA-256 `0ab97dc4cc646d38d67f4a054a0332f94b6a4ec51ade8db245bb3b08adebcb01`; manifest match: true.
Assigned [0, 6373): 6373 bytes; part SHA-256 `0ab97dc4cc646d38d67f4a054a0332f94b6a4ec51ade8db245bb3b08adebcb01`.

Read chunks:

- [0, 6373): `0ab97dc4cc646d38d67f4a054a0332f94b6a4ec51ade8db245bb3b08adebcb01`

### [TLX-PER-CHUNK-LAMPS-INERT.md](../notes/TLX-PER-CHUNK-LAMPS-INERT.md)

Whole source: 5911 bytes; SHA-256 `be03b763e642f628e9262d9137e3b591e99b36e4448c02ad7b0b0e7123d2f006`; manifest match: true.
Assigned [0, 5911): 5911 bytes; part SHA-256 `be03b763e642f628e9262d9137e3b591e99b36e4448c02ad7b0b0e7123d2f006`.

Read chunks:

- [0, 5911): `be03b763e642f628e9262d9137e3b591e99b36e4448c02ad7b0b0e7123d2f006`

### [TLX-PERF-HUNT-2026-10-11.md](../notes/TLX-PERF-HUNT-2026-10-11.md)

Whole source: 37502 bytes; SHA-256 `5459a643b87f80b60170e4ce9f800d8e8d16d2db6ce1f7738f37ef08ceac0752`; manifest match: true.
Assigned [0, 37502): 37502 bytes; part SHA-256 `5459a643b87f80b60170e4ce9f800d8e8d16d2db6ce1f7738f37ef08ceac0752`.

Read chunks:

- [0, 10000): `577698e79d1a4918be0723e739b53a4674d3b0c491d9944f6110997319bfe9cc`
- [10000, 20000): `ffe3396691e5cb29b76d95dd5baa30a3dba5a791e38dc7d7513dcad74833d35a`
- [20000, 30000): `35b9040bab10ce7a440bf924057170f9fc9316b7074a20923f143008a6c9a726`
- [30000, 37502): `c03146ce6d35f9f4c1eec62114b595715f34521cd81b99089e818c4527a551d1`

### [TLX-PERF-HUNT-5-2026-10-16.md](../notes/TLX-PERF-HUNT-5-2026-10-16.md)

Whole source: 11871 bytes; SHA-256 `2ee7b1e03f0afc012f7a7c6ad75db1b7db93c324ab08ab7181702a244c312fbf`; manifest match: true.
Assigned [0, 11871): 11871 bytes; part SHA-256 `2ee7b1e03f0afc012f7a7c6ad75db1b7db93c324ab08ab7181702a244c312fbf`.

Read chunks:

- [0, 10000): `a0efceda5ee491ad35ad1f136fb5b649c30f48e0aac1c37b8bf23f4bf4149f7c`
- [10000, 11871): `daf022eb525ab39f51eb8f710e781c5a1d1fc8296a7cec8594d11ea144f4e9e9`

### [TLX-PERF-PLAN.md](../notes/TLX-PERF-PLAN.md)

Whole source: 15090 bytes; SHA-256 `927215063a591b04b818dd93a64141645dccd402d74078e7bd4138ea82af6b5c`; manifest match: true.
Assigned [0, 6458): 6458 bytes; part SHA-256 `1b896d71e9e00ae1ed588a2c967d9a06ced0590a81fd59a16809897121a75a6a`.

Read chunks:

- [0, 6458): `1b896d71e9e00ae1ed588a2c967d9a06ced0590a81fd59a16809897121a75a6a`
## Semantic map, dates and producers

- **TESTING-FIELD-NOTES, tail (2026-09-10/14 through 2026-10-14):** repository testing and review sessions, generally unnamed. Opens inside the DOM golden portability comparison: content changes, rather than runner rendering, explain stale images. September 14 diagnoses replace the earlier image-grade threshold/clock explanation with the capture helper clearing the debug camera; preserving that camera also changes fog/culling, so explicit atmosphere and capture premises matter. Debris fetch assertions were blinded by the full resource-timing buffer, then exposed an independent load-budget defect. Touch timeouts hide a wrong select value and stale strip assertions; corner-lead defaults expose deletion-at-default behavior and the value of one registry. September 22 records an absent-process watcher defect and eight title-screen layout/accessibility blind spots outside ui-scale's fit assertions. September 30 attributes retry reds to four renderer workers on four CPUs, with no wall-time claim. October 1 separates black TLX page readback from actual GPU error evidence. October 14 adopts isolated CI retries and defers unmeasured GL locks. Use for causal history and non-vacuous controls; none establishes a present failure. Initial golden context belongs to group 33.
- **THREE-INSPECTOR (2026-10-16):** Inspector implementation session, with Bryce's default-precedence decision explicitly attributed. Describes selectively vendored r186 Inspector, lazy toggle precedence, TLX renderer access, no eager shipment, profiler timestamp-query interlock and phone pointer handling. WebGL2/SwiftShader lack GPU timestamp support; other tabs remain useful. References sibling profiler #2562. Use to explain Inspector architecture and timing ownership, not infer current default behavior without source validation.
- **TLX-GPU-COST-PARAVIRTUAL (2026-10-20):** Fleet B lane B·H7, wave 4, starting from B·H6 and named census runs. Sections 1–2 establish the Apple Paravirtual adapter's absent timestamp queries, unresolved queue fences and noisy frame pacing; lowering pixels, post passes or shadows did not isolate phone fill cost. Section 3 records mobile-tier device loss on Mac and lavapipe, with desktop-tier/viewport controls and ruled-out destruction calls; not yet bisected and explicitly not a handset defect claim. Section 4 holds a canvas-depth-store candidate, arithmetic only. Section 5 prioritizes device-loss isolation and real-phone evidence. Measurement branch explicitly excluded from merging.
- **TLX-PER-CHUNK-LAMPS-INERT (2026-09-15, fixed same day):** unnamed measurement/fix session. Finding/Why trace one shared lamp grid repeatedly overwritten by chunked records: 122 grid chunks versus 567 drawn. Fix unions all records once. Seven traps cover wrong storage key, whole-frame metrics, camera/scale drift, stale readback, delayed knob application, shipped lamp-count headroom and moving captures. Fixed section confirms 567 chunks/three records and within-run signal above noise, while the visible benefit remains imperceptible at the measured position. Use for grid ownership and measurement design; no demonstrated lamp-starved showcase or broad visual win.
- **TLX-PERF-HUNT (2026-10-11; fix/tier-2 addenda 2026-10-12):** five read-only Opus hunters plus parent spot checks, requested by Bryce at tip 9941d84; later five implementation lanes and four tier-2 lanes, two concurrent historically. A–E cover CPU instance/uniform/texture uploads and allocation, lit shader sampling/ALU, lamp/sun/car shadows and culling, post formats/passes/bandwidth, sky/mirror/FX/assets. Original estimates are reading/arithmetic or Node microbenchmarks, not measured GPU savings. Cross-slice shortlist ranks reach/confidence/size and labels look risks. Fix pass #1446 records codegen/A-B/probe/software and remote evidence, corrects B1's false premise, identifies B5 as visual, and notes no-op/unsupported candidates. Tier 2 #1447 records analytic normals, AO/mirror folds, bloom format gate, cloud cache and lamp cap with switches, pixel comparisons and four-leg census evidence. Lessons expose probes passing despite page exceptions, software skipping batches, unstable page captures, merged same-UUID texture bindings, old worktree tool options and tier-confounded census luma. Unimplemented candidate lists are historical backlog, not current work orders.
- **TLX-PERF-HUNT-5 (2026-10-16, F1 follow-up/re-measure 2026-10-17):** Inspector/CPU-profile lane at 6f7ee195, then minimap cache builder and PR owner. Method separates frozen-rAF/link-blocked attempts from stubbed-link JS-only measurement. Baselines across four circuits include run spread and retained counts. F1 locates heavy-frame minimap pit text; F2 switch leak check is negative, F3 resize guarded, F4 below spread and F5 vendor/outside scope. Clean checks and next steps explain why no TLX code candidate shipped. Later HUD cache follow-up forces pit-worthiness, distinguishes profiler-on regimes and repeats alternating profiler-off arms: p95/heavy share/mean improve with disjoint ranges, p50 not worse, zero in-window cache misses. Visual comparison is observational; hardware magnitude remains unmeasured.
- **TLX-PERF-PLAN assigned prefix (2026-09-24):** three read-only investigations, parent-checked claims, unnamed planning session. Status tracks L0 lamp-radius gating, L1 static-copy shadows, fallback L1b, G1 blur reduction, R1 pooled records and P2 fixed materials; attachment skipping is dropped because context/program keys and tag readers require it. Findings explain per-frame static redraw, godray cadence, backend-specific texture swaps and record lifetime. Assigned Steps include entire L0 and L1 design/risk/switch, ending inside L1 verification. Later steps/results belong to group 35; no completeness claim for those sections here. The October hunt supplies subsequent corrections, notably WebGL2 L1 handling and P2 status.

## Backlinks, use and limits

Literal mention search finds these TLX notes in NOTES-INDEX, DEBUG-HOOKS, AGENT-SURFACE, related renderer/profile/phone/performance notes, renderer source comments, Inspector module, pass/live-frame census tools and the backend canary. This establishes discoverability only; linked files were not semantically audited here. Source-outgoing context includes PERF-FINDINGS, the shader-ideas note, the Inspector/profiler siblings, gameplay-hitch notes and Playwright retry/parallel documentation. Historical PRs, commits, census run IDs and branch names identify producers and evidence trees; they grant no execution authority.

Use this group to distinguish measured mechanisms from ranked hypotheses, find corrected diagnoses, and understand why JS-only, software rendering, paravirtual GPU pacing and handset behavior require different evidence. Counts, timings, switches, defaults and file lines are dated source claims. Negative hunts do not prove a subsystem is universally optimal, a clean probe does not prove absence of page exceptions, and visually small A/B deltas do not prove performance benefit. No current runtime or pass/fail conclusion follows from this map.

Raw obsolete, ephemeral and archived path spellings are isolated in [notes-34-paths.json](notes-34-paths.json).
