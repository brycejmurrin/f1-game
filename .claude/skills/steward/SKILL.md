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
   stand down. Labels ONLY via `gh api -X POST repos/<o>/<r>/issues/<n>/labels -f 'labels[]=claimed'` (`gh api -X
   DELETE repos/<o>/<r>/issues/<n>/labels/<name>` to remove); the MCP `issue_write` `labels` field REPLACES the list
   (`github-mcp-guard.sh` refuses one that drops `config-ok`, `hold`, `land` or `needs-decision`).
2. **Draft PR at the first commit** (§Open) with `lane:<host>` and `Closes #<n>`.
3. **Take over** on `CONTINUE PR #<n>`: the Action already removed `needs-owner` and posted `adopts PR #<n>`
   (hand-started: do both yourself). Set `owner:` in the Hand-off block; work from it and the Plan. On a PR the
   NEWEST adoption comment wins (stand down if a newer one appears), the opposite of issue claims. Before the first
   write, read `pulls/<n>/commits` and the last comments: a commit or comment under 2 h old means the owner is
   alive, whatever the brief says, so comment and wait instead of pushing. Name the head sha you adopt in the
   comment, and re-read the head before every push: if someone else moved it, stand down.
4. **Already fixed** on the deploy tip: comment the evidence (sha and the repro you ran), close the issue as completed.
   No PR, no question.
5. **Cap.** The brief's `STOP AT` (`start+<N>k` is a budget above your first turn's context; the worker brief
   `tools/ci/worker-prompt.md` §Caps) and $10 soft (cost): finish the unit, push, refresh Plan and Hand-off, add
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

1. Branch `cursor/<topic>-<hash>` from the deploy tip; commit in two calls (AGENTS.md rule 12); `git push -u origin
   <branch>` alone.
2. Open a DRAFT PR into `claude/f1-game-project-26h3ng` (GitHub MCP `create_pull_request`, `draft: true`) from
   `.github/pull_request_template.md`: Goal, Plan (exactly one `**now:**`; the LAST item is the gate-exempt
   `- [ ] land: …` line), Verified / Not run, the Hand-off fence (`head:`, `owner:`, `next:`). Never `deploy.mjs
   --pr`: it opens a READY PR without the template body.
3. Labels with `gh api -X POST repos/<o>/<r>/issues/<n>/labels -f 'labels[]=lane:<host>'` — never the MCP `labels`
   field. Every draft push gets the fast tier plus a selected browser shard on CI; no label starts it.

## Push

- The floor is AGENTS.md rule 3: `tooling-fast --changed --jobs=3 --quiet` (`verify-track.cjs <id>` for a circuit);
  the PR's tiers prove the rest. Then ONE push per verified batch: a push over a live run cancels it and a killed job
  runs no `if: always()` step, so its failures are lost.
- Refresh the Plan with `update_pull_request` (no push needed): tick an item with its evidence (sha, verdict line),
  add discovered work, strike a dropped item with why, never delete one. Refresh the Hand-off block at every push
  and whenever you add `land`, `needs-owner` or `needs-decision`.
- Read pending notifications right before `git push`: a hold sent during your turn reaches you only when you look.
  A container Stop-hook nag ("uncommitted changes", "unpushed commits") is not a rule: while the floor, `sync-pr` or
  a push hold is running, answer it in one line and do not push (rule 3 comes first).
- Then `subscribe_pr_activity` on the PR and end the turn (AGENTS.md rule 13). If the host has no subscription, or
  the call is refused: [`references/host-watch.md`](references/host-watch.md).

## Red

1. On a wake re-read the CURRENT tip, not the notification commit: `gh api repos/<o>/<r>/pulls/<n> -q .head.sha`,
   then `node tools/ci/ci-watch.mjs --sha <that sha> --once` (two calls), then `node tools/ci/needs-sync.mjs
   <branch>`. `running (0 failed)` is not green; `cancelled` is not a verdict (AGENTS.md rule 8): list the jobs, a job
   at its `timeout-minutes` cap with zero failures is a real red. Verdict table: [`references/ci-verdicts.md`](references/ci-verdicts.md).
