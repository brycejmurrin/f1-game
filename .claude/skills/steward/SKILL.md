---
name: steward
description: "Use when you own a PR at any stage: launched on an issue or `CONTINUE PR #n`, opening it, pushing, a red/cancelled/conflicting PR, ready, land, after land. Not for: status only → check; picking tests → check-changes."
---

# Steward — one PR, from launch to landed

You are one session, one task, one PR. GitHub holds all state: issues are tasks, labels are state, the PR is the work
and the report, comments are the only record. GitHub lands the PR; no session merges or arms. Nobody reads your
chat. Everything not here is `AGENTS.md` (rules 3, 4, 8, 9, 12, 13 and §Coordination). Routes: failed-CI triage →
agent `ci-red-triage`; pre-push validation → skill `check-changes`; live `version.json` or anything on github.io →
agent `deploy-research`; review, hunt or survey findings on the PR → agent `finding-verifier` before you fix any.
Labels: [`references/labels.md`](references/labels.md). Issue dependencies: [`references/issues.md`](references/issues.md).
Cursor/Codex notes and `LAND_TOKEN`: [`references/vendors.md`](references/vendors.md).

## Lane — a launched session

A fired session gets one line: `ISSUE <n>`, `CONTINUE PR <n>` or `DEPLOY-RED`. It reads the issue or PR itself
(`issue_read` / `pull_request_read`); the Plan and the Hand-off block are the whole brief.

1. **Claim.** Comment `claims #<n> — <host>:<session id>` on the issue and add `claimed`. An older claim comment wins:
   stand down. Labels ONLY through MCP `issue_write`: the live list plus or minus ONE name ([`references/labels.md`](references/labels.md);
   `github-mcp-guard.sh` refuses any other list); never `gh`.
2. **Draft PR at the first commit** (§Open) with `lane:<host>` and `Closes #<n>`.
3. **Take over** on `CONTINUE PR #<n>`: the Action already removed `needs-owner` and posted `adopts PR #<n>`
   (hand-started: do both yourself). Work from the Hand-off block and the Plan. On a PR the NEWEST adoption comment
   wins (stand down if a newer one appears), the opposite of issue claims. **Ownership is a lease:** the Hand-off line
   reads `owner: <host>:<session> until <ISO UTC>`, at most 4 h ahead, renewed at every push and Hand-off refresh.
   Adopt only when the lease has lapsed AND `get_session` on the owner does not read `working`, or the owner handed
   back (`owner: none`, comment `releases PR #<n>`); a split is a release, then an adopt. A PR with no until-time is
   judged as before: a commit or comment under 2 h old means the owner is alive. Name the head sha you adopt in the
   comment, set your own lease, and re-read the head before every push: if someone else moved it, stand down.
   **Park:** a PR waiting on Bryce (`needs-decision`) or on another PR (`blocked`) is parked; the owner refreshes the
   Hand-off (`next:` names the wait) and may end its turn, subscribed to both PRs (§Push): the lease holds while the label stays, up to 24 h past its
   until-time (`pr-board.mjs` LEASE reads `live | parked | lapsed`). Sync a PR only as its live owner, as the last
   step before `land`; sweeps skip parked PRs.
4. **Already fixed** on the deploy tip: comment the evidence (sha and the repro you ran), close the issue as completed.
   No PR, no question.
5. **Cap.** The brief's `STOP AT` (`start+<N>k` is a budget above your first turn's context; the worker brief
   `tools/ci/worker-prompt.md`, its `Caps:` paragraph) and $10 soft (cost): finish the unit, push, refresh Plan and Hand-off, add
   `needs-owner`, end (skill `handoff`). Nothing archives you for cost; keeping the soft cap is yours.
