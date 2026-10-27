# Notes batch 08 — historical evidence map

Read 2026-10-27. All 100,000 assigned bytes in group `08` of [notes-batches.json](notes-batches.json) were read in 16 individually returned, untruncated source chunks of at most 9,000 bytes. Offsets are half-open UTF-8 byte intervals. Ceiling history continues batch 07; the selection plan continues batch 09.

These records are historical provenance, not command authority. Current use means documentary navigation, not verification of current implementation. No historical commands, runtime, network, browser, tests, product-source edits or commits were performed. Consult [AGENTS.md](../../AGENTS.md), [TESTING.md](../TESTING.md), [ARCHITECTURE.md](../ARCHITECTURE.md) and current owning code before acting.

## Whole / part / chunk SHA-256 ledger

### P1: [CEILING-HISTORY.md](../notes/CEILING-HISTORY.md)

- Whole: 254073 bytes; SHA-256 `2f1510686d55c4eb70c08ad9b2f65b3dc4e7bb406931564440d70b857415e5f5`.
- Manifest whole SHA-256: `2f1510686d55c4eb70c08ad9b2f65b3dc4e7bb406931564440d70b857415e5f5`; matches current whole: `True`.
- Assigned: `[252113,254073)`, 1960 bytes; SHA-256 `bae1cf4e4d0d48b5a827f4b2cccdc806327baa1928757c9a84d2eae6a2087bb3`.
- Read chunk `[252113,254073)`: 1960 bytes; SHA-256 `bae1cf4e4d0d48b5a827f4b2cccdc806327baa1928757c9a84d2eae6a2087bb3`.

### P2: [CHECKJS-ROLLOUT-2026-10-18.md](../notes/CHECKJS-ROLLOUT-2026-10-18.md)

- Whole: 3271 bytes; SHA-256 `762a79425387dd5f779c9d35ea060bebca0144cf3ce37dbf95f1d90a716f2275`.
- Manifest whole SHA-256: `762a79425387dd5f779c9d35ea060bebca0144cf3ce37dbf95f1d90a716f2275`; matches current whole: `True`.
- Assigned: `[0,3271)`, 3271 bytes; SHA-256 `762a79425387dd5f779c9d35ea060bebca0144cf3ce37dbf95f1d90a716f2275`.
- Read chunk `[0,3271)`: 3271 bytes; SHA-256 `762a79425387dd5f779c9d35ea060bebca0144cf3ce37dbf95f1d90a716f2275`.

### P3: [CHROME-DEVTOOLS-MCP-AUDIT-2026-10-26.md](../notes/CHROME-DEVTOOLS-MCP-AUDIT-2026-10-26.md)

- Whole: 3629 bytes; SHA-256 `a95111f92f54d6683ee4781b17993e1af17199059088f090684c38470c53835f`.
- Manifest whole SHA-256: `a95111f92f54d6683ee4781b17993e1af17199059088f090684c38470c53835f`; matches current whole: `True`.
- Assigned: `[0,3629)`, 3629 bytes; SHA-256 `a95111f92f54d6683ee4781b17993e1af17199059088f090684c38470c53835f`.
- Read chunk `[0,3629)`: 3629 bytes; SHA-256 `a95111f92f54d6683ee4781b17993e1af17199059088f090684c38470c53835f`.

### P4: [CI-CAPACITY-2026-09-29.md](../notes/CI-CAPACITY-2026-09-29.md)

- Whole: 12126 bytes; SHA-256 `7989ed65b01aeb2e407553f70a6c08db54da04871399c89b300631e8f5704465`.
- Manifest whole SHA-256: `7989ed65b01aeb2e407553f70a6c08db54da04871399c89b300631e8f5704465`; matches current whole: `True`.
- Assigned: `[0,12126)`, 12126 bytes; SHA-256 `7989ed65b01aeb2e407553f70a6c08db54da04871399c89b300631e8f5704465`.
- Read chunk `[0,9000)`: 9000 bytes; SHA-256 `5ef687e9f49ba5cdd7f5177c553af845aa2bd259392b31a90a1f719cee2ee17b`.
- Read chunk `[9000,12126)`: 3126 bytes; SHA-256 `da9f156c7ab649df2396ab845ba0c7c2995963f118854a13a651eb5c74c0bc5a`.

### P5: [CI-CLOG-SURVEY-2026-10-15.md](../notes/CI-CLOG-SURVEY-2026-10-15.md)

