---
name: steward
description: "Use when you own, pick up or are handed a PR, or a PR or the deploy branch is red, cancelled, conflicting or its CI watch expired: check out its branch, keep its body and Plan current, name the failing test, who-is-on-it, sync-pr, push once per green cycle. Pre-push → check-changes."
---

# Driving a PR to green in Apex 26

**This file is the OVERRIDES, not the protocol.** Generic PR-stewardship rules
are right about most things and wrong about the specifics below, each of
which has cost a session before. Everything not listed here: `AGENTS.md`.

Routes: owning PRs (claim → ready → report, spawn prompt) → [`references/ownership.md`](references/ownership.md). A red `ci.yml` / `pages.yml` run → agent `ci-red-triage` (read-only, returns
the status line). Pre-push validation → `check-changes`. Live `version.json` or
anything on github.io → agent `deploy-research` (the only thing here that reaches it).
Review, hunt or survey findings on the PR → agent `finding-verifier` before you fix any of them.

## 1. `cancelled` means three different things — read the jobs, not the conclusion

A draft PR's fast-tier run and its `ready_for_review` run land in the same
concurrency group (`ci-…head.ref`) with `cancel-in-progress`, so marking the PR
ready cancels the fast run on the same `head_sha` seconds after it starts
(ci.yml runs on pull_request; a deploy-branch push starts `pages.yml`). **A live sibling on
that SHA is dedupe, not a red.** Do not re-run it and do not report it as a
failure. (Dispatch/schedule use `run_id`; deploy-branch pushes queue in
pages.yml's `pages-train-*` group: the train in progress finishes, only the
newest waiting push stays pending; `ci-watch.mjs --sha` says `superseded`.) Before marking ready, run
`node tools/ci/ready-gate.mjs` (exit 0 = Structural guards / tooling-fast green
on the tip). There is no ready cap since 2026-10-16: ci.yml's lanes bound the
browser legs inside GitHub.

The other two look identical from the conclusion alone:

- **A job that hit `timeout-minutes` reports `cancelled`** with zero failures
  and every test green right up to the kill — that is a real red. It blocked
  two deploys on Pages #1959/#1961 and is why `node-suites` is its own job (matrix slices, each with its own cap; `CI` is the one required check since 2026-10-15 — see ci.yml).
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
check green on the PR's own head (one check since 2026-10-15; the fast-tier
names before that), NOT an up-to-date branch, and every re-sync is a fresh PR run. Sync when GitHub
reports a conflict, or when a required check is red on the tip and the fix
is already there. A green PR merges as it stands. **Red AND conflicting:** fix the red on the branch first, then sync once, then ONE push (two pushes cancel the live run — AGENTS.md rule 4).
Bare `sync-pr <branch>` (no flag) does the real merge and pushes nothing. Prose-only clean merge: `--verify=none --push` (role-pr-owner.md).

