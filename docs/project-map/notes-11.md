# Notes batch 11 — defect ledger evidence map

Read coverage: the entire assigned byte range **[88109, 188109)**, 100,000 bytes, of [DEFECT-LEDGER.md](../notes/DEFECT-LEDGER.md). Ten individually returned source chunks of at most 10,000 bytes were read without truncation. This starts mid-entry (GPU drawing evidence) and ends mid-word during Estoril's resolution; neither boundary is a complete note. Neighbor batches own the surrounding text.

This is historical provenance, not an instruction list or a current defect verdict. The ledger was carved from the architecture review on 2026-09-03; its initial open/fixed framing is repeatedly corrected by later dated entries. Producers are the ledger's anonymous engineering sessions unless the section identifies an owner or team; no individual authorship is inferred. Dates below are reported dates, not fresh verification.

## Integrity

Whole source SHA-256: `53f6d19863da9d78bb7f58619bb022d8d2dbfb1073a6a5eb6a7f06c7df8f5028` (251354 bytes). Manifest whole-source SHA-256: `53f6d19863da9d78bb7f58619bb022d8d2dbfb1073a6a5eb6a7f06c7df8f5028`.

Assigned part SHA-256: `5518c57fa2fb0329fb650018c805081525dac4fc6eedc1b05b2d877d8cf13bf7`. Ranges are UTF-8 byte offsets, end exclusive. Chunk hashes cover exact bytes, including partial lines.

| Chunk byte range | SHA-256 |
|---|---|
| 88109–98109 | 64ee6e6db46ba23742300d01dec3a05b309652f20c94f20d57a2562b024eff69 |
| 98109–108109 | 25ac0739344a7c2856306a01481a84f16a3e808fa25894f2ed742de18088ff0b |
| 108109–118109 | 4d542e6d32be5f4041ecc1d4e34db061259d13006cf35fb174e3910ec7bf1d2d |
| 118109–128109 | 0d3af849a0333570bbd3381cfacc5827eea68e70e137517da7822f5944ff7aa4 |
| 128109–138109 | 591c7c029eae4401f95a70b3d2801991428c684b778907adaa993aa2526d7f58 |
| 138109–148109 | 98ab4b1039e4a0ce53aecb75358d38f29ecf8417a952a3368a4d1cff7e473055 |
| 148109–158109 | af1a0d48fd27f9b45202a936e9fa5fb380d0a1e641034967dc790dc02b71f6a4 |
| 158109–168109 | 03bead5fa375d697aa8ec8d1e2a373e2a63e5ae0bc1565276e39c72d867c40ce |
| 168109–178109 | c48fc2051c65e90a9ac2ba08b5c0747f376ae418fc2c4c67ea554beae4010d8d |
| 178109–188109 | 15014b8ca80566deb686b7d9aadf0f9c90117aa953343416e11bd67211ed5b1c |

Raw historical path mentions are retained separately in [notes-11-paths.json](notes-11-paths.json), including any obsolete/archive references; they are not promoted to current routes.

## Section and note map

All entries backlink to [the source ledger](../notes/DEFECT-LEDGER.md); search its quoted title or distinctive topic. Current interpretation should start with [architecture](../ARCHITECTURE.md), [verification](../VERIFICATION.md), [testing](../TESTING.md), and [physics](../PHYSICS.md), then inspect current code through the normal navigation surface.

### Opening continuation; August–September, corrections through September 22

Producer/owner: Anonymous geometry, UI and audit sessions.

Topics and evidence: GPU errors versus actual drawn pixels; Montreal support foundations; touch/notch HUD scaling; chip-row keyboard navigation; COTA amphitheater declared versus emitted bounds; Indianapolis infield structures; rejected reverse-circuit side-flip inference; fleet vertex caps; bank-aware ground probing; A19 HUD pair coverage; shared CSS zoom; absent CSP.

