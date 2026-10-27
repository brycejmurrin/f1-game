# Notes batch 13 — device measurements, rendering and engineering rationale

Read on 2026-10-27. This map covers all 100,000 assigned bytes across eleven parts. Ranges are zero-based bytes with exclusive ends. Each source chunk was individually returned in a read of at most 9,000 bytes, without tool truncation; headings alone were not substituted for reading. Historical commands, permissions, budgets, owners and proposed follow-ups are provenance, not current instructions. No runtime, browser, network or test verification was performed.

The [provenance inventory](notes-13-provenance.json) records whole-file, assigned-part and read-chunk SHA-256 hashes, exact boundaries, source sizes and textual incoming backlinks. Backlinks were found in documentation outside this generated map; they show discoverability, not endorsement or execution. Raw archive and artifact references are retained in the sources and inventory rather than reproduced as executable instructions here.

## Semantic map

### Device Farm analysis tail — 2026-10-24

The assigned tail finishes the method-fix table and the “Sent and filed” section. It warns that iOS GPU timestamp values exceed actual frame intervals, establishes repeat-count requirements for cold and cached entry comparisons, and identifies issue destinations for stability, hitches, entry floor, memory and harness corrections. Producers are the analysis lane and named Fleet A owners; the tail records PR #3671 and issues #3672–3676. Use it to trace how analysis became work items. Only the ending is assigned here; conclusions and derivations in earlier sections belong to the preceding batch. The tail begins mid-row.

### Device Farm ledger — 2026-10-23, appended through 2026-10-25

Produced by Fleet A device lanes A·D1/A·D2, with contributions from A·W14, A·W13 and A·O6, at OrchA’s request. Section 1 logs 29 runs: renderer choice, shader warming, cache persistence, phone fill limits, visor/governor interactions, photo capture repair, BOOST input/audio hitches, discard flags, scene-format A/Bs, Opus decoding and menu preparation. It preserves corrections: unknown cache history spoils cold comparisons; governor crash strikes contaminate visor arms; long endpoint pauses were ignored; the BOOST baseline was invalid; warm later arms cannot measure cold title-idle doses. The latest cold-race row distinguishes menu work from race rig warming.

Section 2 ranks warm-up, variant compilation, skipped warms, entry floor, memory and instrumentation gaps; several statements are older than the appended run table and must be reconciled by date. Section 3 records historical harness operation, billing floor, device sharing, concurrency and player-menu versus API entry. The AWS Device Farm companion note and issue/PR numbers provide detailed provenance. Use as a measurement ledger and experimental-design warning, never as current spend authorization or current account balance. Device-local artifacts and fleet communications were not fetched.

### Driving-line research — 2026-09-08

Research producer is unnamed. The comparison table distinguishes Forza’s suggested line, EA F1’s dynamic ribbon and GT7’s dotted line and separate braking markers. EA detail adds conservative braking, 2D/3D behavior, accessible palettes, opacity and audio cues. Rendering sections explain a surface-following, depth-tested strip with no depth writes and HDR emissive bloom.

The implementation discussion ties mode names, baked racing line, speed sweep, chevrons, dynamic colours and TLX depth-bias correction together. Accessibility adds the IBM palette, coupled opacity/emission scaling and a click-rate brake cue driven by the same urgency as the visual line. The closing list explicitly leaves raised 3D, GT7 indicators, off-track white and stronger assist rungs unfinished. Backlinks and source references lead to parity and driving-control research. Use for design intent and cross-backend contracts; source observations and external product descriptions are dated evidence, not a fresh parity check.

### Electron packaging — 2026-09-29

Task 25 desktop-packaging producer unnamed. A compact fetched-reference list covers electron-builder documentation, NSIS app-data deletion, extraResources/asar, Playwright Electron and the Electron Range/net.fetch issue. It records builder 26.15.3 and runtime 44.4.5 as the then-pinned versions, plus PR #422’s spike. Use to explain the packaging choices and locate cited upstream sources; it supplies no fresh install or packaging validation.

### Engineering-practice notes — 2026-08

Unnamed research producer, written during Phase 5 verification. Sections 1–4 compare the accumulator loop, same-machine determinism, characterization-based decomposition and the no-build/ESM tradeoff with published practice. Preserve the distinction between seeded reproducibility and cross-machine lockstep, and between a characterization gate and proof of correctness. The proposed physics harness has an added note that a later characterization spec became the gate.