- Whole: 23863 bytes; SHA-256 `4c876c98d271346c036b498e48cc7b3ef23f242ec4da1148286375650679e848`.
- Manifest whole SHA-256: `4c876c98d271346c036b498e48cc7b3ef23f242ec4da1148286375650679e848`; matches current whole: `True`.
- Assigned: `[0,23863)`, 23863 bytes; SHA-256 `4c876c98d271346c036b498e48cc7b3ef23f242ec4da1148286375650679e848`.
- Read chunk `[0,9000)`: 9000 bytes; SHA-256 `89a4f41d729d75295068e002802c49d5595af9cdc40070def5a1db7d3eedd70a`.
- Read chunk `[9000,18000)`: 9000 bytes; SHA-256 `88e98fba14e335181b73c69f6bf5bfa2252cdfe9bfa9a6c7a6c774177c4d417e`.
- Read chunk `[18000,23863)`: 5863 bytes; SHA-256 `264a2c46c4a3d664c0218cae37bd36381ad6dd4ecac9cebfe6c022a414c0b8aa`.

### P6: [CI-MERGE-BURST-2026-10-03.md](../notes/CI-MERGE-BURST-2026-10-03.md)

- Whole: 4297 bytes; SHA-256 `f78a384359d3e40ddd99b2ab53e826cad0b7faf546eec14900f6cb950a828423`.
- Manifest whole SHA-256: `f78a384359d3e40ddd99b2ab53e826cad0b7faf546eec14900f6cb950a828423`; matches current whole: `True`.
- Assigned: `[0,4297)`, 4297 bytes; SHA-256 `f78a384359d3e40ddd99b2ab53e826cad0b7faf546eec14900f6cb950a828423`.
- Read chunk `[0,4297)`: 4297 bytes; SHA-256 `f78a384359d3e40ddd99b2ab53e826cad0b7faf546eec14900f6cb950a828423`.

### P7: [CI-RENDERING-PERFORMANCE.md](../notes/CI-RENDERING-PERFORMANCE.md)

- Whole: 49602 bytes; SHA-256 `ee805d8db3c949fff1a8757d3a1cd2620153a9c0065c056cfb6476a76dc16593`.
- Manifest whole SHA-256: `ee805d8db3c949fff1a8757d3a1cd2620153a9c0065c056cfb6476a76dc16593`; matches current whole: `True`.
- Assigned: `[0,49602)`, 49602 bytes; SHA-256 `ee805d8db3c949fff1a8757d3a1cd2620153a9c0065c056cfb6476a76dc16593`.
- Read chunk `[0,9000)`: 9000 bytes; SHA-256 `6cb80b66ed7c0321e4bc73b3e3600b0d07a4e6a68406e073c648642477eb820b`.
- Read chunk `[9000,18000)`: 9000 bytes; SHA-256 `fc838a54c27b873f4d03da5221bbc27f81036393841d0cf9b37c087aff9acd1a`.
- Read chunk `[18000,27000)`: 9000 bytes; SHA-256 `8980af95f6118674d76024b59b6a68f51bf98af549974f617728adb41c1d99c0`.
- Read chunk `[27000,36000)`: 9000 bytes; SHA-256 `680c5c17b0daedf90e9f0010458fd39ae771e7444afeb94060e4ee9b54a1eca7`.
- Read chunk `[36000,45000)`: 9000 bytes; SHA-256 `a391bb3557efc73211c7a7a77995704a7663a6f6afb91521e0815539eca07572`.
- Read chunk `[45000,49602)`: 4602 bytes; SHA-256 `9892725ab499bad58e799b52d4b7fd96778bc959b13c8a33b0d2cc141e55fc24`.

### P8: [CI-SELECTION-PLAN-2026-10-16.md](../notes/CI-SELECTION-PLAN-2026-10-16.md)

- Whole: 15259 bytes; SHA-256 `e0084f4ba7bd3817f2b53475dd7523394f521ae1fb8e40f74d0ed8d267eb5b83`.
- Manifest whole SHA-256: `e0084f4ba7bd3817f2b53475dd7523394f521ae1fb8e40f74d0ed8d267eb5b83`; matches current whole: `True`.
- Assigned: `[0,1252)`, 1252 bytes; SHA-256 `1396f6239465d9bf3d88bd78d5415b76e0def00457b3b5799efdfb2a54136fbb`.
- Read chunk `[0,1252)`: 1252 bytes; SHA-256 `1396f6239465d9bf3d88bd78d5415b76e0def00457b3b5799efdfb2a54136fbb`.

## Semantic map, producers and evidence boundaries

### P1 — Ceiling history, final entries only

Date/producer: 2026-10-20 entries by the sculpted-concept and garage-research branch authors, unnamed here; PRs #3172 and #3188 identify the work. The assigned tail starts inside an earlier auto-lower correction: duplicate fragment accounting restored the true count rather than recording code growth. Three complete sections then record car3d growth: +66 for four STYLE recipes and flank/nose paint; +40 lineage allowance for six study-body profiles and +37 net geometry; +9 absorbed lines for shared concept defaults across body styles. Reasons for retaining build-local emit closures and sparse geometry triangle limits are preserved.

