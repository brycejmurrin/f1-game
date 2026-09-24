---
name: steward
description: Use when driving a PR to green here — CI or Pages red, a PR event or check-in, a base merge conflict, a fix push to validate. Only what Apex 26 does differently: the push/PR dedupe that makes `cancelled` normal, sync-pr.mjs over a hand merge, who-is-on-it.mjs before a red on the shared deploy branch, the gate a fix push clears, what live means. Rest is AGENTS.md. Which test failed is ci-red-triage; pre-push is check-changes.
---

# Driving a PR to green in Apex 26

**This file is the OVERRIDES, not the protocol.** Generic PR-stewardship rules
are right about most things and wrong about six specific to this repo, each of
which has cost a session before. Everything not listed here: `AGENTS.md`.

Routes: a red `ci.yml` / `pages.yml` run → `ci-red-triage` (read-only, returns
the status line). Pre-push validation → `check-changes`. Live `version.json` or
anything on github.io → `deploy-research` (the only thing here that reaches it).

## 1. `cancelled` means three different things — read the jobs, not the conclusion

A push and its pull_request run land in the same concurrency group
(`ci-…head.ref` for both) with `cancel-in-progress`, so the PR run cancels the
push run on the same `head_sha` seconds after it starts. **A live sibling on
that SHA is dedupe, not a red.** Do not re-run it and do not report it as a
failure. (Dispatched, scheduled and deploy-branch-push runs each get their own
`run_id` group on purpose, so they are never the sibling.)

The other two look identical from the conclusion alone:

- **A job that hit `timeout-minutes` reports `cancelled`** with zero failures
  and every test green right up to the kill — that is a real red. It blocked
  two deploys on Pages #1959/#1961 and is why `node-suites` is its own job.
- Anywhere else, `cancelled` with zero failures is a timeout until proven
  otherwise (AGENTS.md rule 8).

So: list the run's jobs and look for a failed one and for a job at its cap
before you decide. `ci-red-triage` does exactly this and returns the status line.

## 2. A base merge is `sync-pr.mjs`, never a hand merge

    node tools/ci/sync-pr.mjs <branch>          # …then --push when it is clean

Every base merge conflicts on `tests/data/ratchets.json` and the generated
files; `sync-pr` cures both and a hand merge does not. It leaves you ON
`sync-pr-<branch>` and pushes nothing without `--push` — recovery is in
`check-changes` → `references/deploy.md`.

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
instead. Anchor a verdict on `grep -E '= run (passed|failed|timedout|interrupted)'`,
never a looser pattern or `| tail` on a live log.