Part 3 checks the four-player star relay topology, TURN necessity, prefetching ICE credentials and service-worker version/reload protection. Part 4 examines silent persistence failure, cached settings masking failed writes, custom-logo quota pressure and proposed user-facing recovery. Its postscript records logging and exposed broken-store state as shipped, while success return values, a player-facing warning and logo migration remain open. Section 4b counts catches and logs and prioritizes user-visible failures while explicitly rejecting empty-catch count as a defect count. References include multiplayer, physics, architecture, platform-input research and upstream articles. Use for rationale and unresolved design questions; counts, platform assertions and shipped-status postscripts need current confirmation.

### F1 toolchain consolidation — 2026-10-26

Repair-session producer unnamed. Explains individually applied preservation material, reuse of the newer SDK fix, canonical environment/package sources and compatibility entrypoints. It separates local installation and protocol/doctor evidence from actual hosted tool exposure, draft environment saving from publication, and clean-source restoration from a restored provider instance. It records versions, regression categories, shader checks and explicit skips; browser smoke was not run. The environment contract is the primary navigation target. Use to understand repair provenance and the limits of readiness receipts. Historical process IDs, host catalog results and draft identifiers do not establish current readiness.

### Car fit audit — 2026-10-19

Tool-author producer unnamed, prompted by Bryce’s disconnected/intersecting parts report. Defines sections, welded pieces and attachment clusters, then GAP, PENETRATION, ZFIGHT and OPEN checks. Explains analytic tyre volumes, per-check thresholds, NEW/WORSE comparison, branch-only style comparison, stable row keys and noise margins. Fixtures show floating halo vanes, brake/tyre intersection and rear-floor penetration; the initial closed-mesh tyre test missed the last two. Blind spots cover coarse visibility rasters, crossing edges, open targets and a single baked pose. Use for interpreting audit reports and why baseline comparison matters, not as an exhaustive fit guarantee or a current failure baseline.

### Flaky quarantine #3505 — 2026-10-25

Producer Fleet B B·W1·L1, row 1 only. The verdict renews garage-livery-churn to November 10 rather than removing it. Three successive texture sources are distinguished: live-atlas recreation, decal preview, then unresolved dress/live atlas allocation. The texture-pool explanation is explicitly a hypothesis, not measured causation. The scan reports 107 matching jobs, one unavailable run, three failing jobs and 37 later first-try passes; it explains why those passes do not demonstrate a fix at the historical failure rate. Exit criteria require the real pool fix, a meaningful regression and cold first-try passes. Use for the evidence behind renewal and ownership boundary; it does not prove the defect still exists today.

### Flicker gate A/A2 — 2026-10-10

Investigation producer unnamed. Sections 1–5 separate any-pixel A/A2 differences from thresholded clustered fight pixels: one Madrid still changes below threshold while all nine sites pass. It enumerates pinned clocks, ranks warm-up and asynchronous-content hypotheses, describes discriminating measurements and argues against making stillExact blocking before calibration. Section 6’s same-day follow-up fails to reproduce the original difference, identifies swallowed soft-present timeouts as a real instrumentation weakness and records report-only/opt-in fixes: named inexact sites, missed-present counts, extra settle rounds and A3/mask capture. Use for metric semantics and uncertainty preservation; SwiftShader counts and two later exact runs do not explain the original event or validate player GPUs.

### Garage finishes and parts — 2026-10-17

Car-customization lane survey/proposal producer, explicitly awaiting Bryce’s product ruling. Section 1 inventories whole-car and zone finishes, surface-id remapping, paint designs, save compatibility and catalog-controlled visual parts. Section 2’s release-hosted sheet supports observations about shipped chrome, pearl, satin and matte. Sections 3–5 rank tinted chrome, zones, flake/candy, rims and calipers, then propose staged paint-only slices. Section 7 adds zone metals, cockpit grips, suspension and trim candidates; section 6 closes with caveats. Use for the rationale and cost model behind customization ideas. Proposed finishes were unrendered, phone cost was structural reasoning rather than measurement, and catalog counts are pinned to the stated source revision. The proposal is not evidence those features shipped.

### GL object leak — 2026-10-17

Census producer unnamed; issue #2651 and Metal leg PR #2637 distinguish backend scope. The assigned opening compares three’s forced WebGL2 fallback before/after vendor patch 15 across repeated circuit visits. Programs and shaders become flat; VAOs improve from substantial growth to a small residual. Buffers/textures and negative buffer counts are explicitly separate, uninvestigated observations. Use as count-based leak evidence, not timing or WebGPU/Metal memory evidence. The assigned part ends mid-sentence; its unassigned remainder is not summarized here.

## Hash ledger

Whole and assigned-part hashes below complement the exact chunk hashes in the linked inventory. A whole-file hash identifies the source version even where only a tail or opening is assigned.

