# Notes group 28 — physics, process, product and performance provenance

Read-only historical-source map. Current AGENTS.md was read; historical commands were treated as quotations, not executed. No runtime, browser, network or tests were run. Byte ranges below are half-open UTF-8 source bytes. Every assigned byte was returned in an individual source read of at most 9,000 bytes without truncation. Dates and producers are source claims; implementation and test claims are historical, not independently revalidated.

## Source and chunk ledger

### PLAYER-PHYSICS-PLAN-TIER2-2026-09.md

Source: [PLAYER-PHYSICS-PLAN-TIER2-2026-09.md](../notes/PLAYER-PHYSICS-PLAN-TIER2-2026-09.md); date: 2026-09-16. Producer: Four read-only research passes; author unnamed.

Topics by section: Assigned tail of §5: axle slip constants, shared deceleration and power law, scrub, regression pins, extraction budget, ordered gates, digital-pedal defaults; §6 source catalogue.

Current use and limits: Design provenance for wheel-slip/ABS/TC and shared AI longitudinal behavior. This is explicitly an unbuilt plan, and earlier sections belong to group 27. Its staged gates and numbers are proposals, not current verification.

Whole source: 25809 bytes; SHA-256 `ec1b225b7af0ff85adae249a07871bcd1e0446216cb8eee8e6bbb15fa9f4dac3`. Manifest whole-source hash matches: true.
Assigned part: [18544, 25809) (7265 bytes); SHA-256 `f010666b8262eb56bd68e4dda660a52fe47e61d699d13e2956b27be3fcab5717`.

Read chunks:
- [18544, 25809): `f010666b8262eb56bd68e4dda660a52fe47e61d699d13e2956b27be3fcab5717`

Backlinks (current text mentions, not a promise of authority): `docs/notes/PRODUCT-BRAINSTORM-2026-09-16.md`; `docs/plans/2026-09-30-player-a11y.md`.

### PLAYER-PHYSICS-RESEARCH-2026-09.md

Source: [PLAYER-PHYSICS-RESEARCH-2026-09.md](../notes/PLAYER-PHYSICS-RESEARCH-2026-09.md); date: 2026-09-16. Producer: Four parallel code/web passes; author unnamed.

Topics by section: §1 findings and tier decisions; §2 original bicycle/grip/input model; §3 deterministic player bench; §4 tyre/controls/feedback literature; §5 built tier 1 and future tiers; §6 corrected parked-field before/after results and separate rear tyre curve; §7 sources.

Current use and limits: Explains why peak/fall tyre curves and rear-only drive charge were chosen. Initial power-oversteer evidence is explicitly withdrawn because passing AI contaminated the bench. Tier 2/3 proposals and historical constants need current-source confirmation.

Whole source: 17705 bytes; SHA-256 `8feb0848017095e35845af7e4fe6ffa7e8312f2fffe85650958ad096d607d0aa`. Manifest whole-source hash matches: true.
Assigned part: [0, 17705) (17705 bytes); SHA-256 `8feb0848017095e35845af7e4fe6ffa7e8312f2fffe85650958ad096d607d0aa`.

Read chunks:
- [0, 9000): `80caac9c98197a1bffb8d0354d4591d53530bb413119fff1266af2b93f4ea783`
- [9000, 17705): `25db93ad1df55572d98039ae7442a79bff9071c2d77641be4ef14b4a8c18e839`

Backlinks (current text mentions, not a promise of authority): `docs/PHYSICS.md`; `docs/notes/PLAYER-PHYSICS-PLAN-TIER2-2026-09.md`; `docs/notes/PRODUCT-BRAINSTORM-2026-09-16.md`.

### PREPUSH-GATE-LADDER.md

Source: [PREPUSH-GATE-LADDER.md](../notes/PREPUSH-GATE-LADDER.md); date: 2026-09-18; updates 2026-09-30 and 2026-10-24. Producer: Incident retrospective; A·H16 build-hunt B4 / PR #3694 cited for later concurrency policy.

Topics by section: The shape; three incidents; implemented gate-only and coverage guard; figures removed from tree; open conditional-sweeps edge.

Current use and limits: Backs AGENTS rule 3: a lower gate pass does not establish a higher gate pass. Use current AGENTS and generated ladder measurement for action; timings and the conditional-job sample are dated observations.

Whole source: 5314 bytes; SHA-256 `5d01a427096d66cd2f698001c043467cd86380bf9aac9ed4da849e649ca9a6dc`. Manifest whole-source hash matches: true.
Assigned part: [0, 5314) (5314 bytes); SHA-256 `5d01a427096d66cd2f698001c043467cd86380bf9aac9ed4da849e649ca9a6dc`.

Read chunks:
- [0, 5314): `5d01a427096d66cd2f698001c043467cd86380bf9aac9ed4da849e649ca9a6dc`

