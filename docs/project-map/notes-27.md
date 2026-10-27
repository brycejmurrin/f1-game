# Notes batch 27 — phone performance and physics provenance

Fully read all assigned 100,000 bytes in individually returned, untruncated source reads of at most 9,500 bytes. Ranges below are half-open byte ranges. Current AGENTS.md was read. Historical notes provide provenance, never command authority. No historical commands, runtime, network, browser, tests, source edits or commits were performed.

## Topics, dates, producers, backlinks and use

### [Ranked performance research (remaining part)](../notes/PERF-RESEARCH-2026-10-17.md)

Date: 2026-10-17. Producer: Docs research lane and public-web readers (opening context indexed in batch 26).

Continues disposal/VAO lifetime analysis, thermal render-rate tiers, tail-job scheduling, GLX/TLX/WebGPU phone comparison, fixed-target dynamic resolution, render-object diet and index-only LOD. Later passes correct compatibility assumptions and rank rejected approaches; three r187 migration and JSC/Apple bandwidth guidance remain dated research.

Use: Locate hypotheses, primary-source citations and phone measurement design before selecting a performance experiment. Backlink/context: [MEASURING-GPU-PERF-2026-09-16.md](../notes/MEASURING-GPU-PERF-2026-09-16.md).

Limits: The assigned tail starts mid-disposal discussion. Upstream release facts and phone defaults are historical; survey prevalence is not a device probe. SwiftShader CPU counts and Mac GPU results establish no iPhone frame-time gain..

### [Scene and physics CPU](../notes/PERF-SCENE-CPU-2026-10-20.md)

Date: 2026-10-20. Producer: Fleet B·H9, scene-cpu lane.

Separates real Chromium per-step physics (~0.33–0.43 ms median) from VM lookup overhead and SwiftShader five-step catch-up spans. Indexed loops reduce iterator allocations from 3.24 to 0.54 KB/step with equal field digests; timing stays within noise. Flags flyby OSR deopts.

Use: Find the per-step profiling rationale and allocation identity evidence. Backlink/context: PERF-CPU-LOAD-2026-10-19.md (unresolved historical reference).

Limits: No CPU speedup claimed; software render-path profiles are insufficiently warm and no phone/GPU result follows..

### [Performance regression gates](../notes/PERFTEST-HUNT-2026-10-24.md)

Date: 2026-10-24. Producer: A·H17, PR #3697; BOOST handoff to A·W45.

