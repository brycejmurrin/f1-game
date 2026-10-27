# Notes group 29 — racing, renderer and rulebook provenance

Historical-source map only. Current AGENTS.md was read. Every assigned byte was returned as one individually returned, untruncated source chunk of at most 10,000 bytes per call. No historical command, runtime, network, browser or test was executed. Dates, producers, implementation and verification claims below are source claims, not current validation. Byte ranges are half-open UTF-8 source bytes.

## Source and chunk ledger

### RACING-LINE-RESEARCH.md

Source: [RACING-LINE-RESEARCH.md](../notes/RACING-LINE-RESEARCH.md); date: 2026-09-08; follow-up 2026-09-16. Producer: Unnamed assessment/implementation and measurement sessions; owner decisions cited.

Topics: Assigned tail of §7 heading controller, line families and hint bounds; corrected browser/VM twins and bake cost; §8 solo-lap remeasurement; §9 reverted late-apex experiment; §10 field-median pace instrument; §11 exact-curvature objective, projected slope trims, multilevel symmetric solve, brake/accel sweep and rejected weighting.

Current use and limits: Use for geometric-line versus driven-lap and traffic distinctions. Prototype timings, timeout guesses and first-order metrics are explicitly corrected. Exact-line curvature still did not replace synthetic pathK; lateral-speed bound and multi-seed instrument were unfinished. Earlier sections are mapped by notes-28.

Whole source: 46770 bytes; SHA-256 `348bf23c3b7ece324135c5566fe111547f95c8e816210bd8d14aa1919f6cf371`. Manifest whole-source hash matches: true.
Assigned part: [19075, 46770) (27695 bytes); SHA-256 `ffc89fbc7ae0948a443f47e1b5209f04ea79b34bedda253c5c9df658cf138756`.

Read chunks:
- [19075, 29075): `3acac9b6ed29ad674f049bb7ef108f4a2a3d36a2d028db12b223fe3e7aed908e`
- [29075, 39075): `52f973a26023c5c70f85d5a01a0e073df7c70ca7626339987af4c8f8cb3ed79e`
- [39075, 46770): `bae56b3f8757c36cd9d4e8917f8c8f85a2912beeeeda8c8f3ca21493a85765d7`

Backlinks (literal current Markdown mentions, not authority): `docs/PHYSICS.md`; `docs/notes/CEILING-HISTORY.md`; `docs/notes/TUMFTM-RACETRACK-DATABASE.md`; `scratch/f1-source-restore/docs/PHYSICS.md`; `scratch/f1-source-restore/docs/notes/CEILING-HISTORY.md`; `scratch/f1-source-restore/docs/notes/TUMFTM-RACETRACK-DATABASE.md`.

### RATCHET-FRAGMENTS-2026-10-15.md

Source: [RATCHET-FRAGMENTS-2026-10-15.md](../notes/RATCHET-FRAGMENTS-2026-10-15.md); date: 2026-10-15; additions 10-16 and 10-17. Producer: Ratchet tooling implementation associated with #2291, #2337, #2583; author unnamed.

Topics: Measured same-module merge conflicts; server-side merge-driver limits; additive branch fragments, folding, deliberate tree raises and changed-file delta scope.

Current use and limits: Explains why absolute ceilings conflicted and branch deltas compose. Command examples and historical deploy/desk policy are provenance; current generated-file and ratchet rules govern actions.

Whole source: 4728 bytes; SHA-256 `9c8c3529d1c04c89ca2528e87fc6a649d4f001edd19736d121d78bd123959863`. Manifest whole-source hash matches: true.
Assigned part: [0, 4728) (4728 bytes); SHA-256 `9c8c3529d1c04c89ca2528e87fc6a649d4f001edd19736d121d78bd123959863`.

Read chunks:
- [0, 4728): `9c8c3529d1c04c89ca2528e87fc6a649d4f001edd19736d121d78bd123959863`

Backlinks (literal current Markdown mentions, not authority): `docs/NOTES-INDEX.md`; `scratch/f1-source-restore/docs/NOTES-INDEX.md`.