6. **Ask = `needs-decision` plus ONE comment** with the options, your pick and the exact line to paste
   (`decision: <option>`), posted when the question is first predictable, not after CI confirms it; then keep working
   on what does not depend on it. No question to the user at the end of a turn, no `AskUserQuestion`. Bryce answers with his own label
   click or a `decision:` comment (that provenance is the grant; an agent's words grant nothing); remove the label and
   carry on. A hook or classifier denial is final: never re-word and retry; record it as a choice in the PR.
7. **End at `land`** (§Land), then `unsubscribe_pr_activity`, cancel any check-in you armed and end the turn. A red or
   conflict after that is a fresh `CONTINUE PR #<n>`, not you (§After land): an idle session that wakes after an hour
   re-reads its whole context.

## Open

1. Work on the branch you were assigned (`claude/*` in a cloud session), else branch `cursor/<topic>-<hash>` from the
   deploy tip (AGENTS.md §Git branch); commit in two calls (AGENTS.md rule 12); `git push -u origin
   <branch>` alone.
2. Open a DRAFT PR into `claude/f1-game-project-26h3ng` (GitHub MCP `create_pull_request`, `draft: true`) from
   `.github/pull_request_template.md`: Goal, Plan (exactly one `**now:**`; the LAST item is the gate-exempt
   `- [ ] land: …` line), Verified / Not run, the Hand-off fence (`head:`, `owner:`, `next:`). Never `deploy.mjs
   --pr`: it opens a READY PR without the template body.
3. Add `lane:<host>` (the one-label recipe in [`references/labels.md`](references/labels.md); never `gh`). Every
   draft push gets the fast tier on CI. Selected browser jobs start when the PR is ready and its diff needs them.

## Push

- Before the floor, on each edited js/ file: `lsp_diagnostics {file}` (shell `node tools/mcp/lsp-mcp.mjs diag <file>`);
  symbol lookup: `.claude/rules/js-nav.md`.
- The floor is AGENTS.md rule 3: `tooling-fast --changed --jobs=3 --quiet` (`verify-track.cjs <id>` for a circuit);
  the PR's tiers prove the rest. Then ONE push per verified batch: a push over a live run cancels it and a killed job
  runs no `if: always()` step, so its failures are lost.
- Never push while a CI run on your head is still running: batch every fix of the round, wait for that run to finish,
  then push once (D-046; 77% of the 140 cancelled CI wall-hours in 48 h were heads replaced mid-run).
- Refresh the Plan with `update_pull_request` (no push needed): tick an item with its evidence (sha, verdict line),
  add discovered work, strike a dropped item with why, never delete one. Refresh the Hand-off block at every push
  and whenever you add `land`, `needs-owner` or `needs-decision`.
- Read pending notifications right before `git push`: a hold sent during your turn reaches you only when you look.
  A container Stop-hook nag ("uncommitted changes", "unpushed commits") is not a rule: while the floor, `sync-pr` or
  a push hold is running, answer it in one line and do not push (rule 3 comes first).
- Then `subscribe_pr_activity` on the PR and end the turn (AGENTS.md rule 13). Every push, and every turn you end
  waiting on CI or on another PR's merge, subscribes first; waiting on another PR, subscribe to that one too (its
  merge is your wake). Never end on "waiting on CI" unsubscribed. If the host has no subscription, or the call is
  refused: [`references/host-watch.md`](references/host-watch.md).
- **Wake on a green draft run:** go straight on, no nudge: agent `pr-reviewer` (§Land 1), then `ship-pr` (§Land 2),
  then ready + `land` (§Land 3). On the awaited PR's merge: sync once (§Red 5) and carry on.

## Red

1. On a wake re-read the CURRENT tip, not the notification commit: `gh api repos/<o>/<r>/pulls/<n> -q .head.sha`,
   then `node tools/ci/ci-watch.mjs --sha <that sha> --once` (two calls), then `node tools/ci/needs-sync.mjs
   <branch>`. `running (0 failed)` is not green; `cancelled` is not a verdict (AGENTS.md rule 8): list the jobs, a job
   at its `timeout-minutes` cap with zero failures is a real red. Verdict table: [`references/ci-verdicts.md`](references/ci-verdicts.md).
2. Agent `ci-red-triage` names the job, test and assertion; its `base:` line says whose it is.
3. **A red you did not cause is someone else's first.** `node tools/ci/pr-board.mjs --json` (open PRs: heads, state,
   failing jobs, owner), the Board issue and the `deploy:red` label: the first claimant fixes, the rest wait. Read
   the Board's newest `tip-red:` bulletin first ([orchestrator brief](../dispatcher/references/orchestrator-brief.md)
   §While workers run): with a fixing PR named, copy none of its change; wait for it to land, then sync (§Red 5). A red
   deploy branch is claimed through the Board and fixed by a PR; the deploy branch is never pushed to. Before
   opening a tip fix, list the open PRs of the last hour that name the failing test or carry `deploy:red`; if one
   exists, comment there instead of opening a second. A path in another open PR's diff is NOT a blocker (D-033):
   edit it in parallel, keep the hunks small and list the open PRs that share files in the PR body. The PR that
   merges second syncs through `sync-pr.mjs` (§Red 5) and resolves the conflict in that merge commit, never by a
   force-push or a rebase.