Backlinks/current use: [PHYSICS.md](../PHYSICS.md), [NOTES-INDEX.md](../NOTES-INDEX.md) and the ratchet fragments named in the source connect this ledger to growth accounting. Use to explain those specific historical allowances and avoid stacking another branch's raise. Limits: the earlier ceiling ledger is outside this batch; historical line/triangle counts are not current budgets, and these entries grant no new raise.

### P2 — Opt-in checkJs rollout

Date/producer: 2026-10-18, implementation author unnamed; Bryce's quoted request supplies original authorization provenance. How it works explains the separate config name preserving the apex-lsp whole-JS project, parse-versus-report behavior with opt-in comments, explicit noEmit checker, strict-null findings and cheap starter modules. Opt a file in covers JSDoc, ambient globals and test pins. Rollout order starts physics, then track, while game/render await façade modeling. What NOT to do preserves plain-JS/no-build boundaries and rejects ignore-based suppression. References identify TypeScript documentation; Bite proof records a reverted string-versus-number mutation caught by TS2363.

Backlinks/current use: [NOTES-INDEX.md](../NOTES-INDEX.md); named configuration, checker, ambient declarations, starter test and game-context contract are documentary producer/consumer anchors. Use for design rationale when extending opt-in coverage. Limits: checker speed and mutation proof are dated claims; no checker or source inspection was performed here, and historical rollout instructions are not an assigned change.

### P3 — Chrome DevTools MCP pin audit

Date/producer: A·W62, read-only audit 2026-10-26 for issue #3509. State found records the already-shipped 1.7→1.11 upgrade at 8f549115, patch retirement and fail-closed version gate, schema dialect/pageId changes and updated assertions. The 1.12 delta covers heap pagination, dialog-blocked evaluation, rejection reasons, per-page parallelism and snapshot behavior. Recommendation and tracker explicitly leave 1.12 live boot and skill/caller audit undone, retaining 1.11.

Backlinks/current use: [NOTES-INDEX.md](../NOTES-INDEX.md), [AGENT-SURFACE.md](../AGENT-SURFACE.md), issue #3509 and upstream changelog link pin provenance to wrapper/runtime gates and pin tests. Use to distinguish shipped 1.11 evidence from unverified 1.12 possibilities. Limits: upstream release facts were read by the producer, not fetched here; the recommendation is dated and the unchecked tracker is not proof of present incompletion.

### P4 — CI capacity and September 29 jam

Date/producer: 2026-09-29 investigator, unnamed; GitHub API run/job logs across September 27–29 and bot timing branch supply measurements, followed by September 30 and October 14 amendments. What clogged distinguishes 20-slot saturation and queue latency from real work, with cancellation costs. Selector diagnosis isolates stale SwiftShader priors, unavailable timing samples, pessimistic shard timeouts and declared-slow exclusions. Other costs covers redundant trains, timing workflow triggers, census timeouts and merge-order generated-count reds. What changed records timing overlay, packing/budget, circuit routing, node/smoke slimming and workflow trigger changes. Not done here becomes a dated implementation journal: circuit-scoped sweeps, fixed verdict name, node-plan narrowing, required-check changes, advisory generated figures, six slices, circuit dependency inference and green-base incremental train gating. Re-measuring defines API windows and queue wait.

Backlinks/current use: [TESTING.md](../TESTING.md), [NOTES-INDEX.md](../NOTES-INDEX.md), [2026-09-30-test-ci-health.md](../plans/2026-09-30-test-ci-health.md) and sibling merge/clog notes. Use to explain why selection is measured and circuit scoped, and why queue latency differs from runtime. Limits: 20 slots is explicitly historical; 40/5 is the October amendment, not a fresh account check. Required-check and train-shape history is subsequently superseded; historical setting advice is not current policy.

### P5 — October 15 CI clog survey

Date/producer: unnamed Actions investigator, API sample 00:00–05:30 UTC 2026-10-15, workflow/source review and dated GitHub documentation; later fix/rebalance/settings amendments are included. §1 maps workflows and job starts; §2 quantifies run volume, queue waits, external cancellation bursts and sync-heavy demand. §3 ranks slot saturation, sync/cancel multipliers, plumbing hops and frozen check names. §4 compares behavior changes, folding jobs, required-check simplification and workflow splits. §5 orders recommendations and three remeasurement metrics. §6 records the folded plan/filter jobs, checkout-free aggregator, needed-only rows, then-owner settings changes, browser lanes and single-worker fat UI shards. §7 traces runner-measured per-script costs, rider redistribution, VM halves, projections and later measurements; it explicitly corrects local-versus-runner assumptions. §8 records repository merge flags, ruleset/protection access limits and the single-CI-check transition.

