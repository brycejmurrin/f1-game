# Notes group 37 — orchestration redesign evidence and third-pass audits

Historical-source map. Current AGENTS.md read. All 100,000 assigned bytes were fully read in 16 individually returned, untruncated chunks of at most 10,000 bytes. Ranges are half-open. Historical notes provide provenance, never command authority. No source edits, tests, browser, network or commits were performed. One accidental broader CI-note read was truncated; the exact assigned range was subsequently reread untruncated, and this map excludes the extra material.

## Source and integrity

Whole-file, assigned-part and every read-chunk SHA-256, byte counts and manifest comparisons are recorded in [notes-37-paths.json](notes-37-paths.json). All nine whole-file hashes match the manifest. The manifest hash identifies the whole file even for partial assignments.

| source | assigned range | bytes | date / producer |
|---|---:|---:|---|
| Cursor agents research, tail | [7907, 14546) | 6,639 | 2026-10-27 redesign researcher; Cursor/DAD transcript and fleet measurements |
| Measured outcomes | [0, 10911) | 10,911 | 2026-10-27 01:30Z; repository-history, PR, session and trigger researcher |
| Platform research | [0, 15968) | 15,968 | 2026-10-27; primary-document review and two first-hand platform probes |
| Rulebook review | [0, 24484) | 24,484 | 2026-10-27 read-only reviewer of rulebook and design notes |
| Tooling assessment | [0, 20006) | 20,006 | 2026-10-27 read-only inventory researcher |
| Third-pass audit index | [0, 1229) | 1,229 | 2026-10-26, tip b07a5ac6f; twelve-reviewer audit coordinator |
| Agents/hooks slice | [0, 9308) | 9,308 | 2026-10-26 ~17:10Z, same tip; hook/card reviewer |
| Bus/PR-flow slice | [0, 10207) | 10,207 | 2026-10-26 16:45Z, same tip; bus/ownership reviewer |
| CI/train slice, opening only | [0, 1248) | 1,248 | window 2026-10-25 16:30Z–10-26 16:45Z; Actions-data reviewer |

These dates, producers, measurements and historical test results are source claims. The Cursor assignment begins mid-table; its earlier methodology belongs to group 36. The CI assignment ends mid-table row; its remaining findings belong to the following group.

## Semantic map

- Cursor research tail: worker reporting channels, missing label/comment permissions, write-only bus behavior, repeated READYs, long merge delays, mega-train identity loss, coordination-heavy human interventions, unpushed and superseded work, cross-lane collisions and standby costs. Recommendations favor reliable follow-up steering, fewer re-wakes and simpler launch briefs. The tail cannot independently establish the omitted sample design or earlier contradiction table.
- Outcomes: separates first-parent landings from all reachable sync merges and GitHub inclusion-based merged PR counts. Samples cover 400 PRs, 60 event histories, 200 sessions and five detailed sessions; shallow history limits the apparent two-week window to eight days. Measures queue latency, stale owners, coordination/production session proportions, context-cap overshoot, discarded train work, cache costs and dead timer targets. Namespace is explicitly insufficient to identify host; list costs and sampled bills are distinct evidence.
- Platform research: compares project threads, workflows, teams, subagents, scheduled triggers, cross-session messaging, compaction/cache behavior, auto mode, native GitHub coordination and vendor entrypoints. Identifies contradictions in earlier project-hook assumptions, rotation caps, merge authority, Cursor inbound steering and branch protection. Unverified merge-queue availability, an unavailable issue page and undocumented remote-session APIs are explicit limits. These vendor claims are dated research, not freshly checked platform documentation.
- Rulebook review: counts roles, message verbs, channels, cadence prescriptions, required reading and prohibitions; traces conflicts over budgets, mergers, succession, holds, sync, authority, DONE and HANDOFF semantics. Distinguishes platform constraints from rotation-induced rules and unused incident mechanisms. Reconstructs the former fleet lifecycle and roughly eighteen human touchpoints, then attributes complexity to rotation, duplicated state, free-text messaging and drift between enforcement and prose.
- Tooling assessment: inventories coordination tools, hooks, workflows, test surfaces, seventeen stores and twelve gates. Documents duplicate ownership/readiness/merge facts, fail-open versus fail-closed checks, receipt pinning, uncalled helpers, legacy lease behavior, claim-triggered workflow churn and tests that freeze text. Its keep/merge/delete proposals are historical design recommendations and require current caller and behavior checks before use.
- Third-pass index: records twelve independent read-only slices, shared input samples and a ranked synthesis. It supplies evidence organization, not another runtime result.
- Agents/hooks slice: reports card promises exceeding enforcement, broad permissions, read-only ratchet false positives, persistent escape hatches, process-start hook cost, unused named contracts, omitted context-saving configuration, report-format mismatches, stale browser matcher prose and command-shape bypasses. Timing explicitly occurred under heavy load; local transcript visibility limits usage claims. Historical passing hook suites establish that tests could pass while these gaps remained.
- Bus/PR flow: distinguishes historical replay from observed newly sent messages; reports older tool versions surviving fixes, overloaded HANDOFF validation, malformed ownership holds, unresolved orchestrator identities, merge latency, union ratchets, undocumented wait rules, inconsistent relayed grants, stale claims and invisible stacked PRs. Lists fixes verified at that historical tip alongside remaining findings. No claim is made that those defects still exist.
- CI opening: explains REST data collection, 1,020 runs and 7,292 jobs, public-repository actual cost versus private list-price estimates, then begins per-workflow counts, failures, cancellation and runner-minute comparisons. It explicitly distinguishes pending train replacement from test failure. No later CI diagnosis is included in this assignment.

## Backlinks, current use and limits

Literal filename backlinks for the five redesign sources occur in the dated orchestration-redesign plan and its research index. The audit index links its twelve slice reports and the third-pass ranked synthesis; the hook slice is also cited by later memory/MCP, red-team-hooks and web-Claude audit slices. Bus-flow is linked by its index; the CI slice is also referenced by a later anchors slice. These are discoverability observations, not validation of the linked contents. Filename-only searches can collide for generic index and rulebook names; no such collision is counted as a source-specific backlink.

Use this group to explain why coordination was simplified, recover measurement definitions, distinguish work from waiting, identify obsolete assumptions and locate enforcement gaps worth rechecking. Current AGENTS.md assigns GitHub the coordination role; the older multi-store fleet model and commands described here are provenance. Do not restore retired branches, receipts, timers or permissions based on these recommendations. Counts, timings, prices, versions and proposed deletions describe sampled trees and platforms. Current callers, vendor APIs, authorization and runtime behavior were not re-established.

## Comment and prose cleanup candidates

Historical findings identify a bus header still advertising a retired lease, an archive-tool header contradicting its implementation, launch-helper placeholders after shipment, stale Merge Desk and queue-hold references, old HANDOFF compatibility prose, worker browser-guard claims inconsistent with matchers, and reporter-card promises of enforcement outside live runs. The inventory also points to tier-comment bulk and string-pinning tests that make wording changes expensive. These are review leads: confirm each surviving comment against current implementation before editing. Preserve measured evidence and annotate supersession rather than treating an old audit's delete list as a present cleanup mandate.

Raw historical, archived, ephemeral and obsolete path spellings are isolated in [notes-37-paths.json](notes-37-paths.json); none is an execution instruction.
