---
name: steward
description: "Use when you own, pick up or are handed a PR, or a PR or the deploy branch is red, cancelled, conflicting or its CI watch expired: Plan, failing test, sync-pr, push once per green cycle."
---

# Driving a PR to green in Apex 26

**This file is the OVERRIDES, not the protocol.** Generic PR-stewardship rules
are right about most things and wrong about the specifics below, each of
which has cost a session before. Everything not listed here: `AGENTS.md`.

Routes: owning PRs (claim → ready → report, spawn prompt) → `agent-fleet` `references/role-pr-owner.md` §The steward loop ([`references/ownership.md`](references/ownership.md) is its forwarding stub). A red `ci.yml` / `pages.yml` run → agent `ci-red-triage` (read-only, returns
the status line). Pre-push validation → `check-changes`. Live `version.json` or
anything on github.io → agent `deploy-research` (the only thing here that reaches it).
Review, hunt or survey findings on the PR → agent `finding-verifier` before you fix any of them.

**Re-entry: read ONE section, not the file.** "Check" / a CI wake → §8 · red → §3, then agent `ci-red-triage` ·
`cancelled` → §1 · conflicting → §2 · "Merge" / "mark ready" → §12 · "is it live?" → §7 · no subscription or timer →
§9 · many PRs → §10.

## Drive to green — the loop

1. Check out the PR's branch, then claim it (§3).
2. Read CI on the current tip: `node tools/ci/ci-watch.mjs --sha <head> --once` (§1 for `cancelled`, §8 for `running`).
   Never poll runs, jobs or check-runs through a connector or `gh api` (Codex archive: 468 MB, results cut at ~64 KiB);
   per-job progress is the watcher's log. Never kill a live watcher to narrate progress.
3. Triage a red: agent `ci-red-triage` names the job, test and assertion.
4. Fix on the branch; sync only when §2 says you must.
5. Gate: `node tools/ci/deploy.mjs --gate-only` (§6).
6. ONE push per verified batch; refresh the PR body's Plan and Status.
7. Draft → ready → READY → merged: §12 (the rule: `.claude/rules/fleet-core.md`).
8. Watch (§7, §9) until `= ci passed`; `who-is-on-it.mjs --release` every claim before your final answer
   (21 of 61 claiming Codex threads never released).

## 1. `cancelled`: read the jobs, not the conclusion

Which `cancelled` is benign (the draft/ready dedupe on one `head_sha`) and which
is a timeout is AGENTS.md rule 8. Deploy-branch pushes queue in pages.yml's
`pages-train-*` group (`ci-watch.mjs --sha` says `superseded`). A job at its
`timeout-minutes` cap with zero failures is a real red. List the run's jobs
before deciding; agent `ci-red-triage` does that and returns the status line.

A PR that ends `cancelled` twice with zero failures:

1. `node tools/ci/ci-watch.mjs --sha <head sha> --once` (exit 2 / `= ci cancelled` =
   newest run per workflow, no failed job, no live sibling).
2. Same head SHA both times → the dedupe or a push over a live run: wait for
   the newest run, do not re-run.
3. The newest run itself `cancelled` → agent `ci-red-triage` for a job at its cap (a
   real red); check `/proc/loadavg`.
4. Neither → re-dispatch `ci.yml` once (`group: <name>`); never sync to
   "refresh" it (§2). Re-run only via `tools/ci/ci-rerun.mjs <run_id>`.

## 2. A base merge is `sync-pr.mjs`, never a hand merge, and only when you must

When to sync is AGENTS.md §Git branch & deploy; `node tools/ci/needs-sync.mjs <branch>`
answers it (`= sync needed: conflict | stale-red | no`) and `sync-pr` refuses `no`.

    node tools/ci/sync-pr.mjs <branch> --plan   # cached refs only; no conflict proof
    node tools/ci/sync-pr.mjs <branch>          # real merge, pushes nothing, leaves you ON sync-pr-<branch>
    node tools/ci/sync-pr.mjs <branch> --push   # fresh verified sync, when publication is intended

- **Red AND conflicting:** fix the red on the branch first, sync once, then ONE push.
- Verify by diff size: a clean merge where gen rewrote nothing and the PR diff is
  prose or generated files only → `--verify=none --push` (CI re-gates the head);
  else the default `--verify=fast` plus `tooling-fast --changed` (a full ladder
  measured 723 s vs 110 s).
- Generated-file conflicts `sync-pr` cures; hand-written ones it aborts and
  hands back. The temp-branch trap and the hand-resolve recipe:
  `check-changes` [`references/sync-pr.md`](../check-changes/references/sync-pr.md).
  After a cure: `npm run gen` (check-changes references/triage.md §Stale generated indexes) then `gen:check`. Record the files
  and resolution as a ticked Plan item with the merge sha.

## 3. A red you did not cause → find out who is on it FIRST

    node tools/ci/who-is-on-it.mjs                  # pushes, paths, live claims
    node tools/ci/who-is-on-it.mjs --claim "<text>" # before you start
    node tools/ci/who-is-on-it.mjs --release        # after

The rule is AGENTS.md §Git branch & deploy (claim before a shared fix); it
**overrides "port the fix now and push"** (three sessions fixed one bug on
2026-09-18 and the result was a revert). Also search open PR titles/branches for the failing test name: first claimant fixes, the rest wait.

## 4. Never push to the deploy branch