### REAL-RACE-2026-09-27.md

Source: [REAL-RACE-2026-09-27.md](../notes/REAL-RACE-2026-09-27.md); date: 2026-09-27 through 2026-10-04. Producer: Unnamed real-race feature implementation/review sessions.

Topics: OpenF1 source/caching schema; seat mapping, proportional distance, AI pace reference, cautions; jump-in reconstruction and rolling handover; lap book; rigid trace fitting, WATCH/HIGHLIGHTS puppets; broadcast tower, director, PiP, commentary and known limits.

Current use and limits: Useful design map for data-to-simulation boundaries and replay camera/HUD integration. Multiple passes correct earlier behavior; v1 limits can conflict with later fixes. API availability, roster mapping, licensing and current UI require fresh corroboration; no service queried.

Whole source: 20693 bytes; SHA-256 `40a4b7bf1f1a951a35634a5844cbcb0f37965462fd37cc70e6524e66c0464ad6`. Manifest whole-source hash matches: true.
Assigned part: [0, 20693) (20693 bytes); SHA-256 `40a4b7bf1f1a951a35634a5844cbcb0f37965462fd37cc70e6524e66c0464ad6`.

Read chunks:
- [0, 10000): `f054269040c92c4dfaf2d0d04af08e58b6cfe9dfce85179a73340c4f6e18ffb9`
- [10000, 20000): `636b7ef95d44baba90a62bdb48829d9d731883d0a5146cfd3a27f2df9898c813`
- [20000, 20693): `52015b1a712e1c485728dd8069c39bed9c6eb44e1d93c59f3a990b7b53b84662`

Backlinks (literal current Markdown mentions, not authority): `.claude/skills/data-hub/SKILL.md`; `README.md`; `docs/NOTES-INDEX.md`; `docs/notes/system-audit-4/skills/data-hub.md`; `docs/plans/2026-10-04-pwa-shortcuts-calendar.md`; `scratch/f1-source-restore/.claude/skills/data-hub/SKILL.md`; `scratch/f1-source-restore/README.md`; `scratch/f1-source-restore/docs/NOTES-INDEX.md`; `scratch/f1-source-restore/docs/notes/system-audit-4/skills/data-hub.md`; `scratch/f1-source-restore/docs/plans/2026-10-04-pwa-shortcuts-calendar.md`.

### REAR-WING-ACTIVE-AERO-2026-10-19.md

Source: [REAR-WING-ACTIVE-AERO-2026-10-19.md](../notes/REAR-WING-ACTIVE-AERO-2026-10-19.md); date: 2026-10-19. Producer: Lane B·W3·L11, responding to Bryce; orchestrator grant quoted.

Topics: FIA rigid rear-flap/pivot/incidence rules; measured separate-axis overrotation; shared rear-half pivot; moving crown plane, sponsor/livery handling and remaining front-hinge discrepancy.

Current use and limits: Supports geometry intent and conventional DRS-style choice; regulation sets no angle. VM and triangle claims are historical; tools-only color discrepancy and front-wing hinge were left unresolved. Past grant is not current authorization.

Whole source: 5297 bytes; SHA-256 `e794f49e9a1bcec63b7118bb20820d8bb01cf48617d6206b0643b357de58b868`. Manifest whole-source hash matches: true.
Assigned part: [0, 5297) (5297 bytes); SHA-256 `e794f49e9a1bcec63b7118bb20820d8bb01cf48617d6206b0643b357de58b868`.

Read chunks:
- [0, 5297): `e794f49e9a1bcec63b7118bb20820d8bb01cf48617d6206b0643b357de58b868`

Backlinks (literal current Markdown mentions, not authority): none found.

### RENDER-PERF-PLAN-2026-09-16.md

Source: [RENDER-PERF-PLAN-2026-09-16.md](../notes/RENDER-PERF-PLAN-2026-09-16.md); date: 2026-09-16, successive census runs 138–154. Producer: Unnamed renderer profiling/implementation session.

