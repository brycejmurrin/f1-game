# Sync churn and the batch train (2026-10-16)

Design lane for the Merge Desk. Question: agents keep merging the deploy tip into
PR branches; is there a better process? Docs only; nothing here changes a
workflow. Method and caveats are at the end. Raw scripts were run from
`scratch/` (not committed); every number below is recomputable from the
cited shas and run ids.

## Short answer

Most syncs are not needed. Of 682 sync merges in three days, only 165 (24 %)
resolved a conflict in hand-written files; 517 (76 %) were clean refreshes or
regenerated a generated file. Of the CI runs that ran on a sync head with a prior
verdict, 175 of 203 (86 %) returned the verdict the branch already had. The
cheapest fix is not a new mechanism: make "sync only when CONFLICTING or the tip
check is red" a **predicate a script answers** instead of a rule an agent
remembers, and replace per-owner timers with event subscriptions. A batch branch
(option A) and a fresh-check status (option B) cost more than they save under
this repo's branch protection.

## 1. Numbers (committer dates UTC, deploy tip `b4af68fb`)

| | 10-13 | 10-14 | 10-15 | 10-16 (to 10:20Z) | last 24 h |
|---|---|---|---|---|---|
| (a) PR merges into the deploy branch (first-parent merge commits) | 11 (partial) | 108 | 206 | 40 | 221 |
| (b) sync merges on topic branches (a parent is a deploy first-parent commit; a floor) | 0 | 170 | 438 | 74 | 265 |
| (c) of those: clean | 0 | 28 | 209 | 23 | 71 |
| (c) conflicted under `git merge-tree` | 0 | 142 | 215 | 50 | 184 |
| (c) clean merge, tree rewritten by `npm run gen` ("evil") | 0 | 0 | 14 | 1 | 10 |

(Your 322 vs 220 figure counts more shapes of sync than the first-parent test;
mine is a conservative floor, ratio 1.2 per merge rather than 1.5.)

Conflict anatomy (407 conflicted syncs, `git merge-tree --write-tree --name-only`
on the two parents):

| conflicted files were | syncs | cured by |
|---|---|---|
| only generated/derived files (`tests/data/ratchets.json`, `package.json`, `CHANGELOG.md`, `tests/groups.json`, baselines, MEMORY.md) | 242 | `npm run gen` (what `sync-pr.mjs` does) |
| generated plus hand-written | 73 | a human or agent |
| hand-written only | 92 | a human or agent |

Hand-written hot spots: `tests/unit/store-registry.test.mjs` (26),
`tests/unit/ci-coverage.test.mjs` (21), `docs/TESTING.md` (18),
`js/lighting/atmosphere.js` (17), `.github/workflows/ci.yml` (17),
`docs/notes/APEX-STEWARD-CARD-2026-10-05.md` (11), `AGENTS.md` (9),
`tools/ci/tooling-fast.mjs` (6). Most are append-a-row registries: the cure is
removing the shared line, not resolving it faster. `tests/data/ratchets.d/`
(first landed `b470bb82`, 2026-10-16 00:49Z) is the model; after it, 48 syncs in
the next 9 h: 17 clean, 31 conflicted, and ratchets.json (9) and package.json (7)
still lead the list.

(d) Syncs followed by a re-run that changed nothing. `ci.yml` PR runs, 2026-10-13
to 10-16, grouped by branch (1,636 runs; 428 ran on a sync-merge head):

| run on a sync head | runs | wall minutes |
|---|---|---|
| verdict unchanged green to green | 175 | 5,070 |
| red to green (the sync "cured" it) | 21 | 835 |
| green to red (the sync broke it) | 6 | 215 |
| red to red | 1 | 43 |
| first verdict on the branch | 178 | 5,362 |
| cancelled before a verdict (replaced by a newer push) | 45 | 797 |

Overall 339 of 1,636 runs (21 %) were cancelled (4,594 wall minutes), 103 failed.
Wall minutes are `updated_at - created_at`, not runner minutes, so read them as
relative size. 175 green-to-green runs is the direct cost of clean-behind syncs:
a clean refresh bought a full tier that could only repeat the old verdict.

(e) Red only because the run predated a tip fix:

