# Notes group 30 — rulebook, scenery, capture and knowledge provenance

Historical-source map. Current AGENTS.md was read. Assigned source bytes were returned individually in chunks of at most 8,000 bytes without output truncation; UTF-8 boundary failures were reread with corrected boundaries. Commands in notes were treated as historical text. No runtime, network, browser, tests, source edits or commits were performed. Ranges are half-open byte offsets.

## Source and chunk ledger

### RULEBOOK-EVIDENCE-2026-10-26.md

Source: [RULEBOOK-EVIDENCE-2026-10-26.md](../notes/RULEBOOK-EVIDENCE-2026-10-26.md). Date / producer: 2026-10-26; author unnamed in assigned tail.

Topics: Rulebook evidence recommendation tail: smaller always-loaded map, hooks/tests, progressive disclosure, contradiction checks and compaction.

Use and limits: Evidence for the reasoning behind rulebook reduction. Numeric targets are explicitly judgment, not measured thresholds; preceding evidence belongs to group 29.

Whole source: 5502 bytes; SHA-256 `0448b51fa5ef4ad3d34f5777e2036aee369ef1d32558d232bec2eee4e6c1af78`. Manifest whole-source match: true.
Assigned part: [4110, 5502) (1392 bytes); SHA-256 `efb7bb5a6db9f9fe7d50b621fec61bb13cd80b8ad725f6e31d5a55e8f79faadd`.

Read chunks:
- [4110, 5502): `efb7bb5a6db9f9fe7d50b621fec61bb13cd80b8ad725f6e31d5a55e8f79faadd`

Backlinks (literal current mentions, not authority): `docs/NOTES-INDEX.md`.

### RULEBOOK-REWRITE-2026-10-26.md

Source: [RULEBOOK-REWRITE-2026-10-26.md](../notes/RULEBOOK-REWRITE-2026-10-26.md). Date / producer: 2026-10-26; system-audit lane S4a, PR #3785, Bryce grant quoted.

Topics: Why shorter/single sourced; rule-home table; contradictions resolved; removed rules and retired memory.

Use and limits: Explains the historical consolidation and supersedence decisions. Fleet orchestrators, MERGE-HOLD and timer procedures are historical and conflict with later current AGENTS coordination; do not execute them.

Whole source: 6559 bytes; SHA-256 `6c10852b6a39a27a8d5b052f4f8fdb0aa5da83a659330c499465fed0a2d149e1`. Manifest whole-source match: true.
Assigned part: [0, 6559) (6559 bytes); SHA-256 `6c10852b6a39a27a8d5b052f4f8fdb0aa5da83a659330c499465fed0a2d149e1`.

Read chunks:
- [0, 6559): `6c10852b6a39a27a8d5b052f4f8fdb0aa5da83a659330c499465fed0a2d149e1`

Backlinks (literal current mentions, not authority): `AGENTS.md`; `docs/TESTING-COVERAGE.md`; `docs/NOTES-INDEX.md`; `.claude/rules/claude-config.md`; `.claude/memory/rules-are-agent-written-drafts.md`; `docs/notes/APEX-STEWARD-CARD-2026-10-05.md`; `docs/notes/CONCURRENT-PRS-CI-HYGIENE-2026-09-30.md`.

### SCENERY-QA-PLAN.md

Source: [SCENERY-QA-PLAN.md](../notes/SCENERY-QA-PLAN.md). Date / producer: 2026-09-24 draft and same-day updates; four read-only investigations, authors unnamed.

Topics: Player reports; baseline blind spots; A overhead soffits, B triangle z-fighting, C asset-pack/overhang correction, D circuit moves, E rendered gate; R road ribbons, T terrain separation, G guards, P hidden faces/detail LOD; shipped batch, campaign order, verification and open questions.

Use and limits: Rich geometry/render diagnosis provenance with proposed versus done annotations. Critical negative result: the luma flicker positive control failed on black software-rendered undersides and CI job was removed. Counts, baseline claims and browser passes are dated; P4 is design, not implementation.