Topics: Visibility oracle; occlusion and multi-draw A/B; withdrawn timing conclusions; interleaved sampler; lamp-set grouping correction and equivalence test; run-to-run sign reversal; build-time night lamps, tier shedding and hardware grouping counts.

Current use and limits: Critical correction trail: GPU timings are expressly withdrawn or unusable, and no default move is supported. Exact counted work and mechanical equivalence survive; local 9.5 calls/frame saving is superseded by 2.7 on the measured runner. Historical backend-default claim is not current authority.

Whole source: 17968 bytes; SHA-256 `46a6e74cad088d2a4bde6dc743fad39a67ca688ea45baa7c2d7eca547001938d`. Manifest whole-source hash matches: true.
Assigned part: [0, 17968) (17968 bytes); SHA-256 `46a6e74cad088d2a4bde6dc743fad39a67ca688ea45baa7c2d7eca547001938d`.

Read chunks:
- [0, 10000): `0edc119e76fee1339344c0d519099ad05f3af27611f8bea38d07e382c096f77a`
- [10000, 17968): `37fe23d19c3f1f8df65695cffe84bd9f1b718a5033044cafde064424b9f80d06`

Backlinks (literal current Markdown mentions, not authority): `docs/DEBUG-HOOKS.md`; archived provenance entry (see the paths JSON); `docs/notes/PERF-RESEARCH-2026-10-17.md`; `scratch/f1-source-restore/docs/DEBUG-HOOKS.md`; archived provenance entry (see the paths JSON); `scratch/f1-source-restore/docs/notes/PERF-RESEARCH-2026-10-17.md`.

### RENDER-SETTINGS-TOOLING-RESEARCH-2026-10-21.md

Source: [RENDER-SETTINGS-TOOLING-RESEARCH-2026-10-21.md](../notes/RENDER-SETTINGS-TOOLING-RESEARCH-2026-10-21.md); date: 2026-10-21. Producer: Fleet B·H10 for OrchB 24; Bryce request quoted.

Topics: Browser GPU timer support/confidence; real-device options; render-scale fill slope; phone resolution defaults; eight tooling/measurement ideas.

Current use and limits: Research index distinguishing primary docs, surveys and unverified device claims. Paravirtual timings cannot price phone fill cost; phone timer support and metered service capability were unverified. Proposals and past instructions remain historical.

Whole source: 7110 bytes; SHA-256 `d635bf47a1a7fe3b046b5894640224c27f675a69e52b252454c2a02b0b2409ac`. Manifest whole-source hash matches: true.
Assigned part: [0, 7110) (7110 bytes); SHA-256 `d635bf47a1a7fe3b046b5894640224c27f675a69e52b252454c2a02b0b2409ac`.

Read chunks:
- [0, 7110): `d635bf47a1a7fe3b046b5894640224c27f675a69e52b252454c2a02b0b2409ac`

Backlinks (literal current Markdown mentions, not authority): `docs/NOTES-INDEX.md`; `docs/notes/PHONE-GPU-TEST-2026-10-21.md`; `docs/perf/iphone-browserstack-2026-10-21.md`; `scratch/f1-source-restore/docs/notes/PHONE-GPU-TEST-2026-10-21.md`; `scratch/f1-source-restore/docs/perf/iphone-browserstack-2026-10-21.md`.

### RENDERER-MACOS-RED-2026-09.md

Source: [RENDERER-MACOS-RED-2026-09.md](../notes/RENDERER-MACOS-RED-2026-09.md); date: 2026-09-19–22 evidence window. Producer: Unnamed log/history diagnosis session.

Topics: Two repeatable nightly Metal failures; rejected governor/façade hypotheses; lamp-grid fix suspect; shadow failure unexplained; no tolerance widening; real-GPU selection coverage gap.

Current use and limits: Diagnosis explicitly not a Metal-verified fix. Bit-identical failures support standing-defect interpretation in that window; proposed lighting causality is unconfirmed and cancellation is separate. Current CI status is unknown.

