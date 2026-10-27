# r2 — docs/ top-level review (read-only), 2026-10-27

Scope: the 39 `docs/*.md` files, `docs/NOTES-INDEX.md` and `docs/plans/` (42 entries). Method: the first 16–40 lines of every file;
grep for retired-process terms; existence checks on about 45 cited paths; number spot-checks; a reachability matrix
(A = AGENTS.md, R = docs/README.md, V = VERIFICATION.md, S = .claude/skills+rules). `node --test tests/unit/docs-integrity.test.mjs` → 37/37 pass.
Reachability: **every top-level doc is linked from docs/README.md** (R≥1). The only docs AGENTS.md links are AGENT-SURFACE, ARCHITECTURE, DEBUG-HOOKS,
EVIDENCE-STORAGE, PHYSICS, README, TESTING, VERIFICATION and WORKERS.

## Cross-cutting finding: three different pre-push floors (the main source of "unclear process")
- AGENTS.md loop step 6 + rule 3: full `npm run test:tooling-fast` + `pick-tests`, and `deploy.mjs --gate-only` "before a push"; rule 3 also says "a lane never runs the whole deploy gate in the foreground".
- VERIFICATION.md §Before a code push: "`deploy.mjs --gate-only` is **the authoritative local pre-push check**".
- WORKERS.md §Contract 3: the floor is `tooling-fast --changed` + ONE spec; "Do not run `deploy.mjs --gate-only`".
- ARCHITECTURE-MAP §Build/test/deploy: "Full pre-push gate (no push)" plus "full pre-push/deploy gate remains authoritative".
These have to be brought into agreement in ONE home (WORKERS or AGENTS rule 3), with the others linking to it.

