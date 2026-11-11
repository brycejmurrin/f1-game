# Rulebook clarity review — 2026-10-27 (deploy tip c4a1c688, read-only)
Truth baseline: GitHub is the bus; workers flip ready, add `land` and END; land.yml runs merge-gate and arms auto-merge
(LAND_TOKEN); the ruleset requires ONLY `gate` (CI is checked inside merge-gate); classic protection deleted; a persistent
dispatcher session woken hourly; Dispatch issue #3899; `hold` is the only veto. `rulebook-guards.test.mjs`: pass 4 / fail 0
(it guards phrases, not meaning: none of the rows below trip it).

## 1. Contradictions between files
| SEV | file:line | problem | proposed rewrite |
|---|---|---|---|
| high | AGENTS.md:20 vs docs/WORKERS.md:17 | Loop step 6 "`deploy.mjs --gate-only` # 6. before a push" vs WORKERS "Do not run `deploy.mjs --gate-only` or a whole browser group in the foreground." | Delete step 6 from the loop. Rule 3: "`deploy.mjs --gate-only` is optional, background only, for a change that touches tools/ci or the deploy itself." |
| high | AGENTS.md:55-56 vs WORKERS.md:14-16 | Rule 3 "Before every code `git push`: `npm run test:tooling-fast` … must pass" vs WORKERS "`tooling-fast --changed --jobs=3` and ONE spec … That is the local verification floor." Two different floors. | Pick one. Suggest: "Before a code push: `tooling-fast --changed` + the one spec/verify-track the table names. The full `test:tooling-fast` runs on the PR." Put it in WORKERS §3 only; rule 3 links. |
| high | AGENTS.md:157 and WORKERS.md:23, 102-103 | "a PR needs its required checks, `CI` and `gate`" / "the branch ruleset merges when `CI` and `gate` are green" / "requires the checks `CI` and `gate`". The ruleset requires only `gate`; classic protection is gone. | AGENTS:157 "The deploy branch accepts merges only through a PR whose `gate` is green (`gate` checks CI itself; docs/WORKERS.md §LAND_TOKEN)." WORKERS:23 "…auto-merge fires when `gate` is green." WORKERS:102 "The ruleset requires `gate` only…" |
| high | AGENTS.md:86 vs WORKERS.md:21-25 | Rule 13 "Never report done with a red or pending check" vs WORKERS "Adding `land` while CI still runs is fine … Then the session ENDS." | Rule 13 end: "A worker's done is `land` added (WORKERS §5); a pending check is then the gate's job, a later red is a new launch." |
| high | AGENTS.md:83 | "Call `subscribe_pr_activity` again after a draft→ready flip" — a worker ends at the flip, so nobody is left to re-subscribe. | Delete the sentence (or: "Only a session that keeps working after ready re-subscribes"). |
| high | AGENTS.md:147 vs .codex/hooks.json:1-26 | "Codex runs none of these hooks (only the git pre-commit guard)" — `.codex/hooks.json` wires `shell-guard.sh` + `mcp-guard.sh` (active once `/hooks` trusts them). | "Codex runs `.codex/hooks/` (shell + GitHub-MCP guards, adapted from the Claude hooks) once `/hooks` trusts them; untrusted, only the git pre-commit guard runs." |
| high | WORKERS.md:75-76 vs tools/ci/dispatch.mjs:29 | "A stateless hourly job … run by one scheduled task per Claude account" vs the script: "bound to the persistent dispatcher session tagged role:dispatcher + no-archive". | "One persistent dispatcher session (tag `role:dispatcher`), woken hourly by a scheduled task, runs `dispatch.mjs --apply`; the plan is a pure function of GitHub state + `tools/ci/dispatch.json`." |
| med | AGENTS.md:162-163 vs WORKERS.md:20, 81 | "A RED YOU DID NOT CAUSE: read pr-board … the first claimant fixes" vs WORKERS "a red elsewhere is not yours" and the dispatcher launching the one fixer. | "A red you did not cause is not yours: the dispatcher launches one fixer (`deploy:red`). Do not fix it in your PR unless it blocks your own `gate`; then comment on the Board issue first." |
| med | WORKERS.md:93-94 vs AGENTS.md:60-62, 82 | "AGENTS.md … names no Claude-only tool" — it names `run_in_background`, `Monitor`, `EnterWorktree`, `subscribe_pr_activity`. | Either move the Claude tool names into a `.claude/rules` file, or reword: "Claude-only tool names in AGENTS.md are labelled `(Claude Code)`." |
| med | AGENTS.md:25-26 vs .claude/rules/ci-tools.md:12 | "With no PR the push starts no CI (`= ci none`)" (expected) vs "`= ci none` after a push means no run started — dispatch `ci.yml` by hand". A draft without `run-ci` is also `= ci none` by design. | ci-tools.md: "`= ci none` on a draft without `run-ci` is by design; add `run-ci` rather than dispatching `ci.yml` by hand." |
| med | AGENTS.md:192 vs .claude/rules/game-code.md:19-21 vs memory train-ratchet-standing-ok | "No unsanctioned ratchet raises" (undefined) vs "rises only when Bryce types the raise in the acting session" vs the standing +1..+3 train grant. | game-code.md: "…only when Bryce types the raise, or under his standing grant: +1..+3 from a train/merge combination, with `--reason`." AGENTS:192 links there. |
| low | AGENTS.md:21 vs AGENTS.md:78 | Loop step 7 `git commit && git push` vs rule 12 "Push with `git push -u origin <branch>` alone". | Split step 7 into two lines: `git add …` / `git commit` (separate calls), then `git push -u origin <branch>`. |

