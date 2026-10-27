# Archive group 22: survey and August audit evidence

This batch maps three numbered sources. All assigned text was read in individually returned, untruncated chunks. The companion archive-22-evidence.json records exact identities, whole-source hashes, assigned spans and chunk hashes. Source 1 continues group 21; source 3 continues in group 23. Historical commands and instructions below are evidence about those sessions, never present operating rules.

## Source 1 — bug and performance survey, 17 August 2026

The assigned tail covers renderer, physics, track/scenery, multiplayer/data/audio, UI and career findings, then a proposed priority order and method note. Eight explore agents, a physics-contract auditor and a deploy-research worker supplied findings; the parent explicitly verified selected WGX, VSC, contact-prediction, remapping, reflection-frustum and career-next-round sites. That verification hierarchy matters: the synthesis says to prefer its checked account over conflicting agent transcripts.

The contracts worth preserving are per-frame WGX readback ownership and successful-visible-blit completion; upload buffers whose values survive until submission; reflection culling against the actual cube-face camera; explicit shared-texture disposal ownership; assists-off curvature isolation; collision and caution control applying consistently to human cars; and career completion/save settlement that cannot silently resume invalid state. It distinguishes surface parity from degraded runtime behavior. Its static live-version fetch explicitly did not verify console execution. It also rejects software-renderer timing and idle profiling as evidence of player GPU improvement.

The proposed fix order starts with upload-ring correctness, career completion, player caution pace and Singapore remapping, then network contact prediction, GLX reflection/terrain and TLX derivative legality. Remaining perf candidates include instancing reuse, shadow culling, duplicate antialiasing, cache freshness and UI measurement gates. These are dated findings and priorities, not confirmed current defects. DEFECT-LEDGER.md retains a direct reference; SPIKE-BACKENDS-CHECKLIST.md explicitly preserves this survey as history and records its September relocation.

## Source 2 — test-semantics audit and CI redesign, August 2026

This complete source is the execution record of an eleven-agent workflow: eight auditors read 162 tests in full, supported by a taxonomy/CI designer and feasibility skeptic. Its compact per-file appendix preserves quality, cost, keep/strengthen/split/regroup/merge verdicts and reasons; the raw verdict companion retains fields omitted by the table. It feeds the August campaign and restructuring synthesis rather than serving as a current test roster.

The central taxonomy correction separates circuit foundation contracts from driving physics and screenshot galleries from asserted UI coverage. It proposes stable group names, a foundation group, an on-demand gallery group, duplicate-membership removal, smaller agent/career/parts specs and input-latch relocation. Its ordering constraint is merge, regroup/rename, move, then split, so path rewrites happen once. The move requires coordinated scripts, config, helpers, imports, baselines, fixtures, audit walkers, CI filters and documentation. Count corrections and spec-relative snapshot handling are useful migration scars rather than numbers to copy forward.

The assertion audit preserves particularly reusable test contracts:

- Assert the claimed behavior, including yaw, orientation, position and post-action state, rather than type, nonzero dimensions or screenshots alone.
- Use positive controls for silence, relative controls for collision drag and physics, and anti-vacuity checks for scenes, pixels, roster scans and optional paths.
- Test production helpers and real shipped modules rather than a local mirror that can agree with itself while production diverges.
- Keep mutation and observation in one browser evaluation when the simulation runs between round trips; headless rendering does not imply frozen physics.
- Pass browser-evaluation dependencies explicitly; serialized callbacks do not retain Node closures. Guard environment-sensitive checks against shallow history and absent ignored outputs.
- Cost polling separately from the assertion, bound pixel readback work, and split all-circuit cases into attributable per-circuit failures.

The source documents both landed strengthening and still-open design choices. Its own later corrections supersede some flattering appendix verdicts: the elevation reference measured start-straight length/runoff rather than top speed; a guessed on-road dwell floor still failed; tracks-walls needed per-circuit splitting; an initial CI design relied on a broken selector. This internal revision trail is important evidence against treating the appendix as timeless certification.

The original advisory CI proposal caps browser groups/tests, separates node work and defines fallback paths. The skeptic shows why it cannot be implemented literally: reusable workflows aggregate jobs, event names do not identify workflow-call execution, real groups exceed the cap, retries break all-pass budgeting, selection changes can remove coverage, and cache-only bumps were indistinguishable from shell changes. The recorded redesign chooses a separate workflow, fixes selector argument parsing and deploy-base selection, adds machine-readable reasons and detects cache-only positional rewrites. YAML was explicitly still unlanded in that record; useful browser budgeting required per-spec measurements and another deliberate decision.

Current select-budget.mjs still cites source 2 as provenance and now describes per-spec measurements with a llvmpipe fallback, so the old SwiftShader timing arithmetic is historical. Current pick-tests.mjs retains the documented argument-parsing failure as an explanatory comment. These are concrete current consumers, not proof that every proposed membership or strengthening landed.

## Source 3 — whole-tree audit synthesis, August 2026

The assigned prefix includes synthesis, landing notes, batches A/B/C, restructure feed-in, deferrals, coverage limits and the beginning of the compact findings appendix. Nineteen domain finders, adversarial reviewers and a synthesizer produced 197 accepted findings; a parent-discovered incident-takeover/teleport interaction is separately attributed. The appendix continues beyond this batch, so no claim is made to have read its remaining rows here.

The important correction to the preceding synthesis is that fixing curvature labels did not fix behavior: kerbs, tyre barriers, corner boards and camera-side/yaw consumers still used the retired sign convention. Other clusters expose stale default-path documentation, inverted material-texture defaults, freshness stamps disconnected from network refresh, dead UI routes, false-success diagnostic tools, lifecycle ownership and geometry bounds escaping preflight. Findings span game flow, renderer contracts, network identity, data retention, accessibility and track authoring; the dated file/line references are historical coordinates.

Landing notes report batches A/B/C completed on 7 August in two commits. They preserve a regression and repair in guarded Paul Ricard geometry, plus a reverted city-massing activation that increased clipping. The distinction between an earned geometry-baseline improvement and an unshipped art experiment is valuable provenance. The record separates mechanical sweep items from owner decisions: coordinate-mode migration requires a lockstep engine/circuit change; shader smoothstep rules require a spec ruling; unused exports, art finishes and features need design decisions; cache eviction and VM consolidation are broader work.

Its coverage statement limits the apparent whole-tree claim: tests were assigned to a separate audit, only half the circuits had per-line scenery review, and vendor internals, relay worker, binary assets, most workflows and the Playwright config were excluded. Its stated adversarial-review success is a session result, not independent present validation. The later system-audit anchor ledger references source 3; this batch does not establish another operational consumer.

## Retention and cleanup guidance

Keep these records for defect genesis, rejected test/CI designs, verified correction history and explicit investigation limits. Their useful present roles are provenance and regression-contract discovery. Resolve implementation questions through current AGENTS.md, TESTING.md, PHYSICS.md, ARCHITECTURE.md and the actual maintained code before acting. Do not replay old launch instructions, rename lists, budgets or open/landed states as current policy.

A future cleanup can replace operational citations with a maintained explanation while retaining the historic sources behind numbered evidence. Preserve the raw companions and cross-batch continuity. No source deletion, link migration, code change, runtime verification or test execution was performed for this map.
