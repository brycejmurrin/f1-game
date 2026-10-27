# Notes batch 09 — historical evidence map

Read 2026-10-27. Group `09` of [notes-batches.json](notes-batches.json): all 100,000 assigned bytes read in 16 individually returned, untruncated chunks of at most 9,000 bytes. Offsets below are half-open UTF-8 byte ranges. Selection-plan opening belongs batch 08; Cursor probe continues batch 10.

Historical provenance only. Current use below means documentary navigation, not verification of implementation. Current [AGENTS.md](../../AGENTS.md), [WORKERS.md](../WORKERS.md), [TESTING.md](../TESTING.md) and owning code take precedence. No historical command, runtime, network, browser, test, source edit or commit was executed. Only this map was written.

## Per-note and section map

### P1: CI-SELECTION-PLAN-2026-10-16.md

- Date / producers: 2026-10-16. CI measurement/review author unnamed; Bryce supplies D1–D3 decisions.
- Topics: Runner saturation; failure episodes; selector breadth; ranked P1–P10 savings; literature; owner decisions; protected signal.
- Sections covered: 1. Load and the train (M); 2. What each job catches (40 h, 2026-10-15 04:29Z → 10-16 20:30Z; M); 3. How selection works, and where it is too broad (M, 160 merges replayed); 4. Proposals, ranked by runner-minutes saved against signal lost; 5. What the literature says; 6. Decisions for Bryce; 7. Not changing, with the reason.
- Current use: Use to trace why draft node suites and train driving checks changed. P3/P6 are recorded landed in #2575; guards-first was declined; Parts census retained.
- Limits: Continuation from batch 08; first 1,252 bytes excluded here. Measured 40 h sample and estimates are historical; checklist is not current implementation status.
- Backlinks and cited destinations (raw path data; archive references intentionally not live links):
```json
{
  "source": "docs/notes/CI-SELECTION-PLAN-2026-10-16.md",
  "incoming_mentions_in_docs": [
    "docs/NOTES-INDEX.md",
    "docs/notes/BUILD-HUNT-2026-10-24.md"
  ],
  "outgoing_markdown_targets": [
    "https://arxiv.org/abs/1810.05286",
    "https://research.google/pubs/pub45861/",
    "https://learn.microsoft.com/en-ie/previous-versions/azure/devops/pipelines/test/test-impact-analysis?view=tfs-2017",
    "https://users.ece.utexas.edu/~gligoric/papers/abstracts/GligoricETAL15Ekstazi.txt",
    "https://playwright.dev/docs/release-notes",
    "https://playwright.dev/docs/api/class-coverage",
    "https://docs.github.com/en/enterprise-server@3.19/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks",
    "https://mergify.com/blog/path-filters-are-not-a-ci-gate"
  ]
}
```

### P2: CICD-JOBS-REVIEW-2026-10-16.md

