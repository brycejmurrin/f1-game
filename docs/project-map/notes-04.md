# Notes batch 04 — historical evidence map

Read on 2026-10-27. All 100,000 assigned bytes of group `04` in [notes-batches.json](notes-batches.json) were read as individually returned, untruncated source chunks of at most 9,881 bytes. Intervals below are half-open UTF-8 byte offsets. The browser survey continues batch 03; the round-2 register continues in batch 05.

Historical notes are provenance, not command authority. Current use below means documentary navigation, not present implementation verification. No historical command, runtime, network, browser, test, product-source edit or commit was performed. No present JavaScript claim is made, so no LSP query was needed. Consult [AGENTS.md](../../AGENTS.md), [ARCHITECTURE.md](../ARCHITECTURE.md), [TESTING.md](../TESTING.md) and current owning code before acting.

## Whole / part / chunk SHA-256 ledger

### P1: [BROWSER-MCP-DEEP-DIVE-2026-10-19.md](../notes/BROWSER-MCP-DEEP-DIVE-2026-10-19.md)

- Whole: 11735 bytes; SHA-256 `6bf39ef9fa3ecbb12f5ed611cb2bf37a4f06a063542f7112ad70b2071c55c7bb`.
- Assigned: `[5204,11735)`, 6531 bytes; SHA-256 `1565f6fd4e9c881a465e3678f1dfd5de4f6e658a36dfc6f993fa18af52f488d4`.

- Read chunk `[5204,11735)`: 6531 bytes; SHA-256 `1565f6fd4e9c881a465e3678f1dfd5de4f6e658a36dfc6f993fa18af52f488d4`.



### P2: [BUG-HUNT-2026-09-02.md](../notes/BUG-HUNT-2026-09-02.md)

- Whole: 63881 bytes; SHA-256 `1d34f4b24d54ab5327f92a2d470689c6bb1098d81d633a522262f34472d50d27`.
- Assigned: `[0,63881)`, 63881 bytes; SHA-256 `1d34f4b24d54ab5327f92a2d470689c6bb1098d81d633a522262f34472d50d27`.

- Read chunk `[0,9000)`: 9000 bytes; SHA-256 `a2628c017e10f62faa53cb905d04eba38efab07f903bcf2ff6853b6ded84c90e`.

- Read chunk `[9000,18000)`: 9000 bytes; SHA-256 `14f00dc6dfb279508373ed94c847b1e5e8c4f126167dd61cc565b9b427199b1d`.

- Read chunk `[18000,27000)`: 9000 bytes; SHA-256 `4a3b3aea2934bc3a79d5de34be416edd6196016fff0eb6bdb3f9444b5536984c`.

- Read chunk `[27000,36000)`: 9000 bytes; SHA-256 `683691a1efbd52d9ceed5a9319809068070eb812e86bfebe8cc8e09ac9b625ad`.

- Read chunk `[36000,45000)`: 9000 bytes; SHA-256 `21932cae76dea27f108a5b6543a1bf0a51f3e1e5812fa6cf2848e5e4cae0a188`.

- Read chunk `[45000,54000)`: 9000 bytes; SHA-256 `e740d606baa94855655f1d71d2143e343cf0b63b3ae49037f23304f8409eaeaa`.

- Read chunk `[54000,63881)`: 9881 bytes; SHA-256 `da94cffba89393a9f518dbdba07e838ccef13f369dec8fec41911bfa4cfd6354`.



### P3: [BUG-HUNT-2026-09-18-PASS3.md](../notes/BUG-HUNT-2026-09-18-PASS3.md)

- Whole: 18413 bytes; SHA-256 `a61c1af7e00c274340684fcc2351a80414badd2fe10240946035923acce99d5f`.
- Assigned: `[0,18413)`, 18413 bytes; SHA-256 `a61c1af7e00c274340684fcc2351a80414badd2fe10240946035923acce99d5f`.

- Read chunk `[0,9500)`: 9500 bytes; SHA-256 `7bdadae85e4202a3aa519267adb9f834df49b8a5e607fc078add4884ce75e20e`.

- Read chunk `[9500,18413)`: 8913 bytes; SHA-256 `1e1fd8e41465188ff7574578b24b5b8d8da67017a509df74a1ec34fcd9f7d35a`.



