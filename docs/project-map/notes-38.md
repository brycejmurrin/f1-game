# Notes map — group 38

## Scope and integrity

Historical provenance only: these reports describe sampled trees, sessions and platform behavior, not current code authority. All 100,000 assigned bytes across twelve half-open parts were fully read in thirteen individually returned, untruncated chunks of at most 10,000 bytes. Whole-file, assigned-part and chunk SHA256 values, manifest comparisons, literal backlinks and historical path spellings are recorded in `notes-38-paths.json`. Every whole-file digest matches the batch manifest.

| Source topic | Assigned range | Bytes | Date and producer |
|---|---|---:|---|
| CI/train tail | [1248, 10113) | 8,865 | Third-pass Actions-data reviewer; 2026-10-26 window ending ~16:45Z |
| Docs, notes, memory | [0, 8853) | 8,853 | Read-only documentation/memory reviewer, 2026-10-26 |
| Environment, scheduled tasks, hosts | [0, 9222) | 9,222 | Read-only environment reviewer, 2026-10-26 ~16:45Z |
| Game-code engineering health | [0, 8013) | 8,013 | Read-only engineering reviewer, 2026-10-26 ~16:50Z |
| Rulebook | [0, 10733) | 10,733 | Read-only rulebook reviewer, 2026-10-26 ~16:45Z |
| Skills a–l | [0, 9022) | 9,022 | Nineteen-skill routing/workflow reviewer, 2026-10-26 |
| Skills m–z | [0, 9432) | 9,432 | Eighteen-skill and host-mirror reviewer, 2026-10-26 |
| Tests: cost versus value | [0, 9487) | 9,487 | Read-only test-cost reviewer, 2026-10-26 |
| Tools | [0, 9681) | 9,681 | Caller/CLI/registry reviewer, 2026-10-26 ~16:50Z |
| Transcripts | [0, 9516) | 9,516 | Session-transcript reviewer, 2026-10-26 ~16:50Z |
| Fourth-pass index | [0, 1951) | 1,951 | Audit coordinator, 2026-10-26 |
| Anchor/citation drift | [0, 5225) | 5,225 | Fourth-pass mechanical citation reviewer, 2026-10-26 |

The third-pass reports identify tip b07a5ac6f; the fourth-pass index identifies tip 7dd2e82f3. Reporter names are roles inferred from headers, not independent identity attestations. The CI part begins mid-row; its preceding methodology and opening table belong to group 37. The rulebook part was read as [0, 10000) and [10000, 10733).

## Semantic map