`claude/f1-game-project-26h3ng` is the only branch that ships, and work lands
there by PR. A deploy is a MERGE of other sessions' work: re-measure on the
merged tree, never force-push. `node tools/ci/deploy.mjs` is the whole protocol.

## 5. Do not re-run a browser group to chase a flake

A retry-pass is a red and is quarantined by name, never skipped or widened (AGENTS.md rule 9); a timeout on a busy box measures the machine (rule 8).

## 6. Validate a fix push with the GATE, not the edit-loop check

    node tools/ci/deploy.mjs --gate-only     # pushes nothing; a dirty tree is fine

Green below never means green above (AGENTS.md rule 3; counts in
`docs/notes/PREPUSH-GATE-LADDER.md`). Push once per VERIFIED batch: a push over
a live run cancels it, and a killed job runs no `if: always()` step, so its
failures are lost. A deliberate ratchet raise is part of a fix: AGENTS.md §Critical conventions.

## 7. "Live" is an ancestry test, not a build number

- A green PR does not prove Pages. Poll by `head_sha`: `node tools/ci/ci-watch.mjs --sha <sha> [--pages]`
  under a `Monitor` (AGENTS.md rule 13); `pages.yml` gates the tip once and publishes exactly that commit.
- **Live means your commit is an ANCESTOR of the live `apex-sha`** — ask `deploy-research` for it; never
  curl github.io from the main context. PR CI and Pages (`pages.yml`, workflow id `295002043`) are separate verdicts;
  the deploy push starts Pages' reusable CI gate, not a separate ship-push CI run.
- After every push list all check runs on the head (ready-state jobs included) and read every failed log;
  on red name the exact test, assertion and lane. `deploy.mjs --train` prints the last ci/pages conclusions
  and the nightly rota BY JOB (a `cancelled` run can hide a FAILED one; the rota covers the specs `select-specs` never picks).

## 8. CI wake: `running` with 0 failed is not green

On every CI `system_notification` or native "N checks failing" banner, re-read
the **current** tip — not the notification commit (two commands):

    gh pr view <N> --json headRefOid -q .headRefOid
    node tools/ci/ci-watch.mjs --sha <that sha> --once

- `= ci failed` → triage → fix → push → re-subscribe (never "stale" because the
  notif SHA ≠ tip).
- `= ci running` → do **not** claim stale or fixed; stay subscribed and keep the
  AGENTS.md rule 13 timer. **"0 failed" while running is not green.**
- `= ci hollow` → only the draft skip skeleton ran, not verification; report
  it and use the authorized draft CI route when actual CI is needed.
- `= ci none` / `unknown` → no run observed / API evidence unavailable,
  respectively; neither proves a pass. `superseded` → follow the named current
  head or replacement run before concluding anything about that tree.
- Only "stale / no action" when `= ci passed` on that same `headRefOid`, or a
  proven draft→ready cancel with a live sibling still 0-failed on the same SHA.

Ending the turn on mid-run `0 failed` is how tip reds sit until a human clicks
Fix with Agent.

## 9. Host-neutral watch and claims

Use `--session <unique-id>` with `who-is-on-it.mjs --claim/--release` on hosts without a Claude session variable.
Subscription and timer per host (Claude Code `subscribe_pr_activity` + `send_later`; Cursor `subscribe_github_ci` +
`subscribe_github_pr` + `subscribe_timer`; Codex: one foreground `ci-watch` plus one automation): AGENTS.md rule 13. Without subscription or timers: `references/host-watch.md`. Record missing capabilities as unverified.

## 10. Sweeping many PRs

PR board: `node tools/ci/pr-board.mjs --json` (read-only; exit 3 = no token). Stand down on a PR a live session
pushed in the last ~10 min. SYNC only when `needs-sync.mjs` says conflict/stale-red. A SQUASH/REBASE auto-merge
arm → `disable_pr_auto_merge` (retired methods).

## 11. Browser runs, if a fix needs one

Via `node tools/ci/test-bg.mjs <group>` only; AGENTS.md rules 5, 6 and 10 (one run, `--stop`, never in a subagent).

## 12. Draft → ready → READY → merged (the steps that broke on 2026-10-26)

1. **Push** with `git push -u origin <branch>` alone — no output pipe (a piped push went to the
   permission classifier and was denied; the same push bare passed). Commit first in two calls (AGENTS.md rule 12).
2. **Mergeable first**: a ready flip on a CONFLICTING/DIRTY head starts no CI (AGENTS.md rule 13); `needs-sync.mjs`,
   then `sync-pr.mjs`, then flip.
3. **Flip**, then call `subscribe_pr_activity` again on the same PR: the subscription died at the draft→ready
   flip on #3785 and no CI or merge event arrived after it.
4. **READY** goes out only after `node tools/ci/ready-gate.mjs --pr <n> --wait` exits 0 on the SAME head you
   name in the line (`agent-msg.mjs` refuses a head that differs from the receipt). The Plan's open terminal item
   `- [ ] READY to ORCH <L> via agent-msg …` is exempt from the gate (`.github/pull_request_template.md`).
   A READY line never carries "do not merge" wording: a real veto is a PR-body
   `MERGE-HOLD: <reason> | lift: <who> | until: <time|event>` line (fleet-core), and that shape is never an
   ownership label — routing uses the `fleet:` line.
5. **Merge watch**: `node tools/ci/wait-for.mjs --merged <sha>` as ONE background Bash task — never a hand-rolled
   `while … sleep` loop; then `--release` the claim. The full signal list is AGENTS.md rule 13.