## Per-doc table
| Doc | Purpose | Spot-checks | Overlap | Retired-as-current? | Verdict |
|---|---|---|---|---|---|
| README | Reading order + area index | links all resolve (docs-integrity green) | NOTES-INDEX (split, fine) | no | KEEP |
| VERIFICATION | Gate/command meanings | verify-change.mjs, session-status.mjs, notes/PREPUSH-GATE-LADDER.md exist ✓ | ARCHITECTURE-MAP cmd table, TESTING §1 | calls deploy --gate-only "authoritative" pre-push (conflicts WORKERS) | FIX: align pre-push floor; add land/ready-gate row |
| WORKERS | Worker contract, labels, dispatcher | land.yml, merge-gate.mjs, dispatch.mjs, ready-gate.mjs exist ✓; labels table | AGENTS §Coordination, TESTING "Merge train" | no — has a clean "What no longer exists" section | KEEP (make it THE pre-push floor home) |
| AGENTS-adjacent: AGENT-SURFACE | skills/MCP/CLI map | "Forty apex_* tools": 41 `name: apex_*` in tools/mcp ≈ ✓; `.codex/hooks.json` exists ✓ | AGENT-HOOKS (index), DESIGN-TOOLS (MCP recovery) | says Codex has hooks (.codex/hooks.json), while AGENTS.md:147 says "Codex runs none of these hooks" — contradiction | FIX: reconcile Codex hook claim; 691 lines, slim |
| AGENT-HOOKS | Generated hook index from agentHelp() | generator tools/docs/gen-agent-index.mjs ✓, docs/agent-index.json ✓ | DEBUG-HOOKS has its own generated hook table (gen-hooks-table.mjs) | no | MERGE INTO DEBUG-HOOKS (two generated hook tables) or keep as JSON only |
| DEBUG-HOOKS | __apex reference (5451 lines) | "213 hooks" generated + hooks-documented test ✓ | AGENT-HOOKS | no (TURN "relay" is netcode) | KEEP (size: consider a split per section) |
| ARCHITECTURE-MAP | 10-min tour | tools/manifest.cjs ✓; "Every size ratchet ... saturated (slack: 0)" ✗: 7 of 14 ratchets have slack 0 | VERIFICATION (cmd table) | "lower only" ratchet rule vs the standing train-ratchet OK (memory) | FIX: drop the cmd table → link VERIFICATION; fix ratchet sentence |
| ARCHITECTURE | Module contract (2228 lines) | three.js r186 ↔ vendor/three-0.186.1 ✓ | RENDERERS stub points here | no ("orchestration" = code) | KEEP |
| ARCHITECTURE-REVIEW / AGENT-WORLD-API / CONSOLE-RECIPES / LAYOUT-AUDIT / PERF-FINDINGS / RENDERERS / SCENERY-GROUNDING | 6-line redirect stubs | targets exist ✓ | — | no | KEEP for now; ARCHIVE once source-comment cites are rewritten (7 files of top-level noise) |
| BUGS | "verified bug shortlist" | key-binds.test.mjs, net-lobby-lifecycle cited ✓ | notes/DEFECT-LEDGER, BUG-HUNT notes | yes: "Fixed in this PR", "assigned to sibling sessions", "this session's open PRs", branch-only ledger: session-era framing presented as current | FIX: reduce to live open rows (or issues) + move the dated backlogs to notes/ |
| CAPTURE-REVIEW | design-matrix capture/publish | tools/shot/design-matrix.mjs ✓ | EVIDENCE-STORAGE, DESIGN-TOOLS | no | MERGE INTO DESIGN-TOOLS (87 lines) |
| CAREER | Career mode reference | career-backup.js, save-migrate.js, quali-model.js, quali-sheet.js ✓ | — | no | KEEP |
| CODE-STANDARDS | JS house style | global-registry/shared-math tests ✓ | .claude/rules/game-code.md | cites "AGENTS.md §Critical conventions" which now just points at game-code.md | FIX: point at game-code.md; dedupe with it |
| COMPONENTS | CSS inventory + layout axes | component-inventory test ✓, research/UI-DESIGN-PRINCIPLES ✓ | UI-MAP | no | KEEP |
| DESIGN-TOOLS | Free design tooling, chat MCP | chat-mcp-service.mjs, check-chat-contract.mjs, install-browsers.sh ✓ | CAPTURE-REVIEW, UI-EXPLORER, AGENT-SURFACE | no | KEEP (absorb CAPTURE-REVIEW + UI-EXPLORER) |
| EVIDENCE-STORAGE | Release-asset evidence | archive-evidence.yml, publish-evidence.mjs ✓ | — | no | KEEP |
| FLOW | Session state machine | setState in game.js ✓ (12 uses); baseline f5381b40 not in local clone (unverifiable) | USAGE-PATHS, UI-MAP | no | KEEP |
| USAGE-PATHS | Player journeys checklist | same baseline sha; source-verified only | FLOW, UI-MAP | no | KEEP |
| UI-MAP | Menu web + DOM roots | self-declares "historical", 2026-09-18 | USAGE-PATHS supersedes navigation | stale-by-own-admission | MERGE INTO USAGE-PATHS / COMPONENTS, or ARCHIVE |
| UI-EXPLORER | explorer.mjs usage | tools/ui/explorer.mjs ✓ | DESIGN-TOOLS | no | MERGE INTO DESIGN-TOOLS (91 lines) |
| ui-experience-studio | UI acceptance contract | Photo Studio/home-world code exists ✓ | UI-MAP | no; lowercase name breaks the convention | FIX: rename UI-EXPERIENCE-STUDIO.md (+ stub) or move to plans/ (it is a target contract) |
| LIGHTING | Light model + presets | knobs.js/atmosphere.js paths ✓ | LIGHTING-TUNER-SLIDERS (intended) | no | KEEP |
| LIGHTING-TUNER-SLIDERS | Generated slider table | gen-slider-doc.mjs ✓, --check in generated-docs test | LIGHTING | no | KEEP |
| MULTIPLAYER | net/ reasoning | MAX_GUESTS = 3 in js/net/lobby.js:26 ✓; tools/net/nostr-probe.mjs ✓ | — | opener cites "227 lines inside CLAUDE.md" history (harmless) | KEEP (trim the history line) |
| PACKAGING | Electron + Capacitor | appId io.github.brycejmurrin.apex26 in desktop/lib/identity.cjs ✓; electron-builder 26.15.3 ✓ | — | "Task 10", "PR #422 spike" framing | KEEP (trim the spike history) |
| PHYSICS | Driving model + curvature table | curvature-channels test ✓ | AGENTS §Physics (rules only) | no | KEEP |
| PLATFORM | iOS/static-host notes | research/PLATFORM-INPUT-NOTES.md ✓ | — | no | KEEP |
| SCENERY-API | scenery(api) contract | "114-member" = CONTRACT_SIZE 114 ✓ | SCENERY-AND-TRACK-BUILD | no | KEEP |
| SCENERY-AND-TRACK-BUILD | Track build pipeline | js/track/AGENTS.md ✓ | SCENERY-API, ARCHITECTURE | no | KEEP |
| TESTING | Groups, infra, CI tiers (1389 lines) | "150+ specs" (171 ✓), "1000+ unit" (1051 ✓) | VERIFICATION, AGENTS rules 4–5, WORKERS | YES: §Merge train says "merge one large PR at a time", the owner runs ready-gate then marks ready, no mention of land/gate; §CI aggregator: "`CI` is the deploy branch's ONE required check", but the ruleset now needs `CI` **and** `gate` (WORKERS §LAND_TOKEN); "Run them in the background. Always." vs AGENTS rule 4's <2-min foreground; documents `--parallel` despite rule 5 | FIX: rewrite §Merge train to point at WORKERS; fix the required-checks sentence; move dated field notes (§3 ~L900–1115) to notes/TESTING-FIELD-NOTES |
| TESTING-COVERAGE | Generated per-file table | gen-coverage-table.mjs ✓ | — | many spec rows read only "@ts-check" (bad summaries) | FIX (generator: skip the @ts-check line) |
| TRACK-DESIGNER | Player guide | HOWTO table in js/editor/designer.js:29 ✓; APXT1 codec ✓ | — | no | KEEP |
| NOTES-INDEX | notes/research/archive/plans index | 0 rows point at missing files ✓ | README | Orchestration section correct (fleet plan marked superseded) | FIX: 97/204 notes, 22/42 plans, 1/39 research unindexed (below) |

