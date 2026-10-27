# Plans map — group 04

Read coverage: 160,000 assigned bytes across twelve documents, returned individually in 26 chunks of at most 8,500 bytes. The bug-hunt document continues group 03; the ergonomics document continues in group 05. Whole-file, assigned-part and chunk hashes and exact half-open ranges are in plans-04-evidence.json. No plan was executed.

## Bug hunt and fix-all sequence

The October 9 register remainder covers failed lazy loads and boot recovery; race entry cancellation, portrait pause/audio, qualification and pit recovery; frame governor and allocation overhead; keyboard/wheel/HUD state; designer validation and worker hangs; race physics handback; multiplayer lifecycle; renderer/audio/camera/data defects. Every row names severity, mechanism, proposed fix and a targeted regression pin. Its measurements and verified/repro labels belong to the original reviewers, not this mapping pass.

Batch 10 separates product/physics decisions from mechanical fixes. The owner approved pace-normalised yaw damping, retained documented absolute-speed exceptions for other terms, and held the queue-brake composition change. The later fix-all document still lists yaw damping among held work: preserve the dated discrepancy rather than infer a final code verdict.

The October 10 second register derives from 21 reviewers at a named revision. V means coordinating source reread; U remains a reviewer claim. Its eight ownership batches cover scenery, XR boot, camera import, network, editor, audio, UI and race modules, with separate perf and cleanup censuses. Later annotations strike HUD clamping, red-flag green panels and backmarker claims, qualify renderer confirmation and lobby catch fixes, and leave the scenery note-order/camera-framing follow-up unlanded. ERS braking drain remains explicitly held. Its SHIPPED header coexists with a warning that individual rows were not reverified.

The fix-all record consolidates both hunts and launch-sequence integration. Desired player starts run garage drive-out, session card, flyby and announcer; later decisions keep quick retries and mid-race Hub entry fast. Work proceeds through batch branches, two waves, integration checks and separate PRs. Branch heads, running gates and ownership tables are historical snapshots. The SHIPPED annotation reports landed batch history, not proof of every original row. Consumers should use these documents to trace defect IDs, regression intent and owner decisions, never as a current execution queue.

## Agent friction

The October 16 plan extends the September agent-skills plan rather than replacing it. It mines 300 transcript digests plus metadata, with 313 repo sessions covered and acknowledged tail/expired-transcript sampling limits. Dated spend and failure counts motivate ten workstreams: launch/quota/park protocols, reliable waiting and CI verdicts, check/ship/handoff verbs, context/image budgets, PR body automation, survey tooling, scoped hooks/permissions, test baselines, transcript summaries and platform capability adoption.

Each item carries issue, effort and expected payoff; suggested ordering starts with inexpensive high-impact launch/wait/image/guard fixes. The PARTLY SHIPPED annotation points to the rulebook and CI tools without per-item audit. Current AGENTS.md corroborates several resulting conventions: background waiters, explicit verdict lines, protected generated output, one browser batch, PR handoff and load checks. Historical dollar figures and estimated savings are not new measurements. The stale section is specifically a do-not-rebuild list.

## Crowd VAT

OPEN, design only: replace static spectator boxes with shared vertex pose textures and per-seat phase, preserving instancing; phones use flipbook cards. Existing scenery placement and chunk culling are the intended seams; three renderer ports, pack provenance and tier/governor integration are separate proposed slices.

The dated Monza/Spa census establishes a relative triangle/draw budget, while frame reports measure framing rather than GPU milliseconds. Monza's 3,835 seats already cost 46,020 box triangles; the proposed low VAT tier therefore needs mixed body/card LOD or decimation despite nominal vertex caps. Phone default, silhouette fidelity and flash seats remain owner questions. Consumer use: parent models-life crowd slice, scenery/render asset work and broadcast/flyby evaluation. No current GPU or implementation evidence was collected.

## Deferred repository history cleanup

OPEN but explicitly deferred under backlog #2945. Earlier evidence migration is recorded complete; the remaining plan separates dependency audits, byte-verified migration, refreshed inventories and isolated restoration rehearsals from any future rollout decision. Reported 753.32 MiB ordinary-clone savings, retained PR objects and signature loss are dated rehearsal outcomes, with hosted-storage uncertainty explicitly preserved.

