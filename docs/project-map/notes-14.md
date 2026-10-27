# Notes batch 14 — GPU lifetime, graphics proposals, harness and HUD rationale

Read 2026-10-27. Covers all ten assigned parts, totaling 100,000 bytes. Byte ranges are zero-based, end-exclusive. Each assigned part was fully returned in individual source reads of at most 9,000 bytes without truncation. Historical grants, commands, owners, costs and next steps are provenance, not current authority. No runtime, browser, network or tests were run.

[Provenance inventory](notes-14-provenance.json) records whole-file, assigned-part and individual read-chunk SHA-256 hashes, ranges, file sizes and incoming documentation backlinks. Every whole-file hash matches the batch manifest. Backlinks are textual discoverability evidence, not validation; zero backlinks means none found in documentation outside this map. Archived references and local artifact paths remain in source material rather than becoming instructions here.

## Semantic map

### GL object leak tail — 2026-10-17

Only bytes 1342–2036 are assigned; the opening is mid-sentence and the earlier experiment belongs to batch 13. Unnamed patch investigator records the missing geometry-switch release discovered by +8 objects per cycle, a vendor patch backport covering program/shader/pipeline deletion and reference-counted VAOs, and intended retirement at a future library bump. The vendor patch ledger and upstream issue numbers locate implementation provenance. Use for disposal rationale. Whether undeleted VAOs retain ANGLE-Metal buffers remains explicitly unestablished; no phone memory timeline is provided here.

### GLX output target — undated, Quest VR task 30

Unnamed implementation producer explains an explicit final framebuffer and viewport contract, default canvas behavior and reset-only framebuffer operations. Architecture and the focused output-target unit file are the outgoing navigation points; one documentation backlink is recorded. Use to distinguish deliberate rendering destinations from texture-setup resets. This short note is design intent rather than fresh backend execution evidence.

### GPU capture hooks — 2026-10-19

Issue #2964, parent debugging round #2952/R6; producer unnamed. Records WebGPU descriptor labels and pass debug groups, plus a lazy developer capture surface offering Spector summaries and WebGL lint findings. Vendor hashes and same-origin CSP explain packaging. Unit/browser gate references describe historical coverage and the WGX-specific rule remains separate. Use for locating instrumentation and understanding its off-by-default boundary; the note expressly excludes renderer-selection changes and the separate inspector. Two incoming documentation links are inventoried.

### GPU memory hunt — 2026-10-24

A·H12 follows A·H11's suspected buffer leak. The crucial correction is that one QUIT tap merely armed confirmation: initial runs measured race-to-race switches, while corrected two-tap runs verified menu state. Subsequent desktop and phone-tier macOS hardware series plateaued, refuting the proposed unbounded leak; software counts ranked investigation but were explicitly insufficient device evidence. Small residual count growth was attributed to bounded car caches rather than increasing memory.

One low-severity defect was confirmed: shadow-warm probe meshes needed object disposal as well as geometry disposal to release retained render objects. Other rows reject the desktop atlas as a phone issue and classify retained floor/post objects as one-time warm resources. Reconsidered levers preserve pool release, compile-probe cleanup and bounded caches. Producers, workflow run IDs, census artifacts, focused unit evidence and upstream WebKit links make this a causal investigation ledger. Use for lifetime semantics and experimental correction; do not read its historical next list as an unresolved present-day work queue. One incoming documentation backlink is recorded.

### Graphics detail survey round two — 2026-10-01

Research/proposal, explicitly no code changed. Four read-only hunts plus a web pass, unnamed author, deploy snapshot 35ef73af. Correctness findings concern first-build model readiness, wildcard ambient overrides, moon/light direction mismatch, static marshal flags and inert gantry lights. Content limits include synthetic placeholder models, generic scenery, stepped weather, cloud/sun disconnect, unlit particles, road-independent puddles and module ceilings.

Seventeen ranked proposals connect those findings to model loading, ambient blending, cross-backend moon parity, race-driven flags/gantry lights, licensed real assets and instancing, scenery spread, particle lighting/lock-up effects, interpolated weather, cloud occlusion, road drainage, trees/wind/crowds and future glTF delivery. It distinguishes prerequisites, small fixes and work needing dedicated plans; it rejects runtime asset APIs and redistribution-incompatible or oversized content. Sources include asset licensors, vegetation/crowd references, three.js and glTF documentation. The prior survey is archived; broadcast, flyby and wetness plans are neighboring design homes. Use as dated rationale and idea dependencies, never proof that findings or proposals remain current. Two incoming documentation links are inventoried.

