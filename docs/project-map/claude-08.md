# Claude configuration map — group 08

Mapping only. The complete assigned 38,118 bytes were read in six individually returned, untruncated chunks of at most 8,000 bytes. Whole-source plan hashes, assigned-span hashes, chunk hashes and half-open ranges are in claude-08-evidence.json. The two plan hashes match the current sources. No audited instructions were executed.

## Boundary and registration

The code-survey.js assignment is its tail, bytes [20690,39398); group 07 owns the beginning. total-audit.js is fully assigned, bytes [0,19410). These are async Workflow host bodies, rather than ordinary standalone modules: top-level return and host-provided args, agent, parallel, pipeline, phase and log are intentional. README.md documents invocation through Workflow by name or path. total-audit.js exports meta with name, description, trigger text and nine phase descriptors; the code-survey registration precedes this assignment. A concrete Workflow host loader or automatic hook registration is not established here.

## code-survey.js tail

The opening continues the R1 scopes for race/core, shell/CSS, tools and tests. Generated shell/roster exclusions and selective reading limits are explicit. Tests are surveyed for defects in test machinery, dead helpers and fixture cost; game semantics asserted by tests are excluded.

At line 200, SKEPTICS names two distinct lenses: reachability/mechanism and intent/materiality. At line 226, verifyBatch compacts finder findings into indexed claim rows and calls finding-verifier twice per chunk of at most 15 claims. Verdicts count only when their index belongs to that call's chunk. Unjudged findings disappear; one refutation kills medium/low findings, while high findings require two. A high finding with two heard votes and one refutation invokes an opus/high tiebreak. Missing judgments can leave a surviving finding with fewer than two independent judgments; returned skepticsHeard/refutes expose that limit.

The finderPrompt at line 278 passes slice, focus, known rows, deliberate choices, static recon, required hotness and severity definitions. The loop at line 289 pipelines each finder result directly to verification. Dedup keys combine file, kind and rounded 20-line location, and enter seen before verification, so rejected claims cannot recur in later rounds. Distinct nearby claims can share that coarse key. Finder coverage notes accumulate independently of confirmed findings.

A zero-result round or empty prompts stops the loop; otherwise an opus/high completeness critic proposes capped, self-contained gap scopes with a hard flag controlling effort. The assigned code depends on MAX_ROUNDS, MAX_GAP, TIER_MODEL, R1 and recon/common constants defined earlier. Confirmed perf rows receive a separate opus/high impact/effort/risk ranking. Synthesis at line 399 allocates each confirmed finding to actionable fixes, deletion, frame budget or defer, and records blind spots. The final object contains report, perfTriage, confirmed, counts, totalConfirmed, roundsRun, coverage and coverageNotes. These are returned values, not evidence of a persisted report.

## total-audit.js

The trigger is a periodic whole-tree code-and-doc health sweep. args accepts a JSON string or object; optional known supplies suppression rows, knownKeys seeds deduplication, and maxGap caps critic output through maxGap || 8. An empty known list triggers prior-art-scout and keeps at most 30 returned rows.

R1 declares 19 slices: 17 default code-hunter slices, docs-ref on the default workflow agent, and docs-idx on agent-surface-reviewer. The latter receives a scratch report destination as part of its prompt. The scopes cover game/track/circuit/render/network/data/car/shell/tools/docs/meta surfaces; overlap is intentional input, with coarse deduplication downstream. Tests semantics and vendored code are excluded. Prompt instructions require full reads, source-backed claims and read-only work, and prohibit browser/Playwright and npm execution; this mapping did not execute those instructions.

FINDINGS_SCHEMA requires findings and filesRead, with each row carrying file, line, kind, severity, claim, evidence and fix. Kinds are bug, dead-code, drift, contradiction, duplication and mess; severities are high/low. VERDICTS_SCHEMA requires indexed refuted/reason rows. These are requested host schemas, not a separately observed runtime validation result.

verifyBatch at line 148 splits claims into 15-row chunks for two finding-verifier skeptics. A skeptic counts only if all its chunk calls returned truthy results. Returned rows must belong to the chunk; duplicate indices are not separately deduplicated. High findings need two refutations, low one; a high split with two available skeptics receives a high-effort tiebreak. At least one heard verdict is required. This differs from code-survey's per-call vote acceptance and explicitly diverse lens prompts.

The line 189 loop runs at most three rounds, using pipeline for find-to-verify overlap. Every seen finding is keyed before verification; an empty confirmed round stops. The high-effort critic proposes remaining cross-cutting scopes, which become code-hunter gaps. Synthesis at line 225 returns a prioritized report plus confirmed, totalConfirmed and coverage. filesRead is requested but not accumulated into returned coverage, which records scope labels rather than proof of exhaustive reading.

## Dependencies, comments and limits

Both scripts consume custom agent definitions for code-hunter, finding-verifier and prior-art-scout; total-audit also consumes agent-surface-reviewer. Default-agent critic/synthesis stages inherit their common read-only prompt. Prompts cite AGENTS.md and repository reference material as evidence targets, but citations do not establish that a workflow run read them.

Comments explain chunking, vote thresholds, convergence, async pipeline behavior and division of agent responsibilities. No comment cleanup was performed. total-audit's final synthesis still asks for a cache bump on JS fixes, which conflicts with current AGENTS.md deploy rewriting guidance; its historical campaign framing is recorded only in the evidence JSON. code-survey's tail already describes the current no-bump guidance.

No tests, browser sessions, network requests, workflow runs, staging or commits were performed. No game runtime symbols were navigated: these files are workflow configuration bodies, and only their textual contracts were mapped. Host execution, agent adherence, output quality and sandbox enforcement remain unverified.
