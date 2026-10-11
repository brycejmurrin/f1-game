---
name: steward
description: "Use when driving a PR to green — after a CI or Pages red (naming the failed test is ci-red-triage), a PR event or check-in, a base merge conflict, a fix push to validate. Only the Apex 26 overrides: draft/ready dedupe (`cancelled` is normal), sync-pr.mjs over a hand merge, who-is-on-it.mjs before a shared red, what live means. Pre-push is check-changes."
---

# Driving a PR to green in Apex 26

**This file is the OVERRIDES, not the protocol.** Generic PR-stewardship rules
are right about most things and wrong about six specific to this repo, each of
which has cost a session before. Everything not listed here: `AGENTS.md`.

Routes: a red `ci.yml` / `pages.yml` run → `ci-red-triage` (read-only, returns
the status line). Pre-push validation → `check-changes`. Live `version.json` or
anything on github.io → `deploy-research` (the only thing here that reaches it).

## 1. `cancelled` means three different things — read the jobs, not the conclusion

A draft PR's fast-tier run and its `ready_for_review` run land in the same
concurrency group (`ci-…head.ref`) with `cancel-in-progress`, so marking the PR
ready cancels the fast run on the same `head_sha` seconds after it starts
(ci.yml runs on push for the deploy branch only since 2026-09-24; before that
a branch push and its PR run did the same). **A live sibling on
that SHA is dedupe, not a red.** Do not re-run it and do not report it as a
failure. (Dispatch/schedule use `run_id`; deploy-branch pushes share ONE
no-cancel group, `ship-fast`, since 2026-10-03: the run in progress finishes and
only the newest waiting push stays queued.) Before marking ready, run
`node tools/ci/ready-gate.mjs` (exit 0 = Structural guards / tooling-fast green
on the tip) **and** `node tools/ci/ready-full-cap.mjs` (exit 1 = wait — ≥3 ready
PRs already hold full-tier CI; draft fast-tier is uncapped).

The other two look identical from the conclusion alone:

- **A job that hit `timeout-minutes` reports `cancelled`** with zero failures
  and every test green right up to the kill — that is a real red. It blocked
  two deploys on Pages #1959/#1961 and is why `node-suites` is its own job (six slices now, `vm-a1 vm-a2 vm-b1 vm-b2 page slow`, 25 min cap each; the slice names are required checks).
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
   (section 2: a sync is a new full PR run and can cancel again).

## 2. A base merge is `sync-pr.mjs`, never a hand merge — and only when you must

    node tools/ci/sync-pr.mjs <branch> --plan   # cached refs only; no conflict proof
    node tools/ci/sync-pr.mjs <branch> --push   # fresh verified sync, when publication is intended

**Do not sync on every tip move.** Branch protection (2026-09-30) requires
the 12 fast-tier checks green on the PR's own head, NOT an up-to-date
branch, and every re-sync is a fresh PR run (the account was 20 slots, now 40) — re-syncs
were ~80 % of the deploy branch's commits on 2026-09-29. Sync when GitHub
reports a conflict, or when a required check is red on the tip and the fix
is already there. A green PR merges as it stands.

Every base merge conflicts on `tests/data/ratchets.json` and the generated
files; `sync-pr` cures both and a hand merge does not. It leaves you ON
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
(never force). Record the files and the resolution in the PR body.

Resolve a generated-file conflict at the SOURCE and run `npm run gen`; never
hand-edit one (the edit hook blocks it, and `gen:check` names drift). The list
is AGENTS.md §Critical conventions rule 11.

## 3. A red you did not cause → find out who is on it FIRST

    node tools/ci/who-is-on-it.mjs                  # pushes, paths, live claims
    node tools/ci/who-is-on-it.mjs --claim "<text>" # before you start
    node tools/ci/who-is-on-it.mjs --release        # after

Other sessions develop directly on the deploy branch, so they all see one red at
once. **This overrides "port the fix now and push":** a fix already pushed, a
live claim, or a live host session on it means STAND DOWN and say so. Three
sessions fixed one bug on 2026-09-18 and the result was a revert
(`docs/notes/SHARED-BRANCH-COORDINATION.md`).

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
once and publishes exactly that commit (dispatch = "deploy now", ≤ ~25 min).
**Live means your commit is an ANCESTOR of the live `apex-sha`** — ask
`deploy-research` for it. Do not conflate PR CI, ship-push CI and Pages, and
never curl github.io from the main context.

## Browser runs, if a fix needs one

ONE Playwright process, ONE group per batch, via `node tools/ci/test-bg.mjs
<group>`. Stop it with `--stop`, never a PID kill and never `pkill -f` (both
hook-blocked). Never hand a subagent a browser run — report it unverified
instead. Anchor a verdict on `grep -E '^= (run (passed|failed|timedout|interrupted)|bg exit)'`,
never a looser pattern or `| tail` on a live log.

## Host-neutral watch and claims

Use `--session <unique-id>` with `who-is-on-it.mjs --claim/--release` on hosts
without a Claude session variable; do not share a `nosession` identity.
Subscribe with the host's own tool: Claude Code `subscribe_pr_activity`
(claude-code-remote MCP), Cursor `subscribe_github_ci` + `subscribe_github_pr`
(cursor-subscriptions MCP); never call a name the host does not list. If those or Monitor/send_later
are absent, run the watcher as one owned background command with a log, read
events while doing independent work, and at most one `ci-watch --sha <sha>
--once` at a checkpoint (no shell-poll loops while subscribed). Record missing
subscription and reminder capabilities as unverified; do not claim an automation
was armed.
Check the active tool catalog with `tools/check/doctor.mjs --catalog <file>`; upstream
connector availability cannot be fixed by inventing tool results.