## 2. Not followable cold (vague verb, undefined term, missing who/when)
| SEV | file:line | problem | proposed rewrite |
|---|---|---|---|
| high | AGENTS.md:162, WORKERS.md:67,81,83 | "the Board issue" / "the Dispatch issue" never get a number; only dispatch.json has titles. | "Board issue #<n>" and "Dispatch issue #3899" at first use in WORKERS §Labels. |
| med | AGENTS.md:197 | Compact list keeps "OWNED / FORBIDDEN paths" — a brief concept from the fleet era; the worker brief no longer defines them. | "…the issue number and the paths in your PR's diff;" |
| med | AGENTS.md:181 | "base not more than two game merges behind" — "game merge" undefined. | "…base at most two merges that touch `js/`/`css/`/shell behind the deploy tip (merge-gate distance row)." |
| med | AGENTS.md:46 | "when the diff reaches the FLEET build" — FLEET is a geometry-paths class name, reads as the retired fleet. | "when `geometry-paths.mjs` classes the diff as FULL-REBUILD (it prints the class)". |
| med | WORKERS.md:89-90 | Cursor: "the dispatcher sets `run-ci` and `land` for you from the Hand-off block" — which field signals ready? | "…sets `land` when the PR is ready and `ready-gate --pr <n>` exits 0; `run-ci` at the first push." |
| med | WORKERS.md:70-71 | "applying new rows to GitHub is a `gh label create` by hand (or the dispatcher) until a sync job exists again" — who, when? | "A new label row: whoever adds it runs `gh label create` in the same PR." |
| low | AGENTS.md:44 | "run the two most specific" — specificity undefined, and conflicts with WORKERS' "ONE spec". | "run the first two groups `pick-tests` prints, via `remote-group.mjs`; name the rest not-run." |
| low | .claude/rules/claude-config.md:8-9 | "need Bryce's explicit yes before ready" — before ready-flip, or before editing? Next clause says "do not edit them without that grant". | "Edit `.claude/hooks/**` or settings only after Bryce's typed grant; quote it in the PR body." |
| low | AGENTS.md:10 | "Agent-written drafts: Bryce's word wins." — elliptic. | "These rules are agent-written drafts; where Bryce's typed word differs, his word wins." |