Backlinks (current text mentions, not a promise of authority): `docs/NOTES-INDEX.md`; `docs/VERIFICATION.md`; `docs/notes/BUILD-HUNT-2026-10-24.md`; `docs/notes/CICD-REVIEW-2026-10-16.md`; `docs/notes/DEFECT-LEDGER.md`; `docs/notes/MERGE-HYGIENE-2026-09-29.md`; `docs/plans/2026-09-30-agent-skills-and-tools.md`; archived provenance entry; archived provenance entry; `docs/notes/system-audit-4/skills/steward.md`.

### PROCESS-SPEEDUP-2026-09.md

Source: [PROCESS-SPEEDUP-2026-09.md](../notes/PROCESS-SPEEDUP-2026-09.md); date: 2026-09-01; follow-up 2026-09-08. Producer: One measured session, unnamed; subsequent landed annotations.

Topics by section: §0 cost baseline; §1 boot budgets, VM twins, disjoint groups, source pins and runner selection; §2 generated docs/archiving; §3 MCP/skill/agent consolidation and credential incident; §4 derived builds/deploy/live checks; §5 ranked rollout; conflict-tax addendum on union merges and ratchet budget.

Current use and limits: Historical explanation for game VM, generated documentation and deploy structure. Many proposals and counts are superseded; landed-but-unverified annotations are not CI evidence. Credential incident is recorded without reproducing credentials; owner remediation status is not established here.

Whole source: 20117 bytes; SHA-256 `1953571045a286f4fd6a5566ada4303b87936eb3710ca218da3c1b7dc4b4c2ad`. Manifest whole-source hash matches: true.
Assigned part: [0, 20117) (20117 bytes); SHA-256 `1953571045a286f4fd6a5566ada4303b87936eb3710ca218da3c1b7dc4b4c2ad`.

Read chunks:
- [0, 9000): `34e5a81926f7d14049601695dd738d6c38de427244307b1c88abc15158b1f3aa`
- [9000, 18000): `abcfb3d41bedb803a03debc56198a8b53b12785f650c3cbc15c532c3f1d8da06`
- [18000, 20117): `c4b554f14d3f4df95a269c534424c3680d6b48b235da5b6ffd95b1971ef3869c`

Backlinks (current text mentions, not a promise of authority): `docs/NOTES-INDEX.md`; `docs/TESTING.md`; `docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md`; archived provenance entry; archived provenance entry; `docs/plans/research-2026-09-16/measurement.md`.

### PRODUCT-BRAINSTORM-2026-09-16.md

Source: [PRODUCT-BRAINSTORM-2026-09-16.md](../notes/PRODUCT-BRAINSTORM-2026-09-16.md); date: 2026-09-16. Producer: Source inventory, real Chromium menu walkthrough and web research; author unnamed.

Topics by section: §1 seven observations with three withdrawn claims; §2 settings export and screen coverage; §3 static-site product patterns; §4 ranked backlog; §5 owner questions; §6 three fixes.

Current use and limits: Useful product decision provenance: settings round-trip, phone cockpit speed and stale Data Hub cache fixes, plus daily challenge/share-code ideas. The note explicitly says remaining ideas were not built then. Screenshot and agent-entry mistakes are retained as cautionary evidence.

Whole source: 10411 bytes; SHA-256 `6e3bf7c9f5df4eda5e9e1f7a8eae46c532c477504f1d6a125cfde50d571cce89`. Manifest whole-source hash matches: true.
Assigned part: [0, 10411) (10411 bytes); SHA-256 `6e3bf7c9f5df4eda5e9e1f7a8eae46c532c477504f1d6a125cfde50d571cce89`.

Read chunks:
- [0, 9000): `5c7dbd35aaad7fd34a6c5b90b825d2d22c545157fd4d31b1632b5675854771fa`
- [9000, 10411): `241152bb873c0df7f9cf38808234e86b7016645ae9a44e9fbff3a426b0f1f4f7`

Backlinks (current text mentions, not a promise of authority): `docs/notes/CAREER-BRAINSTORM-2026-09-21.md`; `docs/plans/2026-09-30-player-a11y.md`; `docs/plans/2026-10-04-colourblind-captions.md`; `docs/plans/2026-10-04-share-cards.md`.

### PROFILER-DESIGN-2026-10-16.md

Source: [PROFILER-DESIGN-2026-10-16.md](../notes/PROFILER-DESIGN-2026-10-16.md); date: 2026-10-16. Producer: Profiler implementation session; Bryce authorization and concurrent three-inspector session cited.

Topics by section: Existing tools; built PerfSpans and profile CLI; software-render caveats; per-pass GPU research; shipped MCP doors; measured container runs and minimum-repeat correction; Inspector overlap.

Current use and limits: Map for spans, profile comparison and saved-profile query surfaces. Main-thread spans can support CPU diagnosis; software-raster render duration and rAF cadence cannot prove player GPU cost. Per-pass GPU work is explicitly unfinished; early two-repeat WIN verdict was corrected to require three repeats.

