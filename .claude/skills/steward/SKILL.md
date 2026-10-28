---
name: steward
description: "Use when you own or pick up a PR, or a PR or the deploy branch is red, cancelled or conflicting: keep the Plan live, fix the failure, sync, push once per green cycle. Not for: status only → check; opening or landing → ship; picking tests → check-changes."
---

# Driving a PR to green in Apex 26

This file is the OVERRIDES, not the protocol: everything not listed here is `AGENTS.md` and `docs/WORKERS.md`.
Routes: failed-CI triage → agent `ci-red-triage`; pre-push validation → skill `check-changes`; live `version.json`
or anything on github.io → agent `deploy-research` (the only route there); review, hunt or survey findings on the
PR → agent `finding-verifier` before you fix any of them.

## Gotchas

- **`running` with 0 failed is not green.** Re-read the CURRENT tip, not the notification commit, and stay
  subscribed (§8).
- **A red you did not cause is someone else's first.** Read `pr-board.mjs --json` and the Board issue before
  porting any fix: the first claimant fixes, the rest wait (§3).
- **`cancelled` is not a verdict.** List the jobs: a job at its `timeout-minutes` cap with zero failures is a real
  red; a same-SHA draft/ready cancel is dedupe (§1).
- **Sync only through `sync-pr.mjs`, and only when `needs-sync` says so** (or `gate` fails on `distance`); never
  to "refresh" a cancelled run (§2).
- **One push per verified batch.** A push over a live run cancels it and a killed job runs no `if: always()` step,
  so its failures are lost (§6).

## Drive to green — the loop

1. Check out the PR's branch. A PR is yours because you opened it or were launched on a `needs-owner` PR with
   `CONTINUE PR #<n>` (claims are for issues, docs/WORKERS.md §1): start from its Plan and Hand-off block, set
   `owner:`.
2. Read CI on the tip: `node tools/ci/ci-watch.mjs --sha <head> --once`, THEN `node tools/ci/needs-sync.mjs
   <branch>` (two calls). On `stale-red` (the tip moved after the run started) sync FIRST (§2) and fix only what is
   still red: the tip may already carry the fix.
3. Triage a red: agent `ci-red-triage` names the job, test and assertion; its `base:` line says whose it is
   (`already-red-on-base` → §3, not yours to fix).
4. Fix on the branch.
5. Verify at the pre-push floor (§6).
6. ONE push per verified batch; refresh the PR body's Plan and Hand-off block.
7. Watch while CI runs on your head (§7–§9).
8. Gate → ready → `land`: skill `ship` (§12). After `land`: docs/WORKERS.md §5 and AGENTS.md rule 13.

## The overrides

1. **`cancelled`** — read the jobs, not the conclusion; the twice-cancelled recipe:
   `references/cancelled-and-sync.md`.
2. **Base merge** — `node tools/ci/sync-pr.mjs <branch>` (background, `timeout: 7200000`), never a hand merge;
   `needs-sync.mjs` decides (`conflict | stale-red | no`), plus the `gate` `distance` row it cannot see. Red AND
   conflicting: a `stale-red` syncs first, any other red is fixed first, then sync once and ONE push. Modes,
   verify choice and conflict cures: `references/cancelled-and-sync.md`.
3. **A red you did not cause** — find out who is on it FIRST: `node tools/ci/pr-board.mjs --json` (open PRs: heads,
   state, failing jobs, owner). Search open PR titles, branches and the Board issue for the failing test name, and
   the `deploy:red` label on the Board issue. This overrides "port the fix now and push" (AGENTS.md §Git branch &
   deploy).
4. **Deploy branch** — never pushed to (AGENTS.md §Git branch & deploy). A deploy is a MERGE of other sessions'
   work: re-measure on the merged tree. A worker's change lands through the `land` label (§12).
5. **Flakes** — do not re-run a browser group to chase one: AGENTS.md rules 8 and 9.
6. **Fix push** — validate at the floor (docs/WORKERS.md §3; AGENTS.md rule 3); the fast tier (`run-ci` on the
   draft), the full tier (ready) and the `gate` status prove the rest. `ready-gate.mjs` needs Structural guards
   green on the tip, so a draft needs `run-ci` (`--local` instead reads the stamp a green full `tooling-fast` run
   writes). Ratchets: `.claude/rules/game-code.md`.
7. **Watch and "live"** — watch by `head_sha` per AGENTS.md rule 13: a worker subscribes (`subscribe_pr_activity`);
   only a Bryce-attended session adds a `Monitor` on `node tools/ci/ci-watch.mjs --sha <pushed sha> --timeout 30
   --failures-only` (`--pages` after a deploy-branch push). Live means your commit is an ANCESTOR of the live
   `apex-sha` (agent `deploy-research`). Detail: `references/ci-verdicts.md`.
8. **CI wake** — re-read `headRefOid`, then `ci-watch --once`, and act on the verdict: `references/ci-verdicts.md`
   (also the `gate` commit status, which ci-watch never shows).
9. **Host-neutral watch** — ownership is the claim comment plus `claimed`, or the Hand-off `owner:` line; watch per
   host (docs/WORKERS.md §4 and §Per vendor). Without a subscription: `references/host-watch.md`. Record missing
   capabilities as unverified.
10. **Sweeping many PRs** is the dispatcher's job (docs/WORKERS.md §The dispatcher). A session reads
    `node tools/ci/pr-board.mjs --json` (read-only; exit 3 = no token) to find who owns a red (§3); it does not
    sweep, disarm or take over another lane's PR.
11. **Browser runs** — `node tools/ci/test-bg.mjs <group>` only; AGENTS.md rules 5, 6 and 10.
12. **Draft → ready → `land`** — the steps live in skill `ship` (push bare, mergeable first, the
    `ready-gate.mjs --pr <n>` receipt). A veto is the `hold` label, never body wording.

## References

- [`references/cancelled-and-sync.md`](references/cancelled-and-sync.md) — read when `ci-watch` says `cancelled`,
  `needs-sync` says `conflict`/`stale-red`, or `gate` fails on `distance`.
- [`references/ci-verdicts.md`](references/ci-verdicts.md) — read on a CI wake, any `ci-watch` verdict other than
  `passed`/`failed`, the `gate` status, or a "live?" question.
- [`references/host-watch.md`](references/host-watch.md) — read when the host has no PR subscription, `Monitor`
  or timer.
- [`../check-changes/references/sync-pr.md`](../check-changes/references/sync-pr.md) — read when `sync-pr` aborts
  on a hand-written conflict (the temp-branch trap and the hand-resolve recipe).
- [`../check-changes/references/triage.md`](../check-changes/references/triage.md) — read after a `sync-pr` cure,
  before `npm run gen` (§Stale generated indexes).