- `tests/unit/source-pin-hygiene.test.mjs` (prose `game.js's` counted as a raw
  read), fixed by `9684f31f` (#2436), 2026-10-16 09:45Z. 14 PR runs on 14
  branches failed that test in Structural guards (tooling A or B) between 08:56Z
  and 09:52Z (351 wall minutes); I confirmed each by `FAIL ... source-pin-hygiene`
  in the failing tooling job's log. Three (`workflow-actions-audit-2435`,
  `pages-reuse-invalidation-2435`, `live-verify-hardening-2440`) failed after the
  fix merged because their merge ref still carried the old base.
- #2377 (merge `6b1ae9b9`, 08:01Z) fixed `data-esc-close` naming a missing
  `hud-arrange-bar`; its body names #2340, #2341 and #2352 as full tiers "red only
  on this test". Six more failed `selected` legs between 06:41Z and 08:05Z carry
  `menu-keyboard.spec.js` in the leg title on five branches (candidates, not
  proven).
- The 21 red-to-green flips on sync heads are an upper bound for "stale-base
  red": by failed job, 9 were guards or node suites, 7 browser `selected` legs,
  5 geometry sweeps; flakes are mixed in.

At least 14 PRs paid one wasted red tier on source-pin-hygiene and a second tier
to clear it; the cure PRs (#2435, #2438) were merged first by hand, as #2440
records.

## 2. Why a sync is the only thing that clears a stale red

- `pull_request` runs check out `refs/pull/N/merge`, the PR merged onto the base
  at trigger time ([events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)).
- A re-run reuses the original `GITHUB_SHA` and `GITHUB_REF`
  ([re-running](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/re-running-workflows-and-jobs)),
  so re-running a red job after the tip is fixed re-tests the stale merge.
- A new run needs a `synchronize` event, i.e. a push; empty commits and
  close/reopen are forbidden (AGENTS.md rule 12 / steward). Hence the sync push.
- Branch protection requires one check, `CI` (`ci-verdict`), and not
  up-to-date-ness; the Pages train gates the merged tip anyway and reuses a
  gate when a parent's tree equals the commit's (`pages.yml` rule 3). A PR full
  tier on a stale base is mostly redundant with the train, except as an early
  signal.

## 3. Options against the numbers

Constraints checked against current docs: GitHub merge queue is for
organization-owned repos ([changelog](https://github.blog/changelog/2023-07-12-pull-request-merge-queue-is-now-generally-available/);
`ci.yml` removed `merge_group` on 2026-10-14 for this reason; the
[merge-queue page](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
requires the `merge_group` event). Events caused by `GITHUB_TOKEN` create no new
runs, except `workflow_dispatch` and `repository_dispatch`
([GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token)).
Commit statuses are `POST /repos/{owner}/{repo}/statuses/{sha}`, states
`error|failure|pending|success`, at most 1,000 per sha and context
([statuses API](https://docs.github.com/en/rest/commits/statuses?apiVersion=2022-11-28)).
Required checks "can be checks or commit statuses" and duplicate names across
sources can give ambiguous results
([protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)).

| option | what it removes | what it costs | verdict |
|---|---|---|---|
| A. Desk batch branch (tip + N disjoint PRs, one full tier, then merge each) | nothing today: each PR head still needs its own green `CI` (the one required check), so the batch tier is **added** on top; a GitHub merge of each PR makes a new commit, so the train's tree-reuse does not fire either | one `workflow_dispatch` of `ci.yml` on a scratch branch per batch, a Desk script, disjointness test | defer; revisit only if the required check is relaxed or moved to the batch |
| B. dispatch a fresh check (merge tip into a scratch ref, post a commit status on the PR head) | the sync push and the owner round trip for stale-base reds | still one full tier per refresh (no CI saving); needs `statuses: write`; a status named `CI` next to a red `CI` check run is ambiguous per the protected-branch docs, so it needs either a new required context or an empirical test on a throwaway PR first | phase 3, only after the cheap steps; run the throwaway-PR test before any design |
| C. one conflict-only resync lane using `sync-pr.mjs` | the 517 syncs that were clean or regenerated only, when paired with the predicate below | a predicate (`git merge-tree --write-tree` exits 1, or the tip check is red), a worker lane | **do first** |
| D. `subscribe_pr_activity` events instead of per-owner `send_later` timers | timer wake-ups that find nothing, and the habit of a "safety sync" at each wake | none for CI; AGENTS.md already says timers are a backstop (events can drop `check_run`) | **do first**, no code |
| E. overlap-ordered merging from the #2440 file map | hand conflicts: 92 + 73 of 682 syncs, concentrated in clusters of PRs touching the same registry | generate the map: pairwise `git merge-tree --write-tree` on open PR heads gives the true conflict graph, not a path list | phase 2 |

## 4. Recommended plan

Phase 0 (smallest first step, about one afternoon, no workflow change): add
a new `needs-sync <branch>` tool in `tools/ci` that prints one of `CLEAN-BEHIND (do not sync)`,
`CONFLICT (sync)` or `TIP-RED (sync, name the test)` and exits 0 only on a reason to
sync. It uses `git merge-tree --write-tree origin/<deploy> origin/<branch>` and
the PR's `CI` check on the head. Wire `sync-pr.mjs` to run it first and refuse a
clean-behind branch unless `--force-clean-behind` is passed. Target: the 175
green-to-green runs and 260 clean syncs per three days go to near zero.

Phase 1 (rules and timers, no code): Merge Desk and workers use
`subscribe_pr_activity` on each PR they own; the Desk's `SWEEP` uses
`needs-sync` before asking for a sync. One conflict-only resync worker handles
`CONFLICT` and `TIP-RED` for the queue, in #2440's cluster order.

Phase 2 (kill the hot spots, and order by overlap): move the top registries to
the `ratchets.d` shape (one file per branch, a generator merges them):
`tests/unit/store-registry.test.mjs`, `tests/unit/ci-coverage.test.mjs`,
`tools/ci/tooling-fast.mjs` entries, `tests/groups.json`. Generate #2440's map
with an `overlap-order` tool from pairwise `merge-tree`, so the Desk merges
in an order that minimizes forced syncs.

Phase 3 (only if Phase 0-2 leave stale-base reds): prototype option B on a
throwaway PR. Check first whether a `success` status with the context `CI`
overrides a failing `CI` check run in branch protection; if not, add a second
required context rather than overloading `CI`.

Measure again after Phase 0 with the same queries (sync count per merge,
green-to-green runs on sync heads); success is syncs per merge under 0.4 (now
1.2).

## 5. Risks

- The predicate says CLEAN-BEHIND but the merged tree breaks (semantic
  conflict). The Pages train gates the merged tip, and the train's red is then
  the signal; this is how it behaves today for every clean merge.
- Suppressing syncs raises the share of PRs that merge behind the tip; the
  train, not the PR tier, absorbs interaction failures. Watch the train's red
  rate for a week.
- `needs-sync` on a shallow clone: `merge-tree` needs the merge base; fetch
  deep enough (this note's scripts needed `--shallow-since`).
- `TIP-RED` detection by name is heuristic; a flake looks like a stale red. The
  rule "never re-run twice" still applies.
- Option B can create a PR whose `CI` is red and whose fresh status is green:
  confusing to readers and to `ready-gate.mjs`; define one arbiter before
  building it.

## Method and caveats

- Merge history from `git fetch --shallow-since=2026-10-12` of the deploy branch;
  PR merges are first-parent merge commits. A sync is a merge commit not on the
  first-parent chain with a parent on it (misses syncs whose deploy parent is a
  non-first-parent commit, so it is a floor). Conflict class: `git merge-tree
  --write-tree` of the two parents, exit 1 is conflicted, exit 0 with a tree equal
  to the real merge is clean, exit 0 with a different tree is "evil" (regenerated
  by `npm run gen`). It says a conflict existed, not who resolved it.
- Generated-file set for the conflict anatomy: AGENTS.md rule 11 plus the
  baselines and golden JSON files.
- CI numbers: `gh api repos/.../actions/workflows/ci.yml/runs?event=pull_request`
  paged per day (the API caps one query at 1,000 results), grouped by head branch
  because most runs carry no PR number. 10-13 is partial. Job names from the jobs
  endpoint; source-pin-hygiene from job logs.
- Not measured: runner minutes, whether a given run was fast tier (draft) or full
  tier (ready), and whether a flake caused any red-to-green flip.
