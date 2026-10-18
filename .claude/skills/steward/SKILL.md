---
name: steward
description: "Use when you own, pick up or are handed a PR, or a PR or the deploy branch is red, cancelled, conflicting or its CI watch expired: keep its Plan current, name the failing test, sync-pr, push once per green cycle."
---

# Driving a PR to green in Apex 26

**This file is the OVERRIDES, not the protocol.** Generic PR-stewardship rules
are right about most things and wrong about the specifics below, each of
which has cost a session before. Everything not listed here: `AGENTS.md`.

Routes: owning PRs (claim → ready → report, spawn prompt) → [`references/ownership.md`](references/ownership.md). A red `ci.yml` / `pages.yml` run → agent `ci-red-triage` (read-only, returns
the status line). Pre-push validation → `check-changes`. Live `version.json` or
anything on github.io → agent `deploy-research` (the only thing here that reaches it).
Review, hunt or survey findings on the PR → agent `finding-verifier` before you fix any of them.

## Drive to green — the loop

1. Check out the PR's branch, then claim it: `node tools/ci/who-is-on-it.mjs`, then `--claim "<PR#> <text>"` (§3: someone already on it → stand down).
2. Read CI on the current tip: `node tools/ci/ci-watch.mjs --sha <head> --once` (§1 for `cancelled`, §8 for `running`).
3. Triage a red: agent `ci-red-triage` names the job, test and assertion.
4. Fix on the branch; sync only when §2 says you must.
5. Gate: `node tools/ci/deploy.mjs --gate-only` (§6).
6. ONE push per verified batch; refresh the PR body's Plan and Status.
7. Watch (§7, §9) until `= ci passed`; then `who-is-on-it.mjs --release`.

## 1. `cancelled` means three different things — read the jobs, not the conclusion

A live sibling run on the same `head_sha` is the draft/ready dedupe (AGENTS.md
rule 8): do not re-run it or report it as a failure. Deploy-branch pushes queue
in pages.yml's `pages-train-*` group (only the newest waiting push stays
pending; `ci-watch.mjs --sha` says `superseded`). Before marking ready, run
`node tools/ci/ready-gate.mjs --pr <n>` (there is no ready cap).

The other two look identical from the conclusion alone:

- **A job that hit `timeout-minutes` reports `cancelled`** with zero failures
  and every test green right up to the kill — that is a real red (why
  `node-suites` runs as matrix slices, each with its own cap; `CI` is the one required check).
- Anywhere else, `cancelled` with zero failures is a timeout until proven
  otherwise (AGENTS.md rule 8).

So: list the run's jobs and look for a failed one and for a job at its cap
before you decide. `ci-red-triage` does exactly this and returns the status line.

A PR that ends `cancelled` twice, zero failures — the recipe:

    node tools/ci/ci-watch.mjs --sha <head sha> --once   # exit 2 / `= ci cancelled` = newest run per workflow, no failed job, no live sibling

1. Is the head SHA the same both times? Then it is the draft/ready dedupe or a
   push over a live run (a newer push to the same `head.ref` cancels the older
   run too): wait for the newest run, do not re-run. 2. Newest run itself
   `cancelled`: open its jobs (`ci-red-triage`) for one at its `timeout-minutes`
   cap — a real red — and check `/proc/loadavg`. 3. Neither: re-dispatch
   `ci.yml` once (`group: <name>`), do NOT sync the branch to "refresh" it
   (section 2: a sync is a new full PR run and can cancel again). Re-run only via `tools/ci/ci-rerun.mjs <run_id>`.

## 2. A base merge is `sync-pr.mjs`, never a hand merge — and only when you must

    node tools/ci/sync-pr.mjs <branch> --plan   # cached refs only; no conflict proof
    node tools/ci/sync-pr.mjs <branch> --push   # fresh verified sync, when publication is intended