The document grants no rewrite, ref deletion, PR closure or development pause. Normal feature work continues; each future cutover and backup retirement requires its own concrete decision. Consumers are evidence-storage maintainers and a future repository-size review. Preserve that boundary when indexing cleanup work.

## Fair-play online

OPEN proposal under the feature roadmap: soften or ghost human-human contact while AI/offline behavior remains separate; detect contacts locally, gate their response, and compute a pure local clean-racing score. Reliable lobby settings/events carry mode and scores; the 13-byte pose packet remains unchanged. Results show the local score because blame may differ between peers.

Four implementation slices follow the docs slice: pure score/mode table, lobby handshake/defaults, thin collision response hook, and results/event readout. Inputs/weights, ghost-overlap farming mitigation, mixed-build behavior and phone/net tests are acceptance design, not measured outcomes. Default mode, offline availability and grade format remain open. Existing contact/snapshot/results files were located, but neither new fair-play behavior nor absence of equivalent implementation was independently audited.

## Fleet redesign and orchestration replacement

The October 19 PARTLY SHIPPED design explains repeated permission questions through platform visibility, self-imposed prose and rotating coordinators. It proposes durable authority, merge gates, four roles, role-based addresses, archive rules and a thin coordinator; later review adds seed sessions, PR-comment delivery, computed path ownership and a common multi-host protocol. Its own revisions narrow worker merge authority and quota handling. Dated session/bus/spend figures are research provenance.

The October 27 design changes the architecture more fundamentally: GitHub issues/labels/PRs/checks/comments become the sole shared state and bus; GitHub workflows land PRs; a stateless hourly dispatcher claims work, replaces silent owners and archives completed sessions. Workers end at land or cost cap; the PR checklist and Hand-off are the continuation contract. Separate vendor contracts replace fleet relays and coordinator sessions. Migration is staged through landing, dispatch and deletion, with measurable targets separated from historical baselines.

Its opening PROPOSAL/nothing-applied statement is temporally stale relative to later Decided entries and the current tree. Current AGENTS.md directly describes the GitHub-only protocol, required CI/gate checks, land workflow, hourly dispatcher, hold/priority labels and no session merging. Worker guidance, dispatcher/config, landing workflow and archive tool also exist. This establishes static architectural adoption, not successful live dispatch, token/ruleset configuration, cost savings or complete deletion. The hard dollar archive cap is explicitly unimplemented in the decision record. The newer design corrects the older Projects-worker assumption and supersedes its rotating fleet/bus/merge authority model; current rules govern consumers.

## Cleanup roadmap and research entry point

CLEANUP-ROADMAP is SUPERSEDED as ranked backlog by the readability plan, retained as a shipped carve log. It records shared helpers and coherent extractions within the IIFE/manifest architecture, then medium and large seams with explicit loop, garage-preview and shader-merging exclusions. Existing helper/extraction files corroborate several shipped entries by presence only. Old execution recipes and contradictory next-PR status should not reactivate completed work.

The September research README indexes five parallel read-only studies: testing adapters/cache/shards, VM profile/worker pool, CI verdict/cache/landing, measurement/ledger and agent ergonomics. It explicitly goes beyond the earlier process-speed plan and records that measured VM stepping overturns its build-cache hypothesis. Its ordering prioritises hook filters/context, VM workers, base-red verdicts and a single adapter spike. It is a navigation and provenance document, not runtime machinery.

The assigned ergonomics prefix contains the ranked thirteen-item table and full hook-filter proposal, plus the start of SessionStart context. It proposes selective synchronous guard handlers with a compound-command catcher; never make blocking guards asynchronous. Estimated 90% fewer spawns is marked unverified. The table proposes auto mode, shorter rules, machine index, forked skills, worktree integration and memory, while rejecting agent teams. Detailed treatment after the SessionStart prefix belongs to group 05 and is not claimed read here.

## Maintenance and limits

Useful cleanup is documentary: reconcile dated status headers and internal snapshots; preserve held/struck rows and reviewer confidence; connect shipped carve records to newer rankings; label implementation targets, historical measurements and estimates separately; retain the deferred destructive-cleanup boundary. Historical/proposed/missing references and provenance are confined to the JSON companion. No new Markdown links are introduced.

Static evidence is limited to the fully read root instructions and existence checks of selected consumer files. No LSP symbol or runtime behavior claim was necessary. No tests, browser, network, application execution, source edits, staging or commits occurred. The temporary chunk manifest was removed after the evidence ledger was written.