Backlinks/current use: [NOTES-INDEX.md](../NOTES-INDEX.md), [TESTING.md](../TESTING.md), Actions audit and CI capacity/merge notes; named node planner, selector, CI verdict and workflow are consumers. Use for causality behind folded jobs, FIFO browser lanes and measured slice ownership. Limits: live settings were read only at the stated time and protection returned 403; projections differ from measurements. Queue-hold and desk-cap proposals are historical, while current AGENTS owns policy. The archived/deleted helper is data, not a current Markdown target:

```json
{"historicalHelper":"ready-full-cap (deleted, #3013)","historicalApiProducer":"api() helper"}
```

### P6 — October 2/3 merge burst

Date/producer: unnamed incident investigator, October 2/3, amended October 6 and explicitly partially superseded October 26. What happened ties 30 merges and ~750 queued jobs to a stale live site and tip-only pokes. What changed records ship-fast coalescing, superseded-green pokes, merge pacing and later desk cap. What did not change separates per-PR replacement from no-cancel train semantics; remeasurement connects live SHA lag and workflow summaries.

Backlinks/current use: [TESTING.md](../TESTING.md) Release train, [NOTES-INDEX.md](../NOTES-INDEX.md), CI capacity note and GitHub concurrency/queue sources. Use as incident provenance for coalescing release work. Limits: ship-fast was removed October 16; desk helper is deleted. The explicit supersession prevents treating the old design or merge pacing as current authority.

### P7 — CI and software rendering research journal

Date/producer: unnamed renderer/CI investigators, external research beginning August 2026 plus repository/container probes dated August 17/28, September 1/3/8/10/15/16 and October 10/14/26 amendments. Opening separates external hypotheses from repository measurements and links operator-speed notes. Part 1 compares SwiftShader, Lavapipe and llvmpipe, then corrects environment applicability: August speed evidence did not reproduce in the September microVM. No-hardware section distinguishes software validation from skipped hardware content paths; forced-gate bisect traces env-probe attachment-key errors. macOS census identifies real Metal, flag/binary traps, verdict gates, found defects and baseline presentation costs. Cloud-environment notes explain dependencies and later committed bootstrap. Sharding section is explicitly superseded by four measured llvmpipe shards. WebGPU platform section updates availability while retaining feature-detection and shader-maintenance costs; Sources separates external support claims.

Part 2 separates external Safari limits from actual vertex/byte arithmetic: Vegas prop upload and transient JS arrays motivate a ratchet, device measurement and instancing. Instancing reduces stored duplication and CPU submission, not shaded triangles. Part 3 preserves measurements supporting AGENTS: missing browser signatures, soft-present readback discipline, bootstrap/catalog limitations and backend probe paths. Later sections explain why differing TLX presentation paths invalidate performance comparisons, correct blanket headless-shell claims with September 15 compute/render execution evidence, document validator parsing fixes and fresh-generation capture, and distinguish exact-tree hardware dispatch/push requests. October 14 menu/menu-full entry adds player-path preparation, long-animation-frame attribution and warm-request-aware race gating.

Backlinks/current use: [AGENTS.md](../../AGENTS.md), [TESTING.md](../TESTING.md), [DEBUG-HOOKS.md](../DEBUG-HOOKS.md), [WEBGPU-PARITY.md](../research/WEBGPU-PARITY.md), [PLATFORM-INPUT-NOTES.md](../research/PLATFORM-INPUT-NOTES.md), [NOTES-INDEX.md](../NOTES-INDEX.md) and scene-graph/architecture research link the journal to probe and census consumers. Use to interpret software/hardware evidence, presentation-path mismatches, environment-specific numbers and memory arithmetic. Limits: no contemporary hardware, pixel or speed proof is asserted. External figures are not repository measurements; software FPS is not player performance. Several older assumptions are corrected later within this same note, including shell capabilities, bootstrap and sharding. Historical archive tool names remain JSON provenance rather than live documentation links:

Historical path data retained in [notes-08-provenance.json](notes-08-provenance.json).

### P8 — Selection plan, opening only

Date/producer: October 16, unnamed investigator responding to Bryce's request; third pass after CI/CD review and jobs review. Opening defines measured versus estimated evidence and scaling assumptions. The assigned Plan prefix marks runner-load, 160-merge selector replay, 2,097-run catch classification and literature research complete; records Bryce's D1/D2/D3 decision provenance; leaves P1 node overlap and P2 inherited-red work open; ends midway through P3's completion entry at PR #2575.

Backlinks/current use: [NOTES-INDEX.md](../NOTES-INDEX.md), sibling CI/CD review notes and continuation in [batch 09](notes-09.md). Use only for audit scope, evidence labels and plan lineage. Limits: the actual load tables, proposals, decisions' details and later statuses lie beyond byte 1252 and are not mapped by this assignment. No present completion or current selection policy can be inferred from this prefix.