Use and limits: Use the measured-versus-inferred distinctions and negative hypotheses to avoid repeated diagnosis. Geometry fixes lack some browser remeasurement; reported fixed status is historical. The opening GPU claim lacks its preceding context.

### September 16 — ratchet suite edits its own target

Producer/owner: Ratchet and fidelity-gate engineering session.

Topics and evidence: A real auto-raise call silently raised the ceiling during a guard run; dry-run classification separates testing from intentional commit-hook mutation. A guard must demonstrate that it can fail.

Use and limits: Use for mutation-free test design; no current ratchet execution or ceiling verification was performed.

### September 16 — Monaco continuity coverage

Producer/owner: Fidelity-gate author/session.

Topics and evidence: Three projection mutants survived both twin and measured browser checks; equal adapted-test counts are vacuous. Driving close to the line does not exercise ambiguous projection. Retained open-question mutants prevent evidence deletion.

Use and limits: Use as a test-quality finding, not evidence that projection itself is broken. One locality mutation lacks a measured browser column.

### September 16 — Monaco red flags

Producer/owner: Benchmarking session; race-incidents-control/pit-lane named as product owner.

Topics and evidence: Solid pit walls produced settled debris crossing the red-flag hazard threshold; tyre-curve and pit-definition hypotheses were refuted. Projection spec disables cautions without changing its 5 m floor; VM adapter misses live race-control behavior.

Use and limits: Use to separate subsystem interference from assertion meaning. Test-side fix is recorded; product hazard calibration remained a deliberate owner decision.

### September 16 — coplanar release-train failure

Producer/owner: Train investigation and pit-lane sessions.

Topics and evidence: Six circuit baseline differences; later closure combines audited geometry baselines, hotel support repair, runner-derived menu golden refresh and renderer carve-out. First green train and live build evidence are dated.

Use and limits: Use for release provenance and baseline-review discipline. Historical LIVE status proves only the cited build, not present deployment.

### September 1 — general survey

Producer/owner: General engineering survey session.

Topics and evidence: Reload confirmation, idle ghost serialization, cache-LRU ordering, lap validity, multiple gamepads, gyro listener teardown, query preservation, weather reset and HUD fitting fixes. Remaining storage/cache-generation issues and proposed HUD improvements are separated from fixes.

Use and limits: Use as leads for storage and lifecycle ownership; plausible items and two-generation cache failure need reproduction.

### September 2 — UI round

Producer/owner: Five worktree agents: mobile touch; setup/garage/career; pause/settings/results; menus/accessibility; HUD feel.

Topics and evidence: Sheet density by available room, lap-count snapping, speed stability, redline hysteresis, overtake cooldown, sector arrows, energy contrast and HUD placeholders. A–H follow-up list records gap smoothing/min-height, checked readable states, unresolved hue/blinker/flag layout checks and absent pit indicator.

Use and limits: Use for UI rationale and viewport-specific follow-ups. Several observations are headless or code-only; first-place staging was limited.

### September 1 — deep pass

Producer/owner: Code-reading survey and second-pass session; September 22 errata.

Topics and evidence: Unbounded bank-zone reseating; Singapore and Monaco scenery-frame hypothesis corrections; custom-team seat clash; real-elevation dead-branch claim explicitly refuted by later manifest evidence; Jeddah start-line uncertainty; rescue/relay/cache/SDP/career/standings fixes; rejected incident-lap and ICE-cache defects; boot canary/post retry leads.

Use and limits: Use the errata before repeating a stale claim. Eight circuit bank fracs need per-circuit reference work; browser/network conclusions remain bounded by the stated harnesses.

### August whole-codebase survey

Producer/owner: Whole-tree survey and August 13 cleanup; later corrections.

Topics and evidence: Curvature sign settled as left-positive; incident-owned wall clamp, full-lap scenery spans, scene bearing, title CLS controls, shading parity limits, feed-forward driving policy, assertion-light tests, lapped LIVE rows and planting fixes. Deferred audit backlog includes corrected handshake/SDP claims and remaining telemetry/render/lobby/tool leads.