## plans/ (42)
Every plan carries a dated Status line (checked 2026-10-26) ✓. SUPERSEDED: 2026-09-30-agent-skills-and-tools (12 retired-term hits),
2026-10-19-fleet-redesign (37), CLEANUP-ROADMAP → ARCHIVE all three. SHIPPED (12 incl. 5 skilltest-*, racing-depth, broadcast-feel, share-cards,
stream-overlay, bug-hunt-plan/-2-register, fix-all-plan, barrier-runoff, player-a11y, mechanics-coherence) → ARCHIVE to archive/ with an ATTIC row.
2026-10-27-orchestration-redesign is the WORKERS evidence (21 retired terms, framed as history) → KEEP. 2026-10-27-review-fix-plan OPEN → KEEP.

## Orphans (not in NOTES-INDEX; the index has no missing-file rows)
- plans (22): texture-memory, racing-depth, agent-skills-and-tools, ai-personality, broadcast-feel, load-download-weight, player-a11y,
  strategy-career-depth, test-ci-health, models-life, perf-memory, bug-hunt-plan, bug-hunt-2-register, fix-all-plan, agent-friction-fix-plan,
  crowd-vat, fair-play-online, skilltest-{ci-tooling,content-pipeline,game-systems,guards-and-agent-kit,probe-debug}.