Whole source: 6779 bytes; SHA-256 `c04309b38f8c79414ad386b6328169e44863a72fe2440fd3cbc91d119560489a`. Manifest whole-source hash matches: true.
Assigned part: [0, 6779) (6779 bytes); SHA-256 `c04309b38f8c79414ad386b6328169e44863a72fe2440fd3cbc91d119560489a`.

Read chunks:
- [0, 6779): `c04309b38f8c79414ad386b6328169e44863a72fe2440fd3cbc91d119560489a`

Backlinks (current text mentions, not a promise of authority): `docs/DEBUG-HOOKS.md`; `docs/notes/PERF-RESEARCH-2026-10-17.md`; `docs/surveys/w24b-tools.md`.

### RACE-ENTRY-TOOLING-RESEARCH-2026-10-21.md

Source: [RACE-ENTRY-TOOLING-RESEARCH-2026-10-21.md](../notes/RACE-ENTRY-TOOLING-RESEARCH-2026-10-21.md); date: 2026-10-21. Producer: B·H14 research for OrchB 24; prior-art-scout/code-hunter and B·H8 verifier contributions; PR #3385.

Topics by section: §1 yielding APIs and I1–I3; §2 CDP profiles and I4–I6; §3 timing-window statistics and I7–I10; §4 F1–F10 hunter rows; source URLs.

Current use and limits: Research map for race-entry pacing, CPU profile capture and timing-step alerts. Productised timer/summary are distinguished from proposed diff/gates; hunter rows are code-traced hypotheses, F1 common-path claim refuted, F10 closed. Ten-sample statistical thresholds lack proven false-positive rates.

Whole source: 13334 bytes; SHA-256 `1af2404c89bc9772789c7b6f12f8c5d041f497d70a85512611fe12f707d5fb68`. Manifest whole-source hash matches: true.
Assigned part: [0, 13334) (13334 bytes); SHA-256 `1af2404c89bc9772789c7b6f12f8c5d041f497d70a85512611fe12f707d5fb68`.

Read chunks:
- [0, 9000): `5360443526bbd6441551e9f90437956ff0e4d74aa9ccc5133f5c897256ef6a4d`
- [9000, 13334): `9b3796a197f574d1b953db1ffc7db954461ad9e99ebd25087c787ded0971f38e`

Backlinks (current text mentions, not a promise of authority): `docs/NOTES-INDEX.md`.

### RACING-LINE-RESEARCH.md

Source: [RACING-LINE-RESEARCH.md](../notes/RACING-LINE-RESEARCH.md); date: 2026-09-08. Producer: Assessment and same-evening implementation session, unnamed; owner follow-up on AI jitter.

Topics by section: §1 geometric knot bake and consumers; §2 circuit audit; §3 racing-line literature; §4 alternatives; §5 recommendation; §6 actual relaxation/path-length implementation, rejected weighted pass, corrected curvature metric and tests; §7 AI heading controller begins.

Current use and limits: Explains deterministic bake relaxation and AI heading/brake-sampling changes. Actual implementation kept synthetic pathK and its floor despite initial recommendation. Per-corner tighter counts are smoke alarms, not proofs; street layouts can lose modeled time. Assigned range ends mid-§7 sentence; continuation is outside group 28.

Whole source: 46770 bytes; SHA-256 `348bf23c3b7ece324135c5566fe111547f95c8e816210bd8d14aa1919f6cf371`. Manifest whole-source hash matches: true.
Assigned part: [0, 19075) (19075 bytes); SHA-256 `d933f57cf58c4b5656a7cd1333511f895363e02bbd6e7ab00821a61c5c7e89b6`.

Read chunks:
- [0, 9000): `8b0247765d68ae12850df067f28fa0e8988a5b5de4e2e1251c80bf161e43ddf3`
- [9000, 18000): `743b6f63367503cbf2e950c9e0bc242d4734ec4f36030acae595daa13d460e01`
- [18000, 19075): `e31e072e6ac56087c6bcce043ee87e6c07091efe6e3cd6eb3bfcd10e54b1c067`

Backlinks (current text mentions, not a promise of authority): `docs/PHYSICS.md`; `docs/notes/CEILING-HISTORY.md`; `docs/notes/TUMFTM-RACETRACK-DATABASE.md`.

## Path provenance

Raw path-like references, including scratch evidence, outdated names and command-shaped quotations, are preserved separately in [notes-28-paths.json](notes-28-paths.json). Existence is a literal local-path check only: missing paths may be historical, generated, shorthand or command text. They are not instructions and are not automatically classified as deleted. Archive-policy discussion in the process note is historical; no archive relocation was performed.

Historical incoming path strings are retained in [notes-28-backlinks.json](notes-28-backlinks.json).