Whole source: 32372 bytes; SHA-256 `7d4c2ea408d3da594f92186f4a5fee9debb3faa34f0b873202a8af9c18f65f80`. Manifest whole-source match: true.
Assigned part: [0, 32372) (32372 bytes); SHA-256 `7d4c2ea408d3da594f92186f4a5fee9debb3faa34f0b873202a8af9c18f65f80`.

Read chunks:
- [0, 8000): `1c7d3deb4c3e363646809b332168f15bf086b5ea3c31fbc0908e993fc5e8b93b`
- [8000, 16000): `7f2ba279e710c65d497b16af2e2ff9e60dee800ca9eed1bac5d610a56f59fbaf`
- [16000, 24000): `1aa7a2fa6c3bf003d93569b2012af8301e496a161fd52ac33213fe1e31e0bcb9`
- [24000, 32000): `c3ae2a90af01dad53ebefe84a00ee3ed64bf0f21217aaa50ee21a9dc68accea0`
- [32000, 32372): `40a77aa6066a525002fe00c430f4637029596efc71a9737561b0cc59dfb75b22`

Backlinks (literal current mentions, not authority): `docs/notes/DEFECT-LEDGER.md`.

### SCREENSHOT-TOOL-SPEED-2026-10-10.md

Source: [SCREENSHOT-TOOL-SPEED-2026-10-10.md](../notes/SCREENSHOT-TOOL-SPEED-2026-10-10.md). Date / producer: 2026-10-10 title; controlled measurements 2026-10-14 and later undated additions; implementation/research session unnamed.

Topics: Existing capture knobs; worker defaults; Docker tradeoff; PNG encoding/concurrency; profiles, GPU/browser ownership, immutable assets, traces, benchmarks, presentation generations and atomic markers; cheatsheet and sources.

Use and limits: Explains capture architecture and narrow A/B measurements. Fast PNG is encoding-only; atomic generation sample is warm presentation-only. Two-sample browser comparison is inconclusive; unavailable hardware/Mesa requests do not establish throughput.

Whole source: 14335 bytes; SHA-256 `df781fc90f62747226b0d410bfee4b0eac3f4ebe417faaf4449b1879892fb360`. Manifest whole-source match: true.
Assigned part: [0, 14335) (14335 bytes); SHA-256 `df781fc90f62747226b0d410bfee4b0eac3f4ebe417faaf4449b1879892fb360`.

Read chunks:
- [0, 8000): `50f9ee79d8a887b127f61aeb06896747c0279e3d6c71ec06b100a3fc19aef2ba`
- [8000, 14335): `90dd43d4f5acb575541a702a740703597f90a12f4d4bc4cc76109703197ee055`

Backlinks (literal current mentions, not authority): `.claude/skills/playwright-probe/SKILL.md`; archived provenance entry (see the paths JSON); `docs/notes/CI-RENDERING-PERFORMANCE.md`.

### SECOND-BRAIN-2026-10-14.md

Source: [SECOND-BRAIN-2026-10-14.md](../notes/SECOND-BRAIN-2026-10-14.md). Date / producer: 2026-10-14; three parallel web research passes plus AGENT-MEMORY, author unnamed; PR #1519 companion.

Topics: Knowledge versus work tracking; Obsidian viewer; memory-service comparison; stale context/poisoning; three guards, viewer setup and conditional trial.

Use and limits: Design rationale for git-reviewed knowledge, citation checks, hidden Unicode and supersede pairs. Shipped Step 1 is a historical claim; vendor pricing/access and research conclusions are dated, several secondary citations explicitly qualified. No new memory service is authorized by this map.