Maps coverage gaps, VM handle/listener/timer cycle counts and measured allocation baseline. BOOST control windows expose repeat pipeline compilation (#3703); strict gate is handed to the fix lane. Corrects invalid offline emulation into a precache snapshot check.

Use: Trace why count-based regression gates and their positive controls were proposed. Backlink/context: [PERF-ALLOC-HUNT-2026-10-17.md](../notes/PERF-ALLOC-HUNT-2026-10-17.md).

Limits: Historical pass/red states are not current status. VM covers game-side contracts, not three caches; browser plateau/nightly and garage/WebAudio gaps remain follow-ups..

### [Phone GPU test record](../notes/PHONE-GPU-TEST-2026-10-21.md)

Date: 2026-10-21. Producer: B·H10.

Explains six-phase phone test output: resolution-squared fill slope, mirror delta, thermal drift, pipeline/link counts, display cadence and absent GPU timers.

Use: Interpret an owner-produced phone-soak record and identify measurement confounders. Backlink/context: [TLX-GPU-COST-PARAVIRTUAL-2026-10-20.md](../notes/TLX-GPU-COST-PARAVIRTUAL-2026-10-20.md).

Limits: A procedure and schema guide, not a captured phone result; heat and display quantisation can obscure deltas. Historical backend labels require current confirmation..

### [Phone renderer comparison](../notes/PHONE-RENDERER-AB-2026-10-21.md)

Date: 2026-10-21. Producer: B·H23; Bryce decision relayed by OrchB 26; correction B·H26 #3439.

Records owner decision to keep TLX default despite earlier GLX recommendation. Compares stills, post-GC heap/backing stores and Mac phone-cap entry costs. Corrects missing TLX sky as software-only fallback, not a phone gap.

Use: Recover decision provenance and distinguish software sky artifacts from phone behavior. Backlink/context: [PHONE-GPU-TEST-2026-10-21.md](../notes/PHONE-GPU-TEST-2026-10-21.md).

Limits: Mac GPU is paravirtual and SwiftShader timings unusable. Memory gaps are historical harness deltas; this is not a current iPhone performance measurement..

### [Physics and track port oracle](../notes/PHYSICS-ORACLE-2026-10-18.md)

Date: 2026-10-18. Producer: Oracle tooling author unnamed; apex-26 PR #1 tasks T1.3/T1.4.

Describes raw per-step golden traces and track-query grids, exact round-trip doubles/special-value strings, pinned assists/weather/seat/field/scenery, ghost-command replay and file-hash headers.

Use: Understand provenance and compatibility requirements for comparing a TypeScript port against an oracle. Backlink/context: [../PHYSICS.md](../notes/../PHYSICS.md).

Limits: Retired-field traces differ from full-field characterization; ghost commands do not reproduce original lap pose. Header revision and source hashes must match; dated deterministic runs are not rerun here..

### [Tier-two player physics plan (opening part)](../notes/PLAYER-PHYSICS-PLAN-TIER2-2026-09.md)

Date: 2026-09-16. Producer: Second research round with four read-only passes; individual authors unnamed.

Diagnoses nonmonotonic utilisation, unreachable lock-up and false power-on-oversteer claims from live-field benches. Ranks extraction, keyboard bench, audio, aero braking, load sensitivity, assists and shared longitudinal/AI calibration. Designs grip steer, tyre voice, camera/HUD/coach signals and starts per-axle slip-ratio/ABS/TC implementation plan.

Use: Recover proposed laws, measurement targets and owner decisions before interpreting later implementation work. Backlink/context: [PLAYER-PHYSICS-RESEARCH-2026-09.md](../notes/PLAYER-PHYSICS-RESEARCH-2026-09.md).

Limits: Explicit proposal, not implementation evidence, except the stated tier-one utilisation follow-up. Assigned part ends mid ABS/TC settings paragraph; remaining plan belongs to batch 28. Physics/records/preset decisions are historical open questions, not authorization..

## Coverage and SHA-256

Whole-file hashes identify source identity, not a claim to have read unassigned bytes. Part and chunk hashes cover only assigned bytes.

### docs/notes/PERF-RESEARCH-2026-10-17.md

Whole file: 76714 bytes; SHA-256 `d97ed87c35cfe7910a79d6dafc2d3d1819915524558457e988a58d6600a58fe3`.
Assigned part [22661, 76714): SHA-256 `f566fb8fe64f28255aa1d83daa33b20e588b37f221cee2ef109e06651ca8002b`.

| Read chunk | SHA-256 |
|---|---|
| [22661, 31661) | `b734c0c384902db6578515fd85245629d57f099275ccf2a3a78f3b503fb6eaa0` |
| [31661, 40661) | `e2a46130a3ffc5b45f14b3ec04a870d041e6082f90ae4069fee060ee47886fa0` |
| [40661, 49661) | `e7f7b7aa806352ffa917bb977db4223daaa38223a3ba4b017b62e8d6bc853181` |
| [49661, 58661) | `3309c034704847e4352a2d49d184dc279b7a2ede3efe11b339a1da7510146e27` |
| [58661, 67661) | `44521f4dfae52f88df8c8dd0698e13b4558cbf43f73ca784fc753dbc5a020fd6` |
| [67661, 76714) | `fc9397c65e0cdb47bdef49edbcc05e411b1ae3f0d94c30d63badfcaf3c2d6895` |

### docs/notes/PERF-SCENE-CPU-2026-10-20.md

Whole file: 3724 bytes; SHA-256 `ef5810a60091559e83df0e289d124c680b03f5a6a4daaca092252000616f0ced`.
Assigned part [0, 3724): SHA-256 `ef5810a60091559e83df0e289d124c680b03f5a6a4daaca092252000616f0ced`.

| Read chunk | SHA-256 |
|---|---|
| [0, 3724) | `ef5810a60091559e83df0e289d124c680b03f5a6a4daaca092252000616f0ced` |

### docs/notes/PERFTEST-HUNT-2026-10-24.md

Whole file: 7366 bytes; SHA-256 `c6d793be5d179e128e9e682c566ebb267d40f1af0b6dd09a7cccf7d8f7c381b3`.
Assigned part [0, 7366): SHA-256 `c6d793be5d179e128e9e682c566ebb267d40f1af0b6dd09a7cccf7d8f7c381b3`.

| Read chunk | SHA-256 |
|---|---|
| [0, 7366) | `c6d793be5d179e128e9e682c566ebb267d40f1af0b6dd09a7cccf7d8f7c381b3` |

### docs/notes/PHONE-GPU-TEST-2026-10-21.md

Whole file: 3315 bytes; SHA-256 `1194cacbd0bf26dcd118d7eb8d0a5c1939a7520bd599c83b9cd492e1100c2072`.
Assigned part [0, 3315): SHA-256 `1194cacbd0bf26dcd118d7eb8d0a5c1939a7520bd599c83b9cd492e1100c2072`.

| Read chunk | SHA-256 |
|---|---|
| [0, 3315) | `1194cacbd0bf26dcd118d7eb8d0a5c1939a7520bd599c83b9cd492e1100c2072` |

### docs/notes/PHONE-RENDERER-AB-2026-10-21.md

Whole file: 9122 bytes; SHA-256 `9e614c727bbd83778647b97fda0779b76b5474bd5b8811cf6795f23a57fc872b`.
Assigned part [0, 9122): SHA-256 `9e614c727bbd83778647b97fda0779b76b5474bd5b8811cf6795f23a57fc872b`.

| Read chunk | SHA-256 |
|---|---|
| [0, 9122) | `9e614c727bbd83778647b97fda0779b76b5474bd5b8811cf6795f23a57fc872b` |

### docs/notes/PHYSICS-ORACLE-2026-10-18.md

Whole file: 3876 bytes; SHA-256 `b34fa26bdb5730a5bb5095f300e4fae3329743fd69d27c7fff3b07b28150d0cf`.
Assigned part [0, 3876): SHA-256 `b34fa26bdb5730a5bb5095f300e4fae3329743fd69d27c7fff3b07b28150d0cf`.

| Read chunk | SHA-256 |
|---|---|
| [0, 3876) | `b34fa26bdb5730a5bb5095f300e4fae3329743fd69d27c7fff3b07b28150d0cf` |

### docs/notes/PLAYER-PHYSICS-PLAN-TIER2-2026-09.md

Whole file: 25809 bytes; SHA-256 `ec1b225b7af0ff85adae249a07871bcd1e0446216cb8eee8e6bbb15fa9f4dac3`.
Assigned part [0, 18544): SHA-256 `3a23d27208d93a59f2fa078d93e4a42dbe4877b70d063912cb495b893621be83`.

| Read chunk | SHA-256 |
|---|---|
| [0, 9500) | `ea458826f9d2e3ac9e280ecb4f3844259986f54aaf9b2ef2d5e2007c0915e479` |
| [9500, 18544) | `1ce67eb88820f10aed5587c30bb00d687e82abb983534fe793cff01e251d644b` |

## Historical path handling

Raw scratch, archive, artifact, branch and versioned vendor references are recorded separately in [notes-27-paths.json](notes-27-paths.json). They identify historical evidence and do not establish supported current entrypoints. No linked evidence was independently reproduced.