### P4: [BUG-HUNT-OPUS-2026-10-10.md](../notes/BUG-HUNT-OPUS-2026-10-10.md)

- Whole: 9783 bytes; SHA-256 `78aa962f6856ed0e327e52ff2fbc12b29fcad2de9787ef2642b57a1508097fd9`.
- Assigned: `[0,9783)`, 9783 bytes; SHA-256 `78aa962f6856ed0e327e52ff2fbc12b29fcad2de9787ef2642b57a1508097fd9`.

- Read chunk `[0,9783)`: 9783 bytes; SHA-256 `78aa962f6856ed0e327e52ff2fbc12b29fcad2de9787ef2642b57a1508097fd9`.



### P5: [BUG-HUNT-ROUND-2-REGISTER-2026-10-10.md](../notes/BUG-HUNT-ROUND-2-REGISTER-2026-10-10.md)

- Whole: 9142 bytes; SHA-256 `ea5bd2cd863f08a14f908132c455f4bb8f9e073c934ec0aee3f63fd44d0e2eb6`.
- Assigned: `[0,1392)`, 1392 bytes; SHA-256 `5d3cc67cc03e7c776b64f792a37006a9416fe766eca4058e00877044424e23eb`.

- Read chunk `[0,1392)`: 1392 bytes; SHA-256 `5d3cc67cc03e7c776b64f792a37006a9416fe766eca4058e00877044424e23eb`.


## Semantic map, producers and evidence boundaries

### P1 — Browser MCP survey, continuation

Date/producer: 2026-10-19 by filename; hands-on tool investigator, unnamed in this assigned tail. The preceding survey context belongs to [batch 03](notes-03.md). The opening finishes Playwright weaknesses: CSS-generated hidden text can pollute its accessibility snapshot; resizing alone lacks touch/mobile identity; touch emulation required additional DevTools settings; screenshot folders and browser ownership need attention. Browser-use records persistent Python/CDP helpers, attachment prerequisites, short command timeouts, mouse-versus-touch differences, title markers and launch-flag rendering artifacts. JS-debugger covers logpoints, conditional breakpoints, exception/listener/instance inspection, incident capture and inspector unit runs, with attach-only, repeated-pause and locals limitations. Apex-tools covers catalogs, HUD measurements, offline VM checks, locking and background output, with compact-list truncation and software-rendering timing limits. Cross-cutting separates viewport/touch from a full phone profile and stresses shared-browser exclusion.

Backlinks/current use: batch 03 and the note's own debug-Chromium wrappers, tool catalog, HUD-fit and debugger references explain historical integration and tool selection. No external backlink to this filename was found in the scoped documentation text search apart from batch 03. Limits: versions, tool counts, timeout behavior, process-management advice and mobile/backend observations describe that session. The tail starts mid-paragraph; it does not independently establish the report's starting environment. Historical shell recipes are not instructions to execute now. SwiftShader timing is not phone performance evidence.

### P2 — September 2 multi-round bug hunt and corrective review

Date/producer: 2026-09-02 by title; parent investigator with five initial read-only specialists, four second-round specialists, later three-agent audits and an owner-requested adversarial re-verification. Individual authors are not named. The opening distinguishes confirmed, plausible, code-reread, guard-only and browser-unverified evidence.