2. Agent `ci-red-triage` names the job, test and assertion; its `base:` line says whose it is.
3. **A red you did not cause is someone else's first.** `node tools/ci/pr-board.mjs --json` (open PRs: heads, state,
   failing jobs, owner), the Board issue and the `deploy:red` label: the first claimant fixes, the rest wait. A red
   deploy branch is claimed through the Board and fixed by a PR; the deploy branch is never pushed to. Before
   opening a tip fix, list the open PRs of the last hour that name the failing test or carry `deploy:red`; if one
   exists, comment there instead of opening a second. A path in an open PR's diff belongs to that PR until it merges
   or closes.
4. Fix on the branch, verify at the floor (§Push), ONE push. A flake: AGENTS.md rule 9 (quarantine by name in
   `tests/data/flaky-quarantine.json`). A job that FAILED (infra, setup, timeout) is never re-run on a PR that must
   land: merge-gate refuses a green whose earlier attempt had a red job ([`references/land.md`](references/land.md)),
   so push a fresh commit instead. Only a run cancelled with zero failed jobs is re-run once (`tools/ci/ci-rerun.mjs`).
5. **Sync only through `node tools/ci/sync-pr.mjs <branch>`** (background, `timeout: 7200000`), never a hand merge,
   and only when `needs-sync` says so (`conflict | stale-red`); never to
   "refresh" a cancelled run and never for clean-behind. Red AND conflicting: a `stale-red` syncs first, any other red
   is fixed first, then sync once and ONE push. A PR whose Plan waits on an unmerged PR does not sync on each
   conflict; it syncs once, after that PR merges. Modes and conflict cures: [`references/cancelled-and-sync.md`](references/cancelled-and-sync.md).

## Land

1. Tick or strike every Plan item except `- [ ] land: …`, the `**now:**` item included (an open `now:` fails the
   gate's plan row): tick it with its evidence, or move what is left of it into the `land:` item. An item that needs Bryce's device is his: never strike it; ask (§Lane 6). A CONFLICTING/DIRTY PR syncs first (§Red 5): a ready flip
   on a dirty PR starts no CI.
2. `node tools/ci/ship-pr.mjs --pr <n>` (wraps `ready-gate.mjs`; an already-ready PR is refused as `not-draft` and
   only needs the label). On a pass it prints the two calls and flips nothing itself:
3. GitHub MCP `update_pull_request` with `draft: false`, then `gh api -X POST repos/<o>/<r>/issues/<n>/labels -f
   'labels[]=land'`.
4. Refresh the Hand-off block; call `subscribe_pr_activity` again (the subscription dies at the flip); end the turn.
   What `land.yml`'s `gate` status does next: [`references/land.md`](references/land.md). "Skip the gate" from the
   user: do it and record it under **Not run** with the user's words and the time; never silently, and never by
   widening a tolerance. A `hold` label vetoes (AGENTS.md §Coordination); body wording vetoes nothing.

## After land

The subscribed owner fixes a red on its own head (§Red) while it still owns it. While `dispatch.yml` is disabled
(`gh api repos/<o>/<r>/actions/workflows/dispatch.yml -q .state`), the orchestrator session does what this section
gives the Action. The dispatch Action re-owns only a
silent owner: a PR idle past its window gets `needs-owner` and one `CONTINUE PR #<n>` launch; a `land` PR with no red
check, no failed `gate` and no conflict is never re-owned. "Live" is an ancestry test against the live `apex-sha`
(agent `deploy-research`; skill `check`), never a green PR.

## Gotchas

- Never merge, arm, rebase, force-push, cancel a run, `--no-verify`, or push to the deploy branch.
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