**Run `node tools/ci/needs-sync.mjs <branch>` first** (`= sync needed: conflict | stale-red | no`; `sync-pr` refuses `no`, exit 4, without `--force-clean-behind`). **Do not sync on every tip move.** Branch protection requires the `CI`
check green on the PR's own head, NOT an up-to-date branch, and every re-sync is a fresh PR run. Sync when GitHub
reports a conflict, or when a required check is red on the tip and the fix
is already there. A green PR merges as it stands. **Red AND conflicting:** fix the red on the branch first, then sync once, then ONE push (two pushes cancel the live run — AGENTS.md rule 4).
Bare `sync-pr <branch>` (no flag) does the real merge and pushes nothing. Prose-only clean merge: `--verify=none --push` (role-pr-owner.md).

A base merge can conflict on generated files (ratchets are per-branch deltas
now); `sync-pr` cures those and hands back the rest. It leaves you ON
`sync-pr-<branch>` and pushes nothing without `--push` — publish already verified output using its printed manual push command, or
inspect/rename an existing temp branch before a fresh sync. Recovery is in
`check-changes` SKILL.md §After `sync-pr.mjs` (not references/deploy.md).

**Hand-written files conflict (prose, a help sheet, a ratchet's FORM):**
`sync-pr` runs `merge --abort`, prints `real conflicts … resolve by hand`
(a `(moved to <path>)` tag = re-apply their edit there), and returns you to
the branch you started on; `sync-pr-<branch>` is left as an unmerged copy of the
PR head — inspect it before removal or rename. An existing temp branch makes
a fresh sync refuse rather than delete unpublished output. Order:
`sync-pr <branch> --plan` (cached refs; `conflicts:null`, `conflictsChecked:false`;
no fetch or merge-tree) → `who-is-on-it.mjs` if the base file is not yours → `git checkout
<branch> && git merge origin/claude/f1-game-project-26h3ng` → keep BOTH sides'
intent in each hand-written file → generated leftovers at the source + `npm
run gen` → `git add`/commit → `deploy.mjs --gate-only` → plain `git push`
(never force). Record the files and the resolution in the PR body: a ticked
Plan item with the merge sha (AGENTS.md rule 12). Generated files: AGENTS.md rule 11.

## 3. A red you did not cause → find out who is on it FIRST

    node tools/ci/who-is-on-it.mjs                  # pushes, paths, live claims
    node tools/ci/who-is-on-it.mjs --claim "<text>" # before you start
    node tools/ci/who-is-on-it.mjs --release        # after

Every session's PR lands on the same deploy branch, so one red there is seen
by all at once. **This overrides "port the fix now and push":** a fix already pushed, a
live claim, or a live host session on it means STAND DOWN and say so. Three
sessions fixed one bug on 2026-09-18 and the result was a revert
(`docs/notes/SHARED-BRANCH-COORDINATION.md`). Also search open PR titles/branches for the failing test name: first claimant fixes, the rest wait.

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
  under a `Monitor` (AGENTS.md rule 12); `pages.yml` gates the tip once and publishes exactly that commit.
- **Live means your commit is an ANCESTOR of the live `apex-sha`** — ask `deploy-research` for it; never
  curl github.io from the main context. PR CI, ship-push CI and Pages (`pages.yml`, workflow id `295002043`) are separate verdicts.
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
- `= ci running` → do **not** claim stale or fixed; stay subscribed or re-arm a
  ≤15m once-timer. **"0 failed" while running is not green.**
- Only "stale / no action" when `= ci passed` on that same `headRefOid`, or a
  proven draft→ready cancel with a live sibling still 0-failed on the same SHA.

Ending the turn on mid-run `0 failed` is how tip reds sit until a human clicks
Fix with Agent.

## 9. Host-neutral watch and claims

Use `--session <unique-id>` with `who-is-on-it.mjs --claim/--release` on hosts without a Claude session variable.
Subscribe with the host's own tool: Claude Code `subscribe_pr_activity`, Cursor `subscribe_github_ci` +
`subscribe_github_pr`; never call a name the host does not list (`agent-fleet` `references/comms.md`). Keep one timer beside it
(`send_later` / `subscribe_timer`) and read CI on every wake: the subscription can drop `check_run` completions. Without
subscription or timers: `references/host-watch.md`. Record missing capabilities as unverified.

## 10. Browser runs, if a fix needs one

Via `node tools/ci/test-bg.mjs <group>` only; AGENTS.md rules 5, 6 and 10 (one run, `--stop`, never in a subagent).