- research (1): wgx-gallery-manifest.json (data, fine).
- notes (97), e.g. AGENT-MEMORY.md (cited by AGENTS.md!), DECISIONS-2026-10-26, AUDIT-FIX-PLAN-2026-10-26, SURVEY-ASSETS-BRANCH (cited by AGENTS.md),
  ACTIONS-AUDIT-2026-10-14, AGENT-RETRO-2026-10-17, CAMERA-FEEL, DRIVING-LINE-RESEARCH, RACING-LINE-RESEARCH, XR-PHASE0-ARCHITECTURE, XR-QUEST-ON-DEVICE,
  WEATHER-ROADMAP-2026-10-14, PERF-* (8), LIVE-DEBUGGER-* (3), LIVERY-* (3), TREE-BUDGET-2026-10-19, garage-perf-2026-10-20 (lowercase).
  Rerun: `for f in $(ls docs/notes); do grep -q "notes/$f" docs/NOTES-INDEX.md || echo $f; done`.

## Top 10 fixes
1. Give the pre-push floor ONE home (VERIFICATION vs WORKERS vs AGENTS rule 3/step 6 vs ARCHITECTURE-MAP disagree on deploy --gate-only).
2. TESTING.md §Merge train: replace the "one large PR at a time / owner marks ready" text with a link to WORKERS (land label → land.yml gate → auto-merge).
3. TESTING.md §CI aggregator: "`CI` is the ONE required check" → the ruleset requires `CI` + `gate`.
4. BUGS.md: remove the session-era framing ("Fixed in this PR", "sibling sessions", "this session's open PRs"); keep live rows only, move the dated backlogs to notes/.
5. NOTES-INDEX: index or archive the 97 orphan notes, starting with the two AGENTS.md cites (AGENT-MEMORY, SURVEY-ASSETS-BRANCH) and DECISIONS-2026-10-26.
6. plans/: archive 3 SUPERSEDED + ~12 SHIPPED plans; index the 22 orphan plans that remain.
7. Reconcile the Codex hook claim: AGENTS.md:147 says none run; AGENT-SURFACE lists `.codex/hooks.json` (and the file exists).
8. Fold the UI/tooling satellites: CAPTURE-REVIEW + UI-EXPLORER → DESIGN-TOOLS; UI-MAP (self-declared historical) → USAGE-PATHS/COMPONENTS or archive.
9. Pick one generated hook table: AGENT-HOOKS duplicates the DEBUG-HOOKS generated index.
10. ARCHITECTURE-MAP: fix "every ratchet saturated" (7/14), swap its command table for a VERIFICATION link; and stop the TESTING-COVERAGE generator from emitting "@ts-check" as a summary.

COVERED: docs/{AGENT-HOOKS,AGENT-SURFACE,AGENT-WORLD-API,ARCHITECTURE-MAP,ARCHITECTURE-REVIEW,ARCHITECTURE,BUGS,CAPTURE-REVIEW,CAREER,CODE-STANDARDS,
COMPONENTS,CONSOLE-RECIPES,DEBUG-HOOKS,DESIGN-TOOLS,EVIDENCE-STORAGE,FLOW,LAYOUT-AUDIT,LIGHTING-TUNER-SLIDERS,LIGHTING,MULTIPLAYER,NOTES-INDEX,PACKAGING,
PERF-FINDINGS,PHYSICS,PLATFORM,README,RENDERERS,SCENERY-AND-TRACK-BUILD,SCENERY-API,SCENERY-GROUNDING,TESTING-COVERAGE,TESTING,TRACK-DESIGNER,UI-EXPLORER,
UI-MAP,USAGE-PATHS,VERIFICATION,WORKERS,ui-experience-studio}.md; docs/plans/* (status lines + retired-term counts; heads only, not full bodies);
NOTES-INDEX row/orphan check. Big docs (DEBUG-HOOKS, ARCHITECTURE, TESTING, PHYSICS, CAREER, SCENERY-API) were read at the head and grep level only, not in full.