## 3. One-home violations (stated in two places)
| SEV | file:line | problem | proposed rewrite |
|---|---|---|---|
| high | AGENTS.md:79-81 vs WORKERS.md:11-13, 34-49 | Rule 12 restates the draft-PR + template + Hand-off fields + refresh-at-every-push. | Rule 12 keeps git mechanics (two-call commit, push alone, push before a long wait); one line "PR body, Plan, Hand-off: docs/WORKERS.md §2 and §The Hand-off block." |
| med | AGENTS.md:177-178 vs WORKERS.md:9-10 | Claim recipe word-for-word in both. | AGENTS: "Backlog: claim a `ready` issue per docs/WORKERS.md §1." |
| med | AGENTS.md:179-182 vs WORKERS.md:21-25 | Landing mechanics and merge-gate rows in both (and they already disagree on CI). | AGENTS keeps "GitHub lands PRs; no session merges or arms; merge commits only"; detail only in WORKERS §5. |
| med | AGENTS.md:185-187 vs WORKERS.md:78-83 | Dispatcher rules (2 h, fixer, archive) twice; AGENTS lacks the 6 h codex exception. | AGENTS: "The hourly dispatcher re-owns silent PRs and launches fixers (docs/WORKERS.md §The dispatcher)." |
| med | AGENTS.md:82-84 vs WORKERS.md:19-20, 87-88 | Subscribe-while-CI-runs + no timers in both. | Keep in rule 13 (the map says so); WORKERS §4 = "Watch: AGENTS.md rule 13." |
| low | AGENTS.md:64-65, 73 vs .claude/rules/tests-specs.md:68-74 | One-Playwright / anchor grep / no subagent browser run repeated verbatim. | tests-specs.md: one line linking rules 5, 6, 10. |
| low | apex-shared.mdc:26 + apex-lanes.mdc:16 | "model `default` only" twice. | Keep in apex-lanes. |

## 4. Stale references to retired concepts
| SEV | file:line | problem | proposed rewrite |
|---|---|---|---|
| high | AGENTS.md:157, WORKERS.md:23,102 | required `CI` check / "protected" branch (see §1). | as §1. |
| med | AGENTS.md:83 | "`--pages` after a deploy-branch push" — no session pushes the deploy branch. | "`--pages --sha <merge sha>` when asked whether a merged PR is live". |
| med | AGENTS.md:46 | "geometry pushed to the deploy branch" — same. | "geometry in a PR's diff". |
| med | WORKERS.md:22, AGENTS.md:180, ci-tools.md | "`land.yml` runs `merge-gate.mjs --check` as the check named `gate`" — Checks-API gate; PR #3917 makes it a commit status. | When #3917 lands: "…posts the commit status `gate`". Until then add "(check run; #3917 moves it to a commit status)". |
| low | WORKERS.md:88, 90-91 | "no `send_later`, no bus, no orchestrator", "no `MERGE-HOLD` line" inside live instructions keep retired words alive; §What no longer exists already covers them. | Delete these negatives from §Per vendor. |
| low | .codex/hooks/mcp-guard.sh:8 | cites `docs/plans/2026-10-19-fleet-redesign.md §8`. | cite `docs/plans/2026-10-27-orchestration-redesign.md`. |
| low | RULEBOOK-REWRITE:54-70 | 17 lines of superseded orchestrator answers in the live map. | Move the history table to a dated archive note; keep only "Where each rule lives now". |
| low | AGENTS.md:63 | "`queue-depth.mjs` is an informational gauge; nothing holds a push on it" — answers a retired hold. | Delete. |