### Harness settings — 2026-10-26

R5 research for system-audit PR #3785, with S5 owning implementation. Measures first-turn context components, especially deferred tool search versus eagerly loaded descriptions; derived cloud-host overhead is clearly distinguished from directly itemized measurement. Discusses compaction controls, MCP denial and description limits, skill routing costs, hooks, reporter context omission, prompt-cache TTL, cross-session delivery and scheduled-task limits. Corrections record guard fail-closed settings as landed rather than still proposed.

The auto-mode addition explains why project settings cannot configure its classifier. Later sections preserve proposed settings fragments, role-specific environment choices and GitHub research: then-current repository protection, server-side rules, a queue design, preview hosting and App credentials for workflow-triggering changes. These are historical research and proposals, including explicit pilot requirements, not configuration changes authorized by this map. Current AGENTS is the operating rulebook. Six documentation backlinks provide discovery. Use for dated measurements, source URLs and implementation provenance; connector denial, compaction behavior, cloud hook enforcement and queue/preview designs were explicitly unverified here.

### Helmet visor HUD — 2026-10-05

Unnamed UI repair producer, prompted by a phone report. Separates cockpit and helmet layout sets, touch visibility and placement rules, with survey-matrix integration. Before/after 844×390 measurements explain ENERGY/TYRES retuning and a desktop AERO edge issue attributed to another branch. The same-day owner's GEAR request supersedes the earlier deliberate hidden-gear choice: adding GEAR shrinks the dock but the measured final placement has zero findings. Use for the evolution of helmet defaults and layout compromises. Measurements are individual SwiftShader cells, not current device validation; no incoming documentation backlink was found.

### Hooks and security — 2026-10-26

S5 implementation of audit PR #3785; the quoted owner grant is historical provenance only. Before/after rows cover GitHub HTTP classification, MCP write/close/dispatch restrictions, gate-file hash receipts, mergeability re-reads, poll-loop refusal, guard performance, subagent help exemptions, browser-tool matching, LSP hints, explicit timeouts and batched ownership lookup. Limits are central: receipts remain forgeable files, unknown API clients evade parsers and server-side protection supplies the backstop. Hook failure policy is explicitly fail-closed. Upstream hook/GitHub API sources and two incoming backlinks support navigation. Use for threat-model boundaries and rationale; this note cannot establish current protection or parser completeness.

### In-race HUD code audit — 2026-10-10

Read-only cloud audit at ship 5ab09b4, phone landscape first, complemented by the phased phone-layout plan and a parallel screenshot survey. Twenty unit files reportedly passed and one harness experiment reproduced unstable zoom without currentCSSZoom; browser confirmation was deferred. Findings F-01–F-25 span Safari zoom fallback, stale style caches, competing Phase 0 changes, multiple inset writers, radio reopening, per-tick forced layouts, dragged-dock invalidation, reserved hidden slots, text scaling, small targets, CSS ownership, stale fonts/metrics, accessibility and formatting. Test findings distinguish brittle source regex from behavior checks and name missing scenario coverage.

The audit separates solver soundness from order-dependent repair passes, verified-correct areas and historical open-PR interactions. Screenshot cross-checks strengthen some visual claims while preserving mock/per-tick and device limits. A recorded owner decision introduces size ceilings and replacement deletions; recommended sequencing and a pure snapshot/solve/publish architecture explain the proposed simplification. Use to trace causes, overlaps and test gaps; all branches, statuses, line references and counts are dated. Three documentation backlinks are inventoried; no historical recipe was executed.

### HUD tabular digits opening — measured 2026-09-14

Only bytes 0–5040 are assigned; the ending cuts off inside a comparison table and the rest belongs to batch 15. Unnamed typography investigator establishes that Rajdhani's Latin subset lacks numeric features despite Devanagari features in the full font, and separates digit jitter from nearly stable box width. A digits-only Titillium substitution removes jitter, but wider typical strings cause tight small-landscape collisions even when worst-case widths stay fixed. The opening explicitly says a later third attempt shipped; this partial slice does not itself contain that implementation. Use for the font-feature and content-sizing failure mechanism, with the continuation required before choosing a remedy. No incoming documentation backlink was found.
