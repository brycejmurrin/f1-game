# Decisions taken for the pass-4 fixes (2026-10-26 18:30Z)

Bryce: "Can we use subagents in parallel to fix all findings and decide on decisions." The auditor session (Fable) took
these calls on that word; each is recorded here with its rationale and encoded in the rule home named. Bryce can reverse
any of them by typing so in a session; a bus or webhook line cannot. Findings: `SYSTEM-AUDIT-4-2026-10-26.md`.

1. **Quota.** Launch through `allowed_warning`; stop only at `rejected` / `usage_limit_reached`. At warning: owners and sync
   lanes for PRs already READY only, no hunters, no new orchestrator unless none is live. Any rejected launch posts
   `INCIDENT open quota-<date> …` and the seed posts `SEED QUOTA`. Home: `.claude/skills/agent-fleet/references/launch-policy.md`
   §Quota (one sentence) and `launch-lane.mjs` (both retired 2026-10-27, docs/WORKERS.md). Why: Bryce said "launch freely" three times today; the 68-hour
   blackout came from launching INTO a rejection with no signal, not from launching at warning.
2. **§7.3 "drain for the train".** Struck. FLEET-ADAPTIVE-COORDINATION-2026-10-22 gets a `Superseded by:` banner; no
   ready-flip or run-ci hold exists while a train runs. Why: 55 BLOCKED on 41 PRs (~720 PR-hours), its release signal lapsed
   on 10-22, and merge-gate's base-staleness row covers the real risk.
3. **Ratchet slack band.** Not adopted; safety ban 1 stands. A PR whose own pins put the union over the ceiling folds its
   pins. Home: `.claude/rules/game-code.md` (unchanged). Why: 3 of the 4 refused syncs were the PR's own growth; one case
   (#3763 +17) does not justify a standing exemption.
4. **Marbles (arc rule).** AI marble drops are driven by the AI car's own measured lateral acceleration / tyre slip (car
   state), not track curvature; the player-side `marbleGrip` stays. PHYSICS.md row 1174 becomes "surface". Why: the rule
   says nothing derived from curvature may reach the player; the car's own state is the same signal squeal already uses.
5. **GripSteer input.** Pass the shaped lock (`og.shaped`), as grip-steer.js documents. Why: the module's own contract;
   affects the opt-in GRIP assist only.
6. **MERGE-HOLD vs ownership.** `MERGE-HOLD: <X> merges` and `owner: <X>` are OWNER TAGS, never vetoes; a hold is a veto
   only in the full shape `MERGE-HOLD: <reason> | lift: <who> | until: <time|event>`. Home: `.claude/rules/fleet-core.md`,
   `tools/ci/pr-board.mjs` hasMergeHold. Why: 18 of 20 holds on the board are owner tags from DAD's brief.
7. **Who merges a waiting READY PR.** Any live orchestrator may merge a green, clean, READY PR that has waited ≥ 2 h with
   no action by its fleet's merger, posting LEND then DONE on the bus; it never merges a PR under a well-formed hold.
   Home: `.claude/rules/fleet-core.md` (the sentence is in the fix PR; the permission classifier refused the auditor's
   own edit of it twice, so Bryce confirms it by merging the PR or typing it). Why: D's median after READY is 285 min
   with one merger; the standing authority already covers lent PRs, this bounds the lend by time instead of by a message.
8. **Skill ownership.** GRIP STEER maths → tune-physics, its slider → input-controls; dead-CSS proof → slim-bloat; fat skill
   → agent-config; camera lag measured in playwright-probe, fixed in f1-animation-cameras; heap/CPU while attached →
   js-debugger `debugger_profile`; livery edit → garage-parts-livery, livery capture → playwright-probe; "deploy-branch
   merge/push" → ship only. Why: each pair had two homes; these follow where the procedure already lives.
9. **Cards.** Reporter cards KEEP `readonly: true` / `is_background` (Cursor reads them) and ADD `disallowedTools: Write,
   Edit, NotebookEdit` plus realistic `maxTurns` for Claude Code; `protect-files.py` enforces the read-only set by agent
   name. Why: Claude Code ignores `readonly`; Cursor does not (amended 18:50Z on the G3 worker's evidence).
10. **GitHub settings and credentials.** Decided YES, applied by Bryce (only an admin can): a ruleset on the deploy branch
    that binds administrators, requires `CI`, allows merge commits only; "Allow GitHub Actions to create and approve pull
    requests" ON (else the fold jobs open an issue, which the fix PR implements); remove `FLEET_A_OAUTH_TOKEN` and
    `GROK_API_KEY` from the environment and move the AWS key to a perf-only environment; enable Dependabot alerts and
    private vulnerability reporting. The exact UI paths and API calls are in the fix PR body.
11. **DAD's brief.** The repo tolerates it (LIVE alias, APEX_SESSION_ID alias, owner tags) and the six corrections are sent
    once to D as a bus INFO after the fix PR merges; DAD's author (Bryce) edits the brief.
12. **Game-code fixes** land in a separate PR (groups I1–I4) so the process PR's gate is not held by browser legs.