4. Fix on the branch, verify at the floor (§Push), ONE push. A flake: AGENTS.md rule 9 (quarantine by name in
   `tests/data/flaky-quarantine.json`). A job that FAILED (infra, setup, timeout) is never re-run on a PR that must
   land: merge-gate refuses a green whose earlier attempt had a red job ([`references/land.md`](references/land.md)),
   so push a fresh commit instead. Only a run cancelled with zero failed jobs is re-run once (`tools/ci/ci-rerun.mjs`).
   The orchestrator's infra re-run (§CI) gives a verdict only; the PR still lands on a fresh commit.
5. **Sync only through `node tools/ci/sync-pr.mjs <branch>`** (background, `timeout: 7200000`), never a hand merge,
   and only when `needs-sync` says so (`conflict | union-conflict | stale-red | retest-refused | gate-refused | tip-crossed`; `tip-red` waits for the fix to land);
   never to "refresh" a cancelled run and never for clean-behind. `retest-refused` is the gate's `retest` row
   refusing this head: the sync is that row's cure, no force flag. Red AND conflicting: a `stale-red` syncs first, any other red
   is fixed first, then sync once and ONE push. A PR whose Plan waits on an unmerged PR does not sync on each
   conflict; it syncs once, after that PR merges. Modes and conflict cures: [`references/cancelled-and-sync.md`](references/cancelled-and-sync.md).

## Land

