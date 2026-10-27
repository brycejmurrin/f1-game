# Notes batch 41 — historical audit provenance

Read all 100,000 assigned bytes in 19 individually returned, untruncated chunks of at most 9,000 bytes. `notes-41-paths.json` records the raw source paths, whole-file and assigned-part SHA-256 values, chunk hashes, and coverage. All manifest whole-file hashes match. No tests, browser, runtime, network, source edits, or commits were performed.

These are fourth-pass audit records from 2026-10-26, mostly tied to checkout 7da0df7bc (memory/MCP uses 7dd2e82f3+). Producers identify themselves by audit slice or skill-review role, without a personal author identity. Their commands, permissions, warnings, and recommendations are historical evidence, not instructions for this mapping session. Current behavior and issue status were not revalidated.

The assignment begins with only the live-site audit’s closing limitations and ends partway through the career review. The companion JSON explicitly distinguishes these partial files from the twelve whole files.

## Semantic map

### 1. Live-site audit tail

Topics: asset transfer and unverified deployment. Historical limits only; this span contains no audit results. Limits: No asset rehash, waterfall, or completed live verification. Cleanup: Retain caveats alongside preceding batch; never present this tail as a full audit.

### 2. Memory and MCP surface

Topics: memory synchronization, tool schema cost, routing collisions, stale servers. Use to trace reported M1–M10 hypotheses and the 19-memory/40-tool snapshot. Limits: Sample is seven orchestrator digests and one worker page; cloud settings pilot and per-server starts unverified. Cleanup: Retire or consolidate stale process memories only after checking current owners; replace copied counts with generated truth.

### 3. Numeric claims audit

Topics: dated measurements, count drift, prompt-cache TTL. Useful methodology and provenance for conflicting figures, not current counts. Limits: Heuristic 1,225-row extraction; no test counts or timing measured. Cleanup: Date and scope measurements; remove duplicated undated counts and distinguish historical statements from current claims.

### 4. Seven-day PR flow

Topics: merge governance, CI bypass, queue delay, attribution, backlog. Historical population evidence for P1–P12 and policy changes. Limits: Timeline cap 100; bodies observed after merge; API permissions and clean-behind sync classification limited. Cleanup: Preserve dated aggregates; consolidate repeated pass-3 findings and mark later resolutions instead of implying live defects.

### 5. Gate and identity red team

Topics: receipts, launch gates, bus identity, pacing, hold parsing. Historical threat model G1–G18; code-reading findings require current corroboration. Limits: No executed forged receipts/stamps/bus/launch exploit; protection details unavailable; some tools unaudited. Cleanup: Keep exploit descriptions as historical evidence; replace obsolete operational rules with current authority pointers.

### 6. Hook red team

Topics: parser bypasses, generated-file protections, hook configuration, false positives. Evidence of sandbox payload probes R1–R16 and host-adapter limits. Limits: Throwaway worktree/local bare repo only; no real push/merge or host execution; stopped at load 22. Cleanup: Deduplicate overlapping security findings; retain measured/local versus inferred/server confidence distinction.

### 7. Automation security

Topics: workflow permissions, credential exposure, public-comment trust, server gates. Security snapshot X1–X9 and positive controls at cited checkout. Limits: IAM policy, external-comment delivery, credential bypass, classic protection and online action audits unverified. Cleanup: Preserve names-only credential handling; consolidate duplicate gate findings and revalidate before remediation.

### 8. Agent-config skill review

Topics: routing evaluation cost, caps, ignored frontmatter, ownership. Historical FIX review with static command/path checks. Limits: Eval not run; referenced harness facts and sibling ownership may since change. Cleanup: Resolve one owner for skill trimming; point to rule homes; widen meaningful routing evaluation triggers.

### 9. Agent-fleet skill review

Topics: boot cost, quota contradictions, messaging duplication, session lookup. Historical FIX/TRIM review of a large fleet workflow. Limits: Some flags explicitly unread; launch/gate/send commands not run. Cleanup: Consolidate messaging and session policy; replace anecdotes and duplicate authority prose with pointers.

### 10. Agent-view skill review

Topics: hook vocabulary, physics routing, VM/browser verification. Historical TRIM assessment with static hook/path review. Limits: VM tracked invocation blocked; surface body not exhaustively read; seed and group claims require corroboration. Cleanup: Trim surface examples and stale rosters; clarify physics/live-probe routing and verification ownership.

### 11. AI racecraft skill review

Topics: hot paths, update ordering, test selection, pit rescue. Historical KEEP with small FIX review, including gaps tied to hunter reports. Limits: No runtime evidence here; dead-export and pit-default claims are historical source observations. Cleanup: Add targeted verification mapping and hot-path guidance only after checking current callers and order.

### 12. Asset-pack skill review

Topics: bake deny versus instructions, pack facts, focused tests. Historical small FIX review of an instruction/config mismatch. Limits: Commands checked statically; map flag not rechecked; no bake or test execution. Cleanup: Consolidate pack facts and remove stale sizes; align instructions with actual current permissions.

### 13. Audio-debug skill review

Topics: iOS activation, lazy audio bundle, AudioContext rebuild, observers. Historical FIX review motivated by first-tap silence and stacked listeners. Limits: Browser commands and their flags not run/checked; device symptom still needs device evidence. Cleanup: Replace line anchors with symbols/headings and document lifecycle-specific verification after current-code review.

### 14. Career-mode skill review opening

Topics: career persistence, sponsor test anchors, description collision. Only the opening review segment is assigned; retains FIX verdict and static checks. Limits: Ends mid-description collision; remainder and full reasoning are outside this batch. Cleanup: Replace approximate line anchors with test titles/headings; await remainder before assessing collision or season overclaim.

## Cross-cutting interpretation

The audit moves from measured memory synchronization and schema cost through numeric documentation drift, a seven-day PR population, gate/hook threat models, automation security, and seven skill reviews. Many findings explicitly extend or refute pass-3 findings; those tags preserve audit lineage rather than establish current defects. The most useful backlinks are to the current rule homes, tool implementations, test selection source, and earlier audit finding identifiers named inside each source. Those destinations were not followed or verified here.

Cleanup candidates are repeated one-home rules, undated counts/timings, approximate line anchors, obsolete fleet machinery, duplicated security findings, and recommendations whose closure state is unknown. Retain the distinction between executed sandbox probes, static code inspection, inferred server behavior, and unmeasured device symptoms. Do not delete historical caveats or convert old “NEW/STILL OPEN” labels into current status.