Use and limits: Use for methodology: controls, first-paint sampling and code-read confidence. Some assertions are superseded elsewhere; survey backlog is not a validated current task list.

### September 10 — cache budgets and extraction globals

Producer/owner: Car-draw and shadow-pass extraction sessions.

Topics and evidence: Garage click stability under slow rendering explained budget-marginal eviction tests; hook-based refitting later reduced time. Shadow extraction lost a lexical lighting binding; false claims about golden coverage were disproved by clean controls. Global registry caught the dependency; mutable objects versus rebindable state require different capture rules.

Use and limits: Use for module extraction and test-premise design. Recorded timings describe one machine and era, not portable budgets.

### September 10 renderer/Metal investigation, runs through 3515

Producer/owner: Renderer diagnostics session and CI runners.

Topics and evidence: Successive diagnoses cover moved tuner paths, scale/tier pinning, skid stamping hidden behind cockpit drawing, field motion, late asset uploads, post-path captures, default-framebuffer readback, GPU context wedges, single-worker stability, env-probe present counts and state-only headless tests. Fog-glow test is rewritten to compare knobs in one held scene.

Use and limits: Use the full correction chain: early hardware/tier/field/pack explanations were repeatedly refuted. Some intermittent capture findings remain open; software passes cannot establish hardware behavior.

### September 18 steering assertions; September 22 correction and rollback

Producer/owner: Input test investigation; PRs 206/207 and shared-train sessions.

Topics and evidence: Separate ages of symmetry and curvature-drift failures; sign convention exposed outward steering and off-road measurement. Shorter on-road hold preserves speed/floor. Shared-page assist restore and field interference break isolation; failed road-follow fixes changed control flow or leaked state. Pages repeatedly selecting unpublished flaky specs forced restoration of last published spec.

Use and limits: Use for isolation diagnosis, current-vs-reverted status and nightly job-level evidence. Sign fix/re-time were held back/reverted in this narrative; symmetry later green is recorded. Do not treat the prose claim that both halves were fixed as final deployed state.

### Section 8 — backlog; mixed dates, additions September 30

Producer/owner: Architecture/structure panel and cleanup sessions.

Topics and evidence: Extraction by boundary crossings; shared math, elevation drawing, tilt pipeline, mobile detection, cross-tab invalidation and assertion-audit resolutions. Remaining tuner mirrors, shared state migration, manual visual baselines, owner decisions on dormant exports and CSS collapse ordering.

Use and limits: Use to understand architecture tradeoffs, not to adopt historical line counts or saturation claims. Export catalogue was partly wrong-lineage; verify consumers before deletion.

### Post-backlog undated notes with September 10–15 evidence

Producer/owner: Renderer, garage audio and input remeasurement sessions.

Topics and evidence: TLX skid failure has corrected CI-coverage claim and is superseded by later cockpit-root-cause account. Garage double blip combines duplicate selection and synthetic camera-click sounds. Quiet isolated gamepad reruns refute earlier button-path diagnosis; speed slider reruns expose hardcoded curved test position, including a passing relative comparison masking systematic error.

Use and limits: Use reporter discriminators and isolated controls; do not reopen superseded failures from early paragraphs. Live renderer evidence and fixed-tick simulation failures require different explanations.

### September 22 — Estoril emitters; same-day resolution (partial)

Producer/owner: Estoril scenery investigation around PR 188.

Topics and evidence: Uniform scenery shift measured against emitted spans, mixed authoring frames, twelve misleading emitter names and two suppressed models. Resolution renames by actual placement; removing scenery start shift improves coplanarity but worsens float/clip counts.

Use and limits: Use for coordinate-frame diagnostics and why arithmetic-only moves were withheld. Assigned part ends inside the measured cost list; consult the continuation before drawing a final outcome.