- Date / producers: 2026-10-16. Unnamed CI analyst; GitHub REST job/step histories and PR file lists.
- Topics: Job-vs-diff coverage; critical path; setup/cache cost; caps/retries/cancels; train cadence; proposal diff sketches; remeasurement.
- Sections covered: CI jobs review — structure, failures vs diffs (2026-10-16); 0. Sample, and what it can and cannot say; 1. Top proposals, ranked by minutes saved per effort; 2. Failures vs diffs; 2.1 Every failed run, 8.8 h (20 runs: 18 on PRs, 2 ship pushes); 2.2 Path class × job (96 PRs; class from the PR's final file list, so a PR is classed by its end state); 3. Critical path and splitting; 4. Setup and cache cost (4,263 jobs, 13,699 job-min); 5. Timeouts, retries, cancels; 6. Pages train (pages.yml); 7. Triggers and concurrency; 8. Proposals with diffs; 9. Not proposed, with the evidence; 10. Re-measure.
- Current use: Follow the progression from whole-system review to CI selection plan: early node-suite recommendation was deliberately conservative.
- Limits: 8.8 h full-job sample; only five green ready runs on the new configuration. Final PR file lists can misclassify earlier run diffs; scratch data uncommitted.
- Backlinks and cited destinations (raw path data; archive references intentionally not live links):
```json
{
  "source": "docs/notes/CICD-JOBS-REVIEW-2026-10-16.md",
  "incoming_mentions_in_docs": [
    "docs/NOTES-INDEX.md",
    "docs/notes/CI-SELECTION-PLAN-2026-10-16.md"
  ],
  "outgoing_markdown_targets": [
    "CICD-REVIEW-2026-10-16.md"
  ]
}
```

### P3: CICD-REVIEW-2026-10-16.md

- Date / producers: 2026-10-16. Unnamed whole-system reviewer; GitHub REST measurements 02:10–02:40 UTC.
- Topics: Pipeline events and gates; occupancy; cancellations; sync cost; proposal PRs A–G; six questions; contradictory agent rules; owner decisions; reproduction recipe.
- Sections covered: CI/CD and dev-process review — 2026-10-16; 1. Plan (the checklist this review worked through); 2. What this review changes (one draft PR per theme); 3. Findings, ranked by minutes saved per effort; 4. How the pipeline works now (read this in five minutes); 5. Evidence; 5.1 Runner occupancy (per minute, Linux jobs with a success/failure conclusion and ≥ 30 s); 5.2 Runs and jobs; 5.3 The ready PR's critical path; 5.4 Why PR runs were cancelled (281 cancelled PR runs); 5.5 Policy throttles; 5.6 Pull requests (279 merged; 138 opened inside the run window); 5.7 Pages (100 runs, 10-10 → 10-16); 6. The six questions; 7. The agent surface: contradictions and dead rules (for PR G); 8. Decisions that are Bryce's; 9. How to re-measure.
- Current use: Historical basis for train-on-push, smoke lane retirement, CI hygiene and one-home rule cleanup.
- Limits: 21.7 h CI sample plus 5.5-day Pages history; old Merge Desk, caps, required checks and authority wording are historical. Current AGENTS/WORKERS govern. Recipes are provenance only.
- Backlinks and cited destinations (raw path data; archive references intentionally not live links):
```json
{
  "source": "docs/notes/CICD-REVIEW-2026-10-16.md",
  "incoming_mentions_in_docs": [
    "docs/NOTES-INDEX.md",
    "docs/notes/CI-SELECTION-PLAN-2026-10-16.md",
    "docs/notes/CICD-JOBS-REVIEW-2026-10-16.md",
    "docs/notes/system-audit-4/anchors.md"
  ],
  "outgoing_markdown_targets": [
    "https://github.blog/changelog/2023-07-12-pull-request-merge-queue-is-now-generally-available/",
    "https://docs.github.com/en/actions/reference/limits"
  ]
}
```

### P4: COCKPIT-DATUMS.md

- Date / producers: Undated note; source FIA issue 11 dated 2025-02-26. Unnamed cockpit author; FIA 2026 Section C technical regulations.
- Topics: Coordinate conversion; regulatory datum table; mirror/tub defects; bounded eye height; depth-probe usage.
- Sections covered: Cockpit datums — the FIA numbers the first-person view is built on; 1. The coordinate system, and why our metres already line up; 2. The datum table; 3. What the table found wrong; 4. The one number the regulations do not give; 5. Using this file.
- Current use: Use regulatory rows to distinguish geometry constraints from styling. Eye height 0.82 is explicitly a design choice, not regulation.
- Limits: Claims rely on a particular regulation issue and model snapshot. Intro says four defects but enumerates five; regulatory height mapping and current geometry need independent checking.
- Backlinks and cited destinations (raw path data; archive references intentionally not live links):
Historical path data retained in [notes-09-provenance.json](notes-09-provenance.json).

### P5: COCKPIT-MODEL-REFERENCES.md

- Date / producers: Undated. Unnamed cockpit modeller; manufacturer/editorial photographs inspected through Chromium.
- Topics: Design families; integration contract; body/wheel/liner combinations; live instruments; presets; materials; studio inspection; physical reflection limits.
- Sections covered: Cockpit modelling references; Selectable design families; Additional cockpit combinations; Cockpit refinements and coordinated presets; Proportions, materials and inspection.
- Current use: Reference for cockpit styling and stable saved IDs/display behavior; separates team-inspired shapes from replicas.
- Limits: Studio preview does not establish in-race night colors. Physical mirror glass reflects environment without following cars; archived rear-camera design is only a proposed extension.
- Backlinks and cited destinations (raw path data; archive references intentionally not live links):
Historical path data retained in [notes-09-provenance.json](notes-09-provenance.json).

### P6: COLLISION-CULLING-PLAN-2026-09-16.md

- Date / producers: 2026-09-16; shipped addendum same day. Unnamed collision/performance author; exact counts, contact suites and determinism evidence reported.
- Topics: Mature culling baseline; corrected buried-box estimate; rectangle solver weaknesses; ranked collision work; first-step gate; shipped restitution/friction corrections.
- Sections covered: Collisions and hidden-face culling — plan (2026-09-16); 1. Culling today — do not re-derive this; 2. Collisions today; The named weaknesses; 3. Collision work, ranked; 4. Recommended first step, and its gate; 5. The rule this plan keeps; 6. Step one shipped, 2026-09-16.
- Current use: Read correction and shipped addendum before re-proposing underside culling or impulse changes. Sequential normal then tangential solve preserves energy bound.
- Limits: Old 13% box-culling estimate explicitly refuted by 0.27% measurement and revert. Unyawed sweep also reaches impulse path; friction 0.5 unmeasured. Test passes are historical reports, not rerun here.
- Backlinks and cited destinations (raw path data; archive references intentionally not live links):
```json
{
  "source": "docs/notes/COLLISION-CULLING-PLAN-2026-09-16.md",
  "incoming_mentions_in_docs": [],
  "outgoing_markdown_targets": []
}
```

### P7: CONCURRENT-PRS-CI-HYGIENE-2026-09-30.md

- Date / producers: 2026-09-30; retirement/supersession edits 2026-10-16 and 2026-10-26. Unnamed CI hygiene author; merge-hygiene #484 and later rulebook maintainers.
- Topics: Concurrent draft PRs; sync and shared-file normalization; retries/quarantine; workflow changes; normalization recipe.
- Sections covered: Concurrent PRs / CI hygiene (2026-09-30); Concurrent PRs (full); Flaky tests (full); What this PR adds; Normalize command (merge-hygiene #484).
- Current use: Provenance for sync restraint, retry-is-red and generated list hygiene.
- Limits: Explicitly superseded by rulebook rewrite; references old orchestrator, AGENTS section and fleet-core. Commands and past policy do not override current AGENTS/WORKERS.
- Backlinks and cited destinations (raw path data; archive references intentionally not live links):
Historical path data retained in [notes-09-provenance.json](notes-09-provenance.json).

### P8: COTA-TECPRO-SOFTWARE-GL.md

- Date / producers: 2026-10-10. Unnamed renderer investigator; session_01Dxhx4KVdkaugd3GjPg3T4c.
- Topics: COTA T12 yellow TecPro instanced wall invisible in SwiftShader lit pass; matching mesh state; llvmpipe draws it; unstable aggregate triangles.
- Sections covered: Cota tecpro wall: SwiftShader vs llvmpipe (2026-10-10).
- Current use: Helps distinguish software backend artefact from geometry absence; stable per-mesh deltas matter.
- Limits: Hardware unmeasured; software agreement is not player-GPU evidence. Pixel check null on single-color canvas; frozen sim does not guarantee stable renderer totals.
- Backlinks and cited destinations (raw path data; archive references intentionally not live links):
```json
{
  "source": "docs/notes/COTA-TECPRO-SOFTWARE-GL.md",
  "incoming_mentions_in_docs": [],
  "outgoing_markdown_targets": []
}
```

### P9: CPU-HUNT-2026-10-24.md

- Date / producers: 2026-10-24. A·H13 main-thread lane; Bryce iPhone target; OrchA receives AI-rate proposal.
- Topics: JSC vs V8 boxing; warm-up tiering; CPU/HUD/native measurements; C1–C10 findings; accepted/refuted/rejected/proposed work.
- Sections covered: CPU / GC hunt — in-race main thread (A·H13, 2026-10-24); The finding that reorders the lane: most of V8's "garbage" is not garbage on the iPhone; Measurements; Findings; Next.
- Current use: Use real-object allocation column for iPhone prioritization; HUD layout is stronger target than boxed V8 numbers.
- Limits: Desktop/SwiftShader ranks work but proves no phone win. C3 VM flap finding refuted in browser; far-car 30 Hz remains behavior-bearing proposal, audio needs audible A/B.
- Backlinks and cited destinations (raw path data; archive references intentionally not live links):
```json
{
  "source": "docs/notes/CPU-HUNT-2026-10-24.md",
  "incoming_mentions_in_docs": [
    "docs/NOTES-INDEX.md"
  ],
  "outgoing_markdown_targets": [
    "https://wingolog.org/archives/2011/05/18/value-representation-in-javascript-implementations",
    "https://v8.dev/blog/mutable-heap-number"
  ]
}
```

### P10: CURSOR-AGENTS-API-PROBE-2026-10-19.md

- Date / producers: 2026-10-19. CURSOR-API-2 Claude cloud probe; user-scoped Cursor key, value withheld.
- Topics: Documentation/auth/rate limits and partial results table: identity, models, repositories, agents and beginning of list-runs.
- Sections covered: Cursor Cloud Agents API probe (CURSOR-API-2), 2026-10-19; Docs (read 2026-10-19); Results.
- Current use: Historical API capability and credential-scope evidence for fleet coordination.
- Limits: Assigned range ends mid-table at GET; remaining operations belong batch 10. Endpoint/models/cost/auth observations may drift; no credentials accessed and no API called here.
- Backlinks and cited destinations (raw path data; archive references intentionally not live links):
Historical path data retained in [notes-09-provenance.json](notes-09-provenance.json).

## Whole / part / chunk SHA-256 ledger

Hashes identify current local bytes, not runtime truth. Whole-file hashing does not imply reading unassigned text. All manifest whole hashes match at mapping time.

```json
[
  {
    "part": 1,
    "path": "docs/notes/CI-SELECTION-PLAN-2026-10-16.md",
    "whole_bytes": 15259,
    "whole_sha256": "e0084f4ba7bd3817f2b53475dd7523394f521ae1fb8e40f74d0ed8d267eb5b83",
    "manifest_whole_sha256": "e0084f4ba7bd3817f2b53475dd7523394f521ae1fb8e40f74d0ed8d267eb5b83",
    "manifest_matches": true,
    "assigned_start": 1252,
    "assigned_end": 15259,
    "assigned_bytes": 14007,
    "assigned_sha256": "428c030c20bbf96c190c8ed2427b2309a6b5f874f73f3618369f90aae9c73519",
    "read_chunks": [
      {
        "start": 1252,
        "end": 10252,
        "bytes": 9000,
        "sha256": "81e58288ae91537665f1d1ae4d964d6e865ba546224e7de8e6092672556fc047"
      },
      {
        "start": 10252,
        "end": 15259,
        "bytes": 5007,
        "sha256": "509bf9975693a232c6dd224c03ebed4776ea4b866313232e612ff62a38376a77"
      }
    ]
  },
  {
    "part": 2,
    "path": "docs/notes/CICD-JOBS-REVIEW-2026-10-16.md",
    "whole_bytes": 15545,
    "whole_sha256": "c0a1ecc5eccfe5a491740d9c46598d41611ca354f32aaaf17a592f9cdf801048",
    "manifest_whole_sha256": "c0a1ecc5eccfe5a491740d9c46598d41611ca354f32aaaf17a592f9cdf801048",
    "manifest_matches": true,
    "assigned_start": 0,
    "assigned_end": 15545,
    "assigned_bytes": 15545,
    "assigned_sha256": "c0a1ecc5eccfe5a491740d9c46598d41611ca354f32aaaf17a592f9cdf801048",
    "read_chunks": [
      {
        "start": 0,
        "end": 9000,
        "bytes": 9000,
        "sha256": "aae51de2066478f16f58fb380dc6db7aa3780db4140859ccac431ff854685ee5"
      },
      {
        "start": 9000,
        "end": 15545,
        "bytes": 6545,
        "sha256": "a154d54600b082f71b5726c3b3c7f66748170971b4f941a8d0c773cb30d96e40"
      }
    ]
  },
  {
    "part": 3,
    "path": "docs/notes/CICD-REVIEW-2026-10-16.md",
    "whole_bytes": 30006,
    "whole_sha256": "6a55993ad314c59be001a61165d61a5482d01f293792c473c9a653208e6fcbf5",
    "manifest_whole_sha256": "6a55993ad314c59be001a61165d61a5482d01f293792c473c9a653208e6fcbf5",
    "manifest_matches": true,
    "assigned_start": 0,
    "assigned_end": 30006,
    "assigned_bytes": 30006,
    "assigned_sha256": "6a55993ad314c59be001a61165d61a5482d01f293792c473c9a653208e6fcbf5",
    "read_chunks": [
      {
        "start": 0,
        "end": 9000,
        "bytes": 9000,
        "sha256": "1b0e60b9adbd59b703e512eaa4f99dad6146f2f5b2f610df254919046ae495ed"
      },
      {
        "start": 9000,
        "end": 18000,
        "bytes": 9000,
        "sha256": "c4aa1bc576e8c66d55b5409afce1a765d8b299e2d1533d3d2ae2fa99e1da213d"
      },
      {
        "start": 18000,
        "end": 27000,
        "bytes": 9000,
        "sha256": "9317e95590596d14ae1fb3a7db62b2fc36f217e42b7fab872f19b7948a46deac"
      },
      {
        "start": 27000,
        "end": 30006,
        "bytes": 3006,
        "sha256": "bd1439b2540b9eaacc3c429c943a2b320ce9c8ebfadd05b25f22c65721250a83"
      }
    ]
  },
  {
    "part": 4,
    "path": "docs/notes/COCKPIT-DATUMS.md",
    "whole_bytes": 5842,
    "whole_sha256": "af4f69c9f6b7b24f382aebb8928b95ab2550c7b3755ed479d8533972988bd6e7",
    "manifest_whole_sha256": "af4f69c9f6b7b24f382aebb8928b95ab2550c7b3755ed479d8533972988bd6e7",
    "manifest_matches": true,
    "assigned_start": 0,
    "assigned_end": 5842,
    "assigned_bytes": 5842,
    "assigned_sha256": "af4f69c9f6b7b24f382aebb8928b95ab2550c7b3755ed479d8533972988bd6e7",
    "read_chunks": [
      {
        "start": 0,
        "end": 5842,
        "bytes": 5842,
        "sha256": "af4f69c9f6b7b24f382aebb8928b95ab2550c7b3755ed479d8533972988bd6e7"
      }
    ]
  },
  {
    "part": 5,
    "path": "docs/notes/COCKPIT-MODEL-REFERENCES.md",
    "whole_bytes": 8193,
    "whole_sha256": "07ef837c0d153bd3a41c5f5de6b9ab416287ce6f152177c4b278e670b0646620",
    "manifest_whole_sha256": "07ef837c0d153bd3a41c5f5de6b9ab416287ce6f152177c4b278e670b0646620",
    "manifest_matches": true,
    "assigned_start": 0,
    "assigned_end": 8193,
    "assigned_bytes": 8193,
    "assigned_sha256": "07ef837c0d153bd3a41c5f5de6b9ab416287ce6f152177c4b278e670b0646620",
    "read_chunks": [
      {
        "start": 0,
        "end": 8193,
        "bytes": 8193,
        "sha256": "07ef837c0d153bd3a41c5f5de6b9ab416287ce6f152177c4b278e670b0646620"
      }
    ]
  },
  {
    "part": 6,
    "path": "docs/notes/COLLISION-CULLING-PLAN-2026-09-16.md",
    "whole_bytes": 11363,
    "whole_sha256": "bb29a8a73cb58e8c3dec20320bbfe48a5cef919246ff6e26e00e2f6339faa84c",
    "manifest_whole_sha256": "bb29a8a73cb58e8c3dec20320bbfe48a5cef919246ff6e26e00e2f6339faa84c",
    "manifest_matches": true,
    "assigned_start": 0,
    "assigned_end": 11363,
    "assigned_bytes": 11363,
    "assigned_sha256": "bb29a8a73cb58e8c3dec20320bbfe48a5cef919246ff6e26e00e2f6339faa84c",
    "read_chunks": [
      {
        "start": 0,
        "end": 9000,
        "bytes": 9000,
        "sha256": "28a86d457f19b03feddd7851fca850e1dd06eb16188377929d79f835b235acaf"
      },
      {
        "start": 9000,
        "end": 11363,
        "bytes": 2363,
        "sha256": "baf4690b1d0b161b0b6e5cca02d8cfd26f8b95fb8ab386ef69c08106f11a8fad"
      }
    ]
  },
  {
    "part": 7,
    "path": "docs/notes/CONCURRENT-PRS-CI-HYGIENE-2026-09-30.md",
    "whole_bytes": 3760,
    "whole_sha256": "9a7fddba78d7db15f9baefd796821f1e0c6b7c352d1b602b6c212082e727f0aa",
    "manifest_whole_sha256": "9a7fddba78d7db15f9baefd796821f1e0c6b7c352d1b602b6c212082e727f0aa",
    "manifest_matches": true,
    "assigned_start": 0,
    "assigned_end": 3760,
    "assigned_bytes": 3760,
    "assigned_sha256": "9a7fddba78d7db15f9baefd796821f1e0c6b7c352d1b602b6c212082e727f0aa",
    "read_chunks": [
      {
        "start": 0,
        "end": 3760,
        "bytes": 3760,
        "sha256": "9a7fddba78d7db15f9baefd796821f1e0c6b7c352d1b602b6c212082e727f0aa"
      }
    ]
  },
  {
    "part": 8,
    "path": "docs/notes/COTA-TECPRO-SOFTWARE-GL.md",
    "whole_bytes": 1301,
    "whole_sha256": "a1b0a06a3dc4ca80969ef6b790402d6991db71b22307d0e2532460d49e7b0ab7",
    "manifest_whole_sha256": "a1b0a06a3dc4ca80969ef6b790402d6991db71b22307d0e2532460d49e7b0ab7",
    "manifest_matches": true,
    "assigned_start": 0,
    "assigned_end": 1301,
    "assigned_bytes": 1301,
    "assigned_sha256": "a1b0a06a3dc4ca80969ef6b790402d6991db71b22307d0e2532460d49e7b0ab7",
    "read_chunks": [
      {
        "start": 0,
        "end": 1301,
        "bytes": 1301,
        "sha256": "a1b0a06a3dc4ca80969ef6b790402d6991db71b22307d0e2532460d49e7b0ab7"
      }
    ]
  },
  {
    "part": 9,
    "path": "docs/notes/CPU-HUNT-2026-10-24.md",
    "whole_bytes": 7967,
    "whole_sha256": "445acc68759665749a19901ba5628213c4587f1670df616ea26392077e9ada26",
    "manifest_whole_sha256": "445acc68759665749a19901ba5628213c4587f1670df616ea26392077e9ada26",
    "manifest_matches": true,
    "assigned_start": 0,
    "assigned_end": 7967,
    "assigned_bytes": 7967,
    "assigned_sha256": "445acc68759665749a19901ba5628213c4587f1670df616ea26392077e9ada26",
    "read_chunks": [
      {
        "start": 0,
        "end": 7967,
        "bytes": 7967,
        "sha256": "445acc68759665749a19901ba5628213c4587f1670df616ea26392077e9ada26"
      }
    ]
  },
  {
    "part": 10,
    "path": "docs/notes/CURSOR-AGENTS-API-PROBE-2026-10-19.md",
    "whole_bytes": 9044,
    "whole_sha256": "34f6c66606032d4b2e6a47196914647e46c6accb583d92de37a8491a324a39b1",
    "manifest_whole_sha256": "34f6c66606032d4b2e6a47196914647e46c6accb583d92de37a8491a324a39b1",
    "manifest_matches": true,
    "assigned_start": 0,
    "assigned_end": 2016,
    "assigned_bytes": 2016,
    "assigned_sha256": "3a919338f814e584c1748f0c8013b52b5e6014fbae3f76c43d4a5f3b1a37eba4",
    "read_chunks": [
      {
        "start": 0,
        "end": 2016,
        "bytes": 2016,
        "sha256": "3a919338f814e584c1748f0c8013b52b5e6014fbae3f76c43d4a5f3b1a37eba4"
      }
    ]
  }
]
```