Whole source: 21761 bytes; SHA-256 `9094a17940690e1c76d415cb9f2050d772d4a45703c5bcd317bff0bcd4e9bbc8`. Manifest whole-source match: true.
Assigned part: [0, 21761) (21761 bytes); SHA-256 `9094a17940690e1c76d415cb9f2050d772d4a45703c5bcd317bff0bcd4e9bbc8`.

Read chunks:
- [0, 8000): `071352281d25670c2ea99a348070a5ad0f4151ebbddb606126fc078b0f778264`
- [8000, 16000): `ce1466d7336524e894673407ad81440624fad24dac525e896e7bcd0a17f23d59`
- [16000, 21761): `e32ad700c5a688cee2f86b2d03db8420b7f33f5ea9cdc7925f997c1e0aef374f`

Backlinks (literal current mentions, not authority): `docs/NOTES-INDEX.md`; `docs/notes/AGENT-MEMORY.md`.

### SELF-IMPROVING-SURFACE-2026-09-22.md

Source: [SELF-IMPROVING-SURFACE-2026-09-22.md](../notes/SELF-IMPROVING-SURFACE-2026-09-22.md). Date / producer: 2026-09-22; six read-only Sonnet researchers plus parent primary-source checking.

Topics: Instruction growth; context ablations; self-authored verification; enforcement evidence gap; hook/memory mechanisms; repository baseline; expiry/rationale, budgets, external promotion; security and unresolved evidence.

Use and limits: Research record explicitly says nothing was applied. Supports cautious external evaluation and reviewable writes, with no causal study proving enforcement over documentation. Machine-local memory conclusions predate later sync work; primary and relayed evidence are distinguished.

Whole source: 17727 bytes; SHA-256 `c7064ff2957c14bd5dba93fc6227e40876081ef585cc51d373a0a096f0523c18`. Manifest whole-source match: true.
Assigned part: [0, 17727) (17727 bytes); SHA-256 `c7064ff2957c14bd5dba93fc6227e40876081ef585cc51d373a0a096f0523c18`.

Read chunks:
- [0, 8000): `57a296b651feec8f1951cdc2cb251393c51d43ff7ad0e31b6940ce08bc8c9086`
- [8000, 15999): `49446d35edc820ca1de6aa0160a5d14c3646d5c753c022383a151feff379e9d4`
- [15999, 17727): `ac68baf6854af05f3842b856d080d735c1ada749e800658018be62cc58a16eda`

Backlinks (literal current mentions, not authority): `docs/NOTES-INDEX.md`; `docs/notes/AGENT-MEMORY.md`.

### SKILL-MCP-SCOUT-2026-10-18.md

Source: [SKILL-MCP-SCOUT-2026-10-18.md](../notes/SKILL-MCP-SCOUT-2026-10-18.md). Date / producer: 2026-10-18; four read-only research agents merged by unnamed author, requested by Bryce.

Topics: Verification limits; ranked top ten offline tools; runners-up; opening Code rows of full scout table.

Use and limits: Candidate discovery provenance, no installation/config changes. README versus metadata-only evidence is explicit; GitHub API 403 limited checking. Assigned file ends mid-TypeScript row, so no unseen remainder of the advertised full table is inferred.

Whole source: 23611 bytes; SHA-256 `7034ca64ceb9ed3454acd10933174bceab1951395a9d104d540025fe4b05d471`. Manifest whole-source match: true.
Assigned part: [0, 5854) (5854 bytes); SHA-256 `90284f854e1fa2ed90cba09735361a698071e322bcedb1b769215ad53f6c76db`.

Read chunks:
- [0, 5854): `90284f854e1fa2ed90cba09735361a698071e322bcedb1b769215ad53f6c76db`

Backlinks (literal current mentions, not authority): `docs/TESTING.md`; archived provenance entry (see the paths JSON).

## Path provenance

Raw path-like quotations and archive references are retained separately in [notes-30-paths.json](notes-30-paths.json). Literal existence checks do not establish current ownership, authority or deletion. Archive references were not followed as operational instructions.