A base merge can conflict on generated files (`ratchets.json` conflicts ended
with #2295's per-branch deltas); `sync-pr` cures those and hands back the rest. It leaves you ON
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
Plan item with the merge sha (AGENTS.md rule 12).

Resolve a generated-file conflict at the SOURCE and run `npm run gen`; never
hand-edit one (the edit hook blocks it, and `gen:check` names drift). The list
is AGENTS.md Session shape rule 11.

## 3. A red you did not cause → find out who is on it FIRST

    node tools/ci/who-is-on-it.mjs                  # pushes, paths, live claims
    node tools/ci/who-is-on-it.mjs --claim "<text>" # before you start
    node tools/ci/who-is-on-it.mjs --release        # after

Every session's PR lands on the same deploy branch, so one red there is seen
by all at once. **This overrides "port the fix now and push":** a fix already pushed, a
live claim, or a live host session on it means STAND DOWN and say so. Three
sessions fixed one bug on 2026-09-18 and the result was a revert
(`docs/notes/SHARED-BRANCH-COORDINATION.md`). Also search open PR titles/branches for the failing test name: first claimant fixes, the rest wait (#2716/#2717/#2695).

## 4. Never push to the deploy branch

`claude/f1-game-project-26h3ng` is the only branch that ships, and work lands
there by PR. A deploy is a MERGE of other sessions' work: re-measure on the
merged tree, never force-push. `node tools/ci/deploy.mjs` is the whole protocol.

## 5. Do not re-run a browser group to chase a flake

One group is 10–40 minutes of serialized SwiftShader, so a speculative re-run is
slower feedback, not extra safety. AGENTS.md rule 9: a pass that needed a retry
IS a red — name the flaky test in the PR like a not-run group and fix or
quarantine it by name (`APEX_FAIL_ON_FLAKY=1` makes the runner fail it). Never
skip or disable a test to get green, and never widen a tolerance to pass a spec.

Before calling a timeout a failure, check `/proc/loadavg` (< 3) and for a live
`playwright test`: a timeout on a busy box measures the machine (rule 8).

## 6. Validate a fix push with the GATE, not the edit-loop check

    node tools/ci/deploy.mjs --gate-only     # pushes nothing; a dirty tree is fine

The ladder is a subset chain — `test:guards` ⊂ `test:tooling-fast` ⊂
`--gate-only` — and green below never means green above. The files
`tooling-fast` leaves out have taken deploys red three times; the counts are
generated, so read them from `docs/notes/PREPUSH-GATE-LADDER.md` rather than
quoting one here. Push once per VERIFIED batch: a push over
a live run cancels it, and a killed job runs no `if: always()` step, so its
failures are lost.

A deliberate ratchet raise is part of a fix, not a workaround: `node
tools/check/ratchets.mjs --update`, with the reason in the commit. Never
hand-edit `tests/data/ratchets.json`.

## 7. "Live" is an ancestry test, not a build number

A green PR does not prove Pages. Poll by `head_sha` — `node tools/ci/ci-watch.mjs
--sha <sha> [--pages]` under a `Monitor` is the poller (one event per job, a red's
failing step and annotations inline; AGENTS.md rule 12); `pages.yml` gates the tip
once and publishes exactly that commit (dispatch = "deploy now"; median 23 min, p90 73).
**Live means your commit is an ANCESTOR of the live `apex-sha`** — ask
`deploy-research` for it. Do not conflate PR CI, ship-push CI and Pages
(`pages.yml`, workflow id `295002043`), and never curl github.io from the main
context. After every push list all check runs on the head (ready-state jobs
included), read every failed log and fix at the root; on red name the exact
test, assertion and lane. `deploy.mjs --train` prints the last ci/pages
conclusions and the nightly rota BY JOB (a `cancelled` run can hide a FAILED
one); the rota is the only scheduled coverage for the specs `select-specs`
never picks. Fetch MCP tool schemas once per session and reuse them.

## Browser runs, if a fix needs one

Via `node tools/ci/test-bg.mjs <group>` only; AGENTS.md rules 5, 6 and 10 (one run, `--stop`, never in a subagent).

## Host-neutral watch and claims

Use `--session <unique-id>` with `who-is-on-it.mjs --claim/--release` on hosts without a Claude session variable.
Subscribe with the host's own tool: Claude Code `subscribe_pr_activity`, Cursor `subscribe_github_ci` +
`subscribe_github_pr`; never call a name the host does not list (`agent-fleet` `references/comms.md`). Keep one timer beside it
(`send_later` / `subscribe_timer`) and read CI on every wake: the subscription can drop `check_run` completions. Without
subscription or timers: `references/host-watch.md`. Record missing capabilities as unverified.

## 8. CI wake: `running` with 0 failed is not green

On every CI `system_notification` or native "N checks failing" banner, re-read
the **current** tip — not the notification commit:

    SHA=$(gh pr view <N> --json headRefOid -q .headRefOid)
    node tools/ci/ci-watch.mjs --sha "$SHA" --once

- `= ci failed` → triage → fix → push → re-subscribe (never "stale" because the
  notif SHA ≠ tip).
- `= ci running` → do **not** claim stale or fixed; stay subscribed or re-arm a
  ≤15m once-timer. **"0 failed" while running is not green.**
- Only "stale / no action" when `= ci passed` on that same `headRefOid`, or a
  proven draft→ready cancel with a live sibling still 0-failed on the same SHA.

Ending the turn on mid-run `0 failed` is how tip reds sit until a human clicks
Fix with Agent.