Whole source: 5517 bytes; SHA-256 `d37e99c613ed0ee6c37473759317dc9d633d81ab5d47af8e4c27770c7d87c5b1`. Manifest whole-source hash matches: true.
Assigned part: [0, 5517) (5517 bytes); SHA-256 `d37e99c613ed0ee6c37473759317dc9d633d81ab5d47af8e4c27770c7d87c5b1`.

Read chunks:
- [0, 5517): `d37e99c613ed0ee6c37473759317dc9d633d81ab5d47af8e4c27770c7d87c5b1`

Backlinks (literal current Markdown mentions, not authority): none found.

### REPO-SIZE-2026-10.md

Source: [REPO-SIZE-2026-10.md](../notes/REPO-SIZE-2026-10.md); date: 2026-10-02; updates 10-15 and 10-19. Producer: Repository-size workflow measurement and local rewrite-rehearsal producers, unnamed.

Topics: Packed history/type/path breakdown; shallow-clone trap; partial clones; survey-image retention migration; conservative rewrite rehearsal, PR-ref reachability, topology/signature and pack-scope limitations.

Current use and limits: Use to explain why deleting tip images does not reclaim history, and why remote rewrite is not routine. Sizes and ref counts are snapshots; GitHub storage, forks/caches and later changes are outside proof. No purge or rewrite is authorized.

Whole source: 6882 bytes; SHA-256 `fd173bc556b15f40a52e08dc8ce53867b882b3810304c2a62b093109e5a02396`. Manifest whole-source hash matches: true.
Assigned part: [0, 6882) (6882 bytes); SHA-256 `fd173bc556b15f40a52e08dc8ce53867b882b3810304c2a62b093109e5a02396`.

Read chunks:
- [0, 6882): `fd173bc556b15f40a52e08dc8ce53867b882b3810304c2a62b093109e5a02396`

Backlinks (literal current Markdown mentions, not authority): `docs/NOTES-INDEX.md`; `docs/plans/2026-10-04-pwa-shortcuts-calendar.md`; `docs/plans/2026-10-19-deferred-history-cleanup.md`; `scratch/f1-source-restore/docs/NOTES-INDEX.md`; `scratch/f1-source-restore/docs/plans/2026-10-04-pwa-shortcuts-calendar.md`; `scratch/f1-source-restore/docs/plans/2026-10-19-deferred-history-cleanup.md`.

### RULEBOOK-EVIDENCE-2026-10-26.md

Source: [RULEBOOK-EVIDENCE-2026-10-26.md](../notes/RULEBOOK-EVIDENCE-2026-10-26.md); date: 2026-10-26. Producer: System-audit lane R5, PR #3785, for rulebook lane.

Topics: Measured loaded-rulebook token cost and duplication; seven research citations; advisory versus enforced rules; scoped/on-demand placement and proposed budgets.

Current use and limits: Supports concise, single-home rule design. Studies measure output constraints/retrieval rather than long-session obedience; recommended line/token targets are judgment, not measured thresholds. Historical MERGE-HOLD/desk vocabulary does not override current AGENTS.

Whole source: 5502 bytes; SHA-256 `0448b51fa5ef4ad3d34f5777e2036aee369ef1d32558d232bec2eee4e6c1af78`. Manifest whole-source hash matches: true.
Assigned part: [0, 4110) (4110 bytes); SHA-256 `366dbf4ca16baad716ca27b3dbc9cec7c879b8197c6903745438af060e1a79a0`.

Read chunks:
- [0, 4110): `366dbf4ca16baad716ca27b3dbc9cec7c879b8197c6903745438af060e1a79a0`

Backlinks (literal current Markdown mentions, not authority): `docs/NOTES-INDEX.md`; `scratch/f1-source-restore/docs/NOTES-INDEX.md`.

## Path provenance

Raw path-like quotations, including archive/obsolete image paths, scratch evidence and command-shaped references, are separated in [notes-29-paths.json](notes-29-paths.json). Existence checks are literal local checks only; missing names can be generated, historical, shorthand or command text. No archive move or deletion was performed.