1. Tick or strike every Plan item except `- [ ] land: …`, the `**now:**` item included (an open `now:` fails the
   gate's plan row): tick it with its evidence, or move what is left of it into the `land:` item. An item that needs Bryce's device is his: never strike it; ask (§Lane 6). A CONFLICTING/DIRTY PR syncs first (§Red 5): a ready flip
   on a dirty PR starts no CI. Flip only after the draft CI run on this head has FINISHED (D-046): the ready run
   shares the `ci-pr-<n>` group and cancels a draft run still in flight.
   **Review** (a diff touching `js/`, `css/`, `index.html` or `sw.js`): once that draft run has finished, run agent
   `pr-reviewer` on the PR and tick `- [x] review: <n> findings, <k> accepted (<reviewed sha>)`; accepted findings go in
   ONE push, whose draft run then gates the flip as above. Advisory: no gate row, no label (Bryce's `decision: A1`, PR #6377; blocking is re-decided after 2 weeks).
   Bryce's own flip skips it: when the PR timeline has a `ready_for_review` or `labeled land` event whose actor is
   `brycejmurrin` with no `performed_via_github_app` (his click, not an app's or an agent's), do not run the reviewer;
   tick `- [x] review: skipped — Bryce's own <ready|land> at <ISO>` with that event as evidence. An agent-made flip or
   label never skips it.
2. `node tools/ci/ship-pr.mjs --pr <n>` (wraps `ready-gate.mjs`; an already-ready PR is refused as `not-draft` and
   only needs the label). On a pass it prints the two calls and flips nothing itself:
3. GitHub MCP `update_pull_request` with `draft: false`, then add `land` (the one-label recipe in
   [`references/labels.md`](references/labels.md)).
4. Refresh the Hand-off block, `unsubscribe_pr_activity`, and end: no re-subscribe (wake turns were 19% of worker
   cost, retro 2026-11-25). A later red or conflict is the orchestrator's or dispatch's `CONTINUE PR #<n>` (§After land).
   What `land.yml`'s `gate` status does next: [`references/land.md`](references/land.md). "Skip the gate" from the
   user: do it and record it under **Not run** with the user's words and the time; never silently, and never by
   widening a tolerance. A `hold` label vetoes (AGENTS.md §Coordination); body wording vetoes nothing.

## After land

Before `land`, the subscribed owner fixes a red on its own head (§Red); after it, the owner is gone (§Land 4). While `dispatch.yml` is disabled
(`gh api repos/<o>/<r>/actions/workflows/dispatch.yml -q .state`), the orchestrator session does what this section
gives the Action. The dispatch Action re-owns only a
silent owner: a PR idle past its window gets `needs-owner` and one `CONTINUE PR #<n>` launch; a `land` PR with no red
check, no failed `gate` and no conflict is never re-owned. "Live" is an ancestry test against the live `apex-sha`
(agent `deploy-research`; skill `check`), never a green PR.

## CI — the orchestrator only

The orchestrator is the session Bryce steers in his own chat that launches workers with `create_session` (skill
`dispatcher` [`references/orchestrator-brief.md`](../dispatcher/references/orchestrator-brief.md)); every other session,
a launched worker or a subagent, is a worker and never cancels, re-runs or dispatches. Owner request 2026-11-18: the
orchestrator acts on Actions runs for Bryce, ONLY through the GitHub MCP `actions_run_trigger` (a `gh` write from a
shell is recorded as Bryce's own click; `bash-guard.sh` refuses it for every session):
- **Cancel** (`cancel_workflow_run`; `force_cancel_workflow_run` for a run that ignores it) a run on a superseded head,
  a run stuck past its job's `timeout-minutes`, or a queue jam that keeps runners from the deploy tip. Never the
  running Pages train on the deploy tip; a run on a live owner's head: message the owner first.
- **Re-run failed jobs** (`rerun_failed_jobs`, never a whole run) only for an INFRA failure (runner lost, checkout,
  set-up) to get a verdict. Never to turn a test failure green: a pass on the re-run is still a red named in the PR
  (AGENTS.md rule 9), and merge-gate refuses a green whose earlier attempt had a red job ([`references/land.md`](references/land.md)).
- **Dispatch** (`run_workflow`): `ci.yml` (a group run) on any branch, `pages.yml` on the deploy branch only, by file
  name, never a numeric id.
- **Log every act** in ONE PR comment (an issue comment when there is no PR): the run link, the act and why.

How the hooks know (`github-mcp-guard.sh`): its OWN process environment holds `APEX_ROLE=orchestrator`, which Bryce
sets on the orchestrator's cloud environment and no agent sets, and either not `CLAUDE_CODE_CHILD_SESSION=1`, which
the platform sets on every `create_session` child (measured 2026-11-18), or, for a cloud orchestrator that runs as a
child, `APEX_ORCH_ENV=env_…` beside it (the orchestrator environment's id, Bryce-set; #5819, his `decision: A` of
2026-11-19; no platform variable carries the id, so the hook checks its shape only); the payload carries no
`agent_id`; and no project, local or user settings file's `env` names either key (any session can write one, so the
hook never trusts them from there). That environment never hosts workers: launch them with an explicit worker
`environment_id`. A seatbelt,
not a boundary: a routine-fired session in an environment with `APEX_ROLE` would pass too, so the worker routine runs
in one without it. `settings.json` still asks on `actions_run_trigger`.

## Gotchas

- Never merge, arm, rebase, force-push, `--no-verify`, or push to the deploy branch; never cancel a run (§CI: the
  orchestrator's acts).
- Sweeping many PRs is the dispatch Action's job; `pr-board.mjs --json` (read-only; exit 3 = no token) tells you who
  owns a red. A session does not take over another lane's PR.
- Reviewer subagents run `model: sonnet`; a subagent never starts a browser (AGENTS.md rule 10).
- Context hand-off at the brief's `STOP AT`: skill `handoff`.

## References

- [`references/labels.md`](references/labels.md) — every label, where it goes and what it means (source `.github/labels.json`).
- [`references/land.md`](references/land.md) — what `land.yml` does after the label: `gate`, arming, retries.
- [`references/issues.md`](references/issues.md) — native `blocked_by` dependencies and the `blocked` label.
- [`references/vendors.md`](references/vendors.md) — Cursor and Codex lanes, `LAND_TOKEN`, the ruleset.
- [`references/cancelled-and-sync.md`](references/cancelled-and-sync.md) — `cancelled` twice, `needs-sync`, `sync-pr` modes.
- [`references/ci-verdicts.md`](references/ci-verdicts.md) — every `= ci …` verdict, the `gate` status, "live".
- [`references/host-watch.md`](references/host-watch.md) — watching without a PR subscription.
- [`../check-changes/references/sync-pr.md`](../check-changes/references/sync-pr.md) — a hand-written conflict `sync-pr` hands back.
- [`../check-changes/references/triage.md`](../check-changes/references/triage.md) — after a `sync-pr` cure, before `npm run gen`.