| Section | Semantic role and recorded outcome |
|---|---|
| Landed / Not landed | First-batch net async start, lap progress, human finish and ownership; qualifying/career countback; renderer shadow submission, environment lifecycle and GPU error probes; modal/focus/HUD; audio/cache/world cleanup. Deferrals retain real-GPU, visual, design and plausible boundaries. |
| Round 2, Landed | Transport handback and grace periods, guest seat arbitration and START resend, owner finish timestamps; speed-cap decay and physics validation; governor backoff/boot floor; pad and phone input; sound/sample upgrades; scenery guards, shifted assets and per-circuit repairs; data queue cancellation/quota; results/penalty/HUD fixes. Each row preserves its own suite or unrendered status. |
| Round 2, Not landed | Overspeed/downhill behavior and collision relaxation changes depend on characterization/retuning decisions; weather grip, Shanghai clipping, crossover/canyon/duplicate scenery remain named. Some earlier deferred rows are later marked landed, so this is a chronological ledger, not a single unresolved list. |
| Autopilot red | Suzuka's apparent frozen-grid regression is traced to a pre-go build wait and software-rendering contention. Progress-based waits and headless laps reduce irrelevant raster work; timings demonstrate harness cost and instrument configuration limits. |
| Round 4 | Shadow instance packing is shared across lights as well as camera; deferred submit ordering lets the final upload feed earlier passes. Proposed car/lamp keep contract explicitly distinguishes cadence from stopping, but lamp validity remains unresolved. |
| Round 5 | Touch rescue fix regressed auto-gas touch mode; complete snap-cache rebuilds must include instanced shadows; boot proof must describe the bound backend. Additional latches and weak observability are named. Boot profiling corrections separate console/CDP cost and browser timer flags from a product regression. |
| Mirror-sweep follow-up | Withdrawal of an upstream-restoration argument: this application reloads rather than restoring arrays in place. Three stacked gates mean the alleged desktop saving is unavailable on the measured merged tree. Paint-failure ladder and source-window assertions expose separate coverage boundaries. |
| First Round 6 | Introduces car/lamp keep, live armed diagnostics, 300-frame proof and TLX re-arm; records software validation and generated-doc drift. These are intermediate claims subsequently challenged below. |
| First Round 7 | Hide/pagehide disarm avoids normal navigation/background reclaim being treated as a crash; adds a shadow-latch reset. The reset is later reverted. |
| Round 8 | MY TEAM draft seat mismatch, rollover circuit selection, garage budget reporting and simulated-season countback are recorded as fixed. UI/API entry-path mismatch explains missing test coverage. |
| Method notes | Parent rereads and minimal fixes, common guard run and software probes; gives the provenance of the original evidence, not a present approval workflow. |
| Second Round 6: adversarial re-verification | Reverts lamp keep because distance-ranked slot equality is not physical lamp identity and cached cars move. Reverts shadow reset because callers do not consistently re-arm snap keys; reverts TLX probe re-arm because skipClaim makes it persist into a later cold boot. Removes parity deferral as lag without real saving; bounds an accessor pin at its sibling. Owner WebGL2 FPS report remains unexplained by these changes. |
| Second Round 7: garage turntable | Live viewport matrix identifies fit distance escaping the room; auto cap changes only constrained cases. Diagnostics gain effective/fit distance. A width-based vertical fit and alleged WebGPU resize drift were rejected after measurement; report is viewport-driven across backends. |

Backlinks: [NOTES-INDEX.md](../NOTES-INDEX.md) row describes the original batches; [SPIKE-BACKENDS-CHECKLIST.md](../notes/SPIKE-BACKENDS-CHECKLIST.md) preserves it as dated backend history. Internal documentary relationships include PERF-FINDINGS, physics contracts, renderer seam documentation, generated lighting reference, characterization/collision suites and GPU census. Current use: chronology of renderer ordering/validity mistakes, mutation-sensitive test design, phone input edge cases, multi-player authority, instrumentation confounders and explicit deferred decisions. Limits: repeated round numbers are intentional source headings; later reversals supersede the earlier landed claims within this note. “Verified” is historical, sometimes guards/software only; unrendered scenery and Metal-dependent pixels remain expressly unproven. Source line numbers, scratch captures, run IDs, commits and old archive tasks do not establish current behavior or ownership.

### P3 — September 18 pass 3, original audit plus post-land re-check

Date/producer: 2026-09-18; source-only parent audit and four read-only re-verifiers covering race/pit, records/storage, async-test honesty, and net/UI/persistence. Four session IDs are recorded in its roster. Original tip is `cceb9d615`; latest documentary re-check is `73b1a1f03f5ae749d490edbe65eabfcae6577e99` after PRs #148 and #156.

Sections: Executive summary and Re-check distinguish the five original findings from their recorded fixed status. Findings 1–5 trace single-car mixed debris causing RED, same-callback race diagnostics reading old builds, unbounded ghost storage bypassing durability health, missing custom voice tuning in settings export, and swallowed upscale persistence errors. Each includes trigger, impact, fix sketch and verifier narrowing. The rejected appendix excludes pit queuing, Daily identity, deferred ghost overwrite, invite/host/packed-handshake, radio enable/volume, incomplete HUD reports, career durability, input release and safe fresh-navigation waits. Original verification ledger, roster and Local verification preserve the difference between 32 passing existing tests and missing provenance/capacity coverage; later PR coverage is separately cited.