- CI/train tail: separates actual public-repository cost from private list-price estimates, records publish latency, stale green combinations, retry-only successes, missing unit quarantine, dropped or delayed crons, fold workflows that swallowed PR-creation refusals, spec/catalog authoring failures, snapshot races and noisy zero-signal workflows. The proposed fixes are dated recommendations, including suggestions about merging and dispatch that are superseded operationally.
- Docs/memory: measures index incompleteness, notes masquerading as rules, conflicting context caps, duplicated memory rules, inaccurate dates, missing evidence metadata, contradictory test/deploy timing claims, unsignaled supersession, work-log bulk and heavy mandatory reads. Distinguishes declared supersession-pair tests from semantic topic overlap: historical green integrity checks did not prove the absence of contradictions.
- Environment: inventories enabled tasks, live and stale session bindings, role environments, host mirrors, Chromium and missing graphics libraries. Finds incomplete Codex guard coverage, docs-only changelog-validation gaps, inherited secret scope, undocumented environment variables, duplicate board refreshes, silent watchers, stacked wake times and decision-dependent timer loops. Secret names are evidence of configuration exposure, not values or permission to inspect credentials.
- Game-code health: records ratchet saturation and growth, manifest/type/lint results, lack of same-file merges within one hour, stacking effects, stale tested bases, spec-selection budget omissions, PR-body/head mismatch, duplicate-key scan coverage and read-only guard false positives. Separates a narrow checked type contract from a broad ungated check with many implicit-any errors. No browser was run by that reporter.
- Rulebook: checks command/path existence and host twins, then documents semantic conflicts despite passing text guards: wake signals, malformed holds, external brief authority, union ratchet deadlock, chatter typed as HANDOFF, CI tier/timer language, grant scope, chained commit prose, duplicate memory rules and always-on context cost. Its final table distinguishes prose-only rules from enforcement.
- Skills a–l: combines static inventory with a small paid routing pilot and a load-aborted partial run. Covers missing usage telemetry, expensive MCP startup during evals, description cost and overlap, contradictory routing homes, stale line anchors, duplicated messaging references, absent help behavior, late skill loads and duplicated README descriptions. Domain commits establish activity, not actual skill invocation.
- Skills m–z: verifies mirrors, paths, CLI flags and hook names; runs several non-browser recipes while explicitly skipping browser recipes. Its keyword-hint proxy is distinct from paid model routing. Findings cover missing single-spec background support, career/dead-CSS misroutes, description-trim regressions, stale ship/monitor recipes, indirect authority links, profiler ownership, realism vocabulary, over-triggering and missing negative fixtures.
- Tests: attributes a roughly twenty-minute floor chiefly to CPU work, repeated VM boots, mesh builds, hook subprocesses and ratchet measurement. Examines counted and uncounted source pins, behavioral coverage gaps, runtime regex misclassification, stale cost comments and misplaced groups. The absence of named failures in a short text corpus is expressly a proxy, not proof that tests have no value; duplicate coverage clusters were largely negative findings.
- Tools: measures serial board REST cost and cache size, duplicate HTTP/git clients and live-run helpers, receipt dependency gaps and differing ages, inconsistent PR parsers, unknown-flag acceptance, incomplete help, uncalled CLI candidates and archived probes exposed as live entries. It also records clean generator/catalog checks and shared parsers, so the report is not a blanket tooling-failure claim.
- Transcripts: compares orchestration before and after steering, with per-session costs, wake sources, useful actions and context growth. Finds narrowed seed authority, self-attested quota receipts, lane-based twin collisions, handwritten waits, duplicate channels, grants asked in the wrong session, rotation overhead, blocked-owner broadcasts, commit prose/enforcement drift, missing ready-event CI and cache breaks. It preserves evidence of improved behavior alongside remaining costs.
- Fourth-pass index: organizes adversarial verification, security, sessions, CI/site, tooling, vendor research, rule/memory/MCP, game hunts and per-card/per-skill reviews. Some handbacks were saved verbatim by the coordinator after reporters hit turn caps; the index supplies organization rather than new execution evidence.
- Anchors: mechanically scans 1,821 tracked files and 162,018 lines, classifies 6,512 citations and reports 2,873 drifted. It compares line, approximate-line, heading and symbol styles, then ranks affected files and examples. Its nearest-backtick heuristic can mistake prose for symbols; absolute, home-relative and URL paths were excluded, as were untracked worktrees. A missing local dependency-source filename or illustrative placeholder is not automatically a broken live link.

## Backlinks, current use and limits

A literal-path and same-directory filename scan of notes found backlinks for every assigned source; exact referring paths are isolated in the support JSON. The third-pass index supplies the common slice links. Additional references include fourth-pass security, CLI, game-hunt and skill reviews; the fourth-pass synthesis references its report index. The citation report also cites the CI slice as an example of an ephemeral evidence filename. These are discoverability observations only; referring reports were not independently reread or validated here. Generic names were matched only in their own directory unless the full source path appeared.

Use this group to reconstruct the rationale for simpler coordination, recover measurement definitions, find drift patterns and select narrow questions for a present-day review. Current AGENTS.md assigns GitHub the coordination role, uses labels for holds and landing, and forbids timer or standby wakes. Historical fleet stores, launch receipts, queues, ownership tags and merge authority cannot be restored from these reports. Current caller reachability, tests, gates, platform docs, permissions, timings and runtime outcomes were not re-established. Shallow history, high machine load, incomplete transcript paging, sampled PRs, limited routing runs and heuristic citation matching bound the original evidence.

## Comment and prose cleanup candidates

Recheck surviving numeric cost comments in hook, mesh and VM tests against generated timings; replace unsupported line-number anchors with test titles, headings or symbols. Check headers that claim a helper was extracted while duplicate implementations survive, CLI usage strings missing documented options, archive tables claiming live skill ownership, receipt-age prose, monitor defaults and descriptions still naming a dormant merger role. Remove obsolete deployed-URL wording only after checking the current browser workflow. Historical missing-file examples, deleted role/memory references and archived research paths belong in provenance or supersession annotations, not executable instructions. Preserve dated measurements and limitations rather than mass-editing historical conclusions as if they were live defects.

Raw historical, archived, obsolete and ephemeral path spellings are isolated in `notes-38-paths.json`.