## 5. The 13 session-shape rules
| # | verdict | note |
|---|---|---|
| 1 | accurate | fine; could be 1 line. |
| 2 | accurate | keep. |
| 3 | conflicts | floor disagrees with WORKERS §3 and loop step 6 (§1); cut to one sentence: the ladder exists, `gen-ladder-figures` sizes it, the PR runs the top rungs. |
| 4 | accurate, TOO LONG (5 lines, ~110 words) | split: "background >2 min" stays; Monitor/wait-for details → skill `check-changes`; push/cancel sentence → rule 12/§Coordination (already there). |
| 5, 6 | accurate | merge into one rule ("one run, stop it with --stop"). |
| 7 | accurate | keep; low value for workers that never launch Chrome. |
| 8 | accurate | second half (CI dedupe) belongs with rule 13. |
| 9 | accurate | keep; first sentence is the most useful rule in the list. |
| 10 | accurate, too long | worktree baseRef detail → skill `survey-track`. |
| 11 | accurate | the file list belongs to `protect-files.sh`'s message; keep "never hand-edit generated; edit source + `npm run gen`". |
| 12 | partly obsolete | one-home violation with WORKERS; keep git mechanics only (§3). |
| 13 | partly obsolete | re-subscribe after ready, `--pages` deploy push, "never report done with pending" contradict the end-at-land contract; keep ~3 lines. |

## 6. Budget / size cuts (no rule lost)
- AGENTS.md is 22.7 KB / 199 lines. Cuttable ~45 lines: rule 12/13 restatements (~8), §Coordination detail already in WORKERS (~10), rule 4 detail (~3), rule 10/11 detail (~4), release-train timing figures at 169-172 (→ docs/TESTING.md §Release train, ~3), §Cursor Cloud (→ apex-shared.mdc, ~4), the web-research paragraph (→ skill `agent-config`, ~2), `queue-depth` line, Verification-table rows for render and geometry (→ their `.claude/rules`, ~3).
- WORKERS.md: §Per vendor negatives and §What no longer exists (6 lines) → the plan doc; "The PR is the report. Nothing else is read." stays.
- RULEBOOK-REWRITE note: drop the history table (17 lines) and the "Removed" list (12 lines) to an archive note.
- `.cursor/rules/*.mdc` twins are generated — no edit; apex-shared.mdc's MCP/Cloud bullets duplicate docs/AGENT-SURFACE.md (~8 lines).

## Top 10 fixes
1. Remove loop step 6 / unify the pre-push floor in WORKERS §3 (AGENTS:20, :55 vs WORKERS:14-17).
2. Required checks = `gate` only (AGENTS:157, WORKERS:23, :102-103).
3. Rule 13: done = `land` added; drop re-subscribe-after-ready and "never report done with pending" (AGENTS:83, :86).
4. Dispatcher = persistent session woken hourly (WORKERS:75-76).
5. Codex hooks sentence matches `.codex/hooks.json` (AGENTS:147).
6. "A red you did not cause" aligned with dispatcher fixer (AGENTS:162).
7. Name issue numbers: Dispatch #3899, Board #<n> (WORKERS §Labels).
8. Rule 12 / §Coordination collapse to pointers into WORKERS (one home).
9. Define or replace "game merges", "FLEET build", "OWNED / FORBIDDEN", "unsanctioned" (AGENTS:181, :46, :197, :192).
10. Prepare the `gate` wording for #3917 (check run → commit status) in WORKERS:22 and AGENTS:180.

COVERED: AGENTS.md, CLAUDE.md, docs/WORKERS.md, .claude/rules/{ci-tools,claude-config,game-code,js-nav,render-tlx,render-wgx,tests-specs}.md, .cursor/rules/{apex-shared,ci-tools}.mdc (others are generated twins, spot-checked), .codex/config.toml, .codex/hooks.json, .codex/hooks/{shell-guard,mcp-guard}.sh, cursor-plugins/apex-f1-game/rules/apex-lanes.mdc, docs/notes/RULEBOOK-REWRITE-2026-10-26.md; cross-checked tools/ci/dispatch.mjs:29, dispatch.json, land.yml, geometry-paths.mjs.