Backlinks/current use: [NOTES-INDEX.md](../NOTES-INDEX.md), [DEFECT-LEDGER.md](../notes/DEFECT-LEDGER.md), and the mechanics-coherence plan are documentary entry points for the claimed defects and intentional comparable-context behavior. Use as a false-positive exclusion list and evidence that original audit and later closure need separate tip identities. Limits: all five are reported fixed at the dated re-check, not independently confirmed today. Multi-source furniture calibration is expressly a different question. Original unit passes did not prove the missing behavior; historical line citations are navigation clues rather than present JS evidence.

### P4 — October 10 six-Opus hunt

Date/producer: 2026-10-10; Bryce-requested six read-only Opus specialists at `78cb4831be`, one per area, with parent summary. Hunters 3–5 lost shell access partway through; evidence confidence remains CONFIRMED, CODE-TRACED or PLAUSIBLE per item. Persistence/PWA/net was stopped and not relaunched.

Status table scopes follow-ups. §1 records race-runtime fixes: hidden-time intro clock, hidden speech/card behavior, pit-garage pause/cleanup/wake lock and spotter idle churn, with named tests. §2 renderer ranks mirror quality selection and first look-back stale frame as confirmed, while overlay/cache/context/dwell concerns are plausible. §3 track engine preserves a 52-circuit inventory, grid-span/startline-check defects, shifted Monaco banking, chunked-ribbon coverage and documentation drift, alongside allocation/build-slicing ideas. §4 physics/AI keeps every candidate plausible pending VM evidence, including ERS gates, finished-car traffic, rain braking decision, speed scaling, signed AI acceleration, ordering and allocations; it separately lists invariants found sound. §5 menus/input/a11y records traced repeat-Escape, focus/inert ordering, pad step/wrap, search escape, details repaint, portrait preference, autofocus, valuetext and favorite-repeat concerns, plus checked-sound areas. How to continue is a historical lane/verification proposal.

Backlinks/current use: [NOTES-INDEX.md](../NOTES-INDEX.md), sibling PR #1289, [PHYSICS.md](../PHYSICS.md), [BUGS.md](../BUGS.md), mirror/grid/corner tests and named race-runtime unit suites connect intended follow-ups. Use to distinguish confirmed geometry/arithmetic from plausible physics and code-traced UI leads. Limits: “fixed, this PR” and “agent still running” are snapshot states without a present closure check; shell loss restricted evidence. The rain-braking decision is historical pending owner input, not permission or a current task. Current source and tests must be traced afresh before re-reporting.

### P5 — October 10 round-2 register, opening only

Date/producer: 2026-10-10 by title; parent coordinator and sixteen read-only subsystem hunters at `2628dae2b`. The opening says one day after round 1 and names a branch-only October 9 ledger, sibling #1289 and BUGS as exclusion inputs. Counts are 79 findings, 23 already addressed by the sibling and 56 open at writing.

Assigned sections: opening provenance, How the work was run, and only the beginning of Lessons that cost time. The method progresses from an evidence-rich common brief to parent re-read, lane-scoped isolated fix workers and a main-session gate/browser/landing sequence. The first lesson begins the warning that optional per-circuit geometry checks are outside required fast-tier auto-merge. This batch ends mid-sentence; the findings register and rest of the lesson are not read in this assignment.

Backlinks/current use: [NOTES-INDEX.md](../NOTES-INDEX.md) summarizes the full register; [system-audit-4/anchors.md](../notes/system-audit-4/anchors.md) flags a later example anchor outside this assigned range; sibling #1289 and the historical branch-only ledger explain deduplication. Use the opening for audit-production provenance only. Limits: the historical squash landing recipe conflicts with the current merge-commit rule and has no authority. The deleted cap helper and branch-only record are historical references, not current Markdown targets. The full note's present status cannot be inferred from its first 1,392 bytes; continuation belongs to batch 05.