- [DEVICE-FARM-ANALYSIS-2026-10-24.md](../notes/DEVICE-FARM-ANALYSIS-2026-10-24.md) — assigned bytes 29538–30467; whole SHA-256 `ab268da8b8f7558399569220e3daed0e1cdee63615e45892ebb8a929376c6f11`; part SHA-256 `7b2ead28f8daa4adefa77d3557841993d86914cae7c95c604147821405762b45`.
- [DEVICE-FARM-LEDGER-2026-10-23.md](../notes/DEVICE-FARM-LEDGER-2026-10-23.md) — assigned bytes 0–24790; whole SHA-256 `29b89f518ed6e8b7fd059f4b9d604db01a3345ae626607fb2b55e3cea36fcb2f`; part SHA-256 `29b89f518ed6e8b7fd059f4b9d604db01a3345ae626607fb2b55e3cea36fcb2f`.
- [DRIVING-LINE-RESEARCH.md](../notes/DRIVING-LINE-RESEARCH.md) — assigned bytes 0–10276; whole SHA-256 `3bd681372ae938b9908dbb16482e8e4fb0adc4df96fab30b0b30e80df5b1462a`; part SHA-256 `3bd681372ae938b9908dbb16482e8e4fb0adc4df96fab30b0b30e80df5b1462a`.
- [ELECTRON-BUILDER-26.md](../notes/ELECTRON-BUILDER-26.md) — assigned bytes 0–986; whole SHA-256 `644b1c00b3ac18cec18f38d7a4cc423db3658ba7442973b23432e715fb1d7b63`; part SHA-256 `644b1c00b3ac18cec18f38d7a4cc423db3658ba7442973b23432e715fb1d7b63`.
- [ENGINEERING-PRACTICE-NOTES.md](../notes/ENGINEERING-PRACTICE-NOTES.md) — assigned bytes 0–19914; whole SHA-256 `9eb24dccbf5e03b2dbeaf6fc781e9bc400e763bed9f3834c66198848367e1ebf`; part SHA-256 `9eb24dccbf5e03b2dbeaf6fc781e9bc400e763bed9f3834c66198848367e1ebf`.
- [F1-TOOLCHAIN-CONSOLIDATION-2026-10-26.md](../notes/F1-TOOLCHAIN-CONSOLIDATION-2026-10-26.md) — assigned bytes 0–4921; whole SHA-256 `938aa48fe69ca5927605399bcea94a2c3e3b8b9bf1f721d34586e13c56893421`; part SHA-256 `938aa48fe69ca5927605399bcea94a2c3e3b8b9bf1f721d34586e13c56893421`.
- [FIT-AUDIT.md](../notes/FIT-AUDIT.md) — assigned bytes 0–5654; whole SHA-256 `699cd98234904107c5083e7c4fa1adcb7ce337fa2e5f88228db5f46f8f667aa1`; part SHA-256 `699cd98234904107c5083e7c4fa1adcb7ce337fa2e5f88228db5f46f8f667aa1`.
- [FLAKY-QUARANTINE-3505-2026-10-25.md](../notes/FLAKY-QUARANTINE-3505-2026-10-25.md) — assigned bytes 0–4431; whole SHA-256 `33ab2a4e8890b362ee1454ba50c440004a586db8c9ce6ce8538c73b67d1d93e1`; part SHA-256 `33ab2a4e8890b362ee1454ba50c440004a586db8c9ce6ce8538c73b67d1d93e1`.
- [FLICKER-GATE-A2-2026-10-10.md](../notes/FLICKER-GATE-A2-2026-10-10.md) — assigned bytes 0–12734; whole SHA-256 `e8594729e71f6246339d1beef07e28bcd75961b3b9797b2d8558fd76a0052954`; part SHA-256 `e8594729e71f6246339d1beef07e28bcd75961b3b9797b2d8558fd76a0052954`.
- [GARAGE-FINISHES-PARTS-2026-10-17.md](../notes/GARAGE-FINISHES-PARTS-2026-10-17.md) — assigned bytes 0–14023; whole SHA-256 `a4af07d0022bc02c946df5b22eed1d9f390148404f2461eb7d728a7f14c185ab`; part SHA-256 `a4af07d0022bc02c946df5b22eed1d9f390148404f2461eb7d728a7f14c185ab`.
- [GL-OBJECT-LEAK-2026-10-17.md](../notes/GL-OBJECT-LEAK-2026-10-17.md) — assigned bytes 0–1342; whole SHA-256 `6346e0b5bb356e920301589e07fd74a13d7e400044650904934d6ad556e97719`; part SHA-256 `1ca88aa38424598f389499db15a91b906de8a99de8be1b353ef2bf2750eacbf1`.
