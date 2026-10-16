# CI/deploy architecture — research beyond plan items 1-5 and 14

Read-only pass, 2026-09-16. Repo untouched. Evidence: `.github/workflows/{ci,pages}.yml`,
`tools/ci/{deploy,sync-pr,pages-reuse-verdict,select-specs,select-budget}`, `docs/TESTING.md`
§Release train, the 09-16 research note and plan, plus LIVE Actions data pulled this session.

## 0. New live evidence (this session, not in the notes)

- **E1 — the tip's red is two jobs, and the reuse is not live yet.** Train run
  [35066895398](https://github.com/brycejmurrin/f1-game/actions/runs/35066895398) (pages #2348, sha `086e162`)
  failed on `Per-circuit geometry sweeps` (**68 pass / 2 fail**, 7m09s) and `Selected specs`
  (`pit-lane.spec.js`, `abudhabi-foundation…`, 6m42s). guards/node-suites/sweeps-parts/driving-model
  were green **and ran anyway** (guards 4m49s, node-suites 7m08s): the `fast_tier_run` reuse (B4) and the
  node-suites matrix (B5) exist only on the session branch, not on the deploy tip. Plan item 14's
  arithmetic is therefore still unrealised on the branch that ships.
- **E2 — pokes and cron collide.** Sha `851dd02` got THREE trains: #2338 success, #2339 **cancelled**,
  #2340 success and 16 min of gate for an already-live tip (runs 35048516949 / 35048654644 / 35049040503).
  The "one train at a time" group bounds concurrency, not duplication.
- **E3 — a non-blocking job leaks into every train.** `baseline-trial`'s `if:` is
  `pull_request || workflow_dispatch`; a poked train IS a `workflow_dispatch` as seen by the called
  workflow, so it ran in #2348 (45 s) against its own comment ("never the Pages call"). Harmless
  (`continue-on-error`) but the comment is wrong and the slot is real.
- **E4 — Node 20 deprecation warnings** on every job: `actions/checkout@v4`, `setup-node@v4`,
  `cache@v4`, `upload-artifact@v4` are being force-run on Node 24
  ([changelog](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/)).
  A pin bump (v5) is a 10-minute chore that prevents a surprise total-red.
- **E5 — the failure tail names nothing.** #2348's sweeps log ends `# fail 2` with no test names in the
  last 45 lines; a session must download and grep the full log to learn whose failure it is.

## 1. Branch topology for many autonomous agents

**1a. A landing bot (home-made merge train) — RECOMMENDED over per-session PRs.**
What: sessions stop pushing to the deploy branch. `deploy.mjs` pushes to `land/<session>` and calls
`gh workflow run land.yml`. `land.yml` (`concurrency: {group: land, cancel-in-progress: false}`) does:
fetch tip → `git merge --no-ff land/<session>` with `deploy.mjs`'s existing `cureableConflicts()` →
run ONLY the change-aware gate on the merged tree → fast-forward the deploy branch → delete the ref.
Source: `workflow_run`/`workflow_dispatch` are the two events a `GITHUB_TOKEN` may raise
(https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) —
the repo already relies on this in `poke-train`. Fit: high; it is `deploy.mjs` moved server-side, so the
merge/cure/verify logic is already written and tested. What breaks at 5 agents/hour: the queue is
serial, so landing lag = queue depth × gate. Bound it by landing on the FAST tier only (the train still
gates the tip before publishing) — the property gained is that no two sessions ever race the same tip
and no push is ever cancelled mid-verdict (fixes 15 % cancelled runs, B7).
Verify: dry-run `land.yml` on a scratch branch; assert the deploy branch is only ever fast-forwarded
(`git merge-base --is-ancestor`). Saving: removes the push-race class and ~1 wasted gate per collision;
does not by itself shorten a gate. Risk: a bot with `contents: write` on the deploy branch — pair with a
ruleset (plan item 5) that only the bot may push.
**1b. Per-session PRs + auto-merge** (`gh pr merge --auto`, required checks via a ruleset;
https://mergify.com/compare/github-merge-queue confirms native merge queues stay org-only, and
Mergify/Aviator apps do install on user accounts — *unverified for this account*). Honest cost: every
auto-merge makes a NEW commit whose tree differs from the PR head once the base moved, so
`pages-reuse-verdict.sh` finds no candidate and the gate runs again. At 5 PRs/hour this is strictly
more gate-minutes than today unless the gate is change-aware end-to-end (§2). Adopt only with §2a.
**1c. Trunk + feature flags** — already the de-facto pattern (`apex26.gfxBackend`, `matTexMix`).
Extend it as a rule: a subsystem rewrite ships dark behind an `apex26.*` flag so a red spec never blocks
another session's deploy. Free; the only structural answer to "one session's red blocks everyone".
**1d. Stacked branches** (Graphite/`spr`/`ghstack`): helps one agent's dependent chain, not cross-session
contention. Skip.

## 2. Job-level result reuse (the biggest untaken win)

**2a. A per-job INPUTS-HASH verdict cache.** Generalises B4 from "a whole run on the exact tree" to
"any job, any branch, whose own inputs are unchanged". Mechanism: `actions/cache/restore` with
`lookup-only: true` (documented input; https://github.com/actions/cache — `cache-hit` output, and
"the default branch cache is available to other branches"). The deploy branch IS the default branch
here, so a verdict earned on the deploy branch is visible to every session branch.
Sketch, per tree-only job:
```yaml
- id: h                       # tools/ci/inputs-hash.mjs guards  -> sha256 of a declared path set
  run: echo "key=guards-$(node tools/ci/inputs-hash.mjs guards)" >> "$GITHUB_OUTPUT"
- id: memo
  uses: actions/cache/restore@v4
  with: { path: .verdict, key: "${{ steps.h.outputs.key }}", lookup-only: true }
- if: steps.memo.outputs.cache-hit != 'true'
  run: npm run test:tooling-fast
- if: steps.memo.outputs.cache-hit != 'true'
  run: date > .verdict
- if: steps.memo.outputs.cache-hit != 'true'
  uses: actions/cache/save@v4
  with: { path: .verdict, key: "${{ steps.h.outputs.key }}" }
```
`inputs-hash.mjs` hashes: the job's declared path set (for guards: `tools/`, `tests/unit/`, `docs/`,
`js/**` for the lint-class guards, `package-lock.json`, `.github/workflows/ci.yml`) + the node version.
Prior art: Turborepo/Nx memoise a task on a hash of its inputs, lockfile and env
(https://www.warpbuild.com/blog/github-actions-monorepo-guide). Fit: very high — the repo already
thinks in "same bytes ⇒ same answer" (`pages-reuse-verdict.sh`). Saving (measured today): guards 4m53s
and sweeps-parts 1m56s skipped on most pushes; the train's four tree-only jobs skipped without needing
a fast-tier run id at all, which also covers the case `fast_tier_run` misses (a tip whose fast tier was
cancelled). Verify: a nightly `NO_MEMO=1` run that ignores the cache and must agree; a unit test that the
declared path set covers every file the job's scripts read (derive it from `tests/groups.json` +
`tooling-fast.mjs`'s list). Risk: an input outside the hash (the classic Turborepo "stale replay") →
fail-safe by hashing WIDE sets and by keeping the nightly no-memo run as the auditor.
**2b. Cache the built circuit geometry.** `elevation-tracks-vm` is 40 circuit builds (399 s local) and the
sweeps rebuild the fleet per suite. Give `tools/lib/track-build-vm.cjs` a disk cache at
`.cache/track-build/<sha256(engine+circuit+tools/lib)>.json`; CI restores it with `actions/cache` keyed on
`hashFiles('js/track/**','js/circuits/**','tools/lib/**')` with a `restore-keys` prefix so a one-circuit
change reuses 39 entries. Saving: the fast tier's floor (`vm-a` ~6.5 min) and the sweeps' rebuild cost —
plausibly 4-8 min per geometry push (*unverified until profiled; plan item 3 step 1 is the profile*).
Risk: a geometry regression hidden by a stale entry — the key must include the tools that BUILD, and the
nightly must run with the cache disabled. Cross-run artifacts (`download-artifact` with `run-id` +
`github-token`, actions:read) are the alternative carrier if the cache size becomes the issue.

## 3. Sharding, matrices, dashboards

**3a. Timing-balanced shards.** Playwright splits by COUNT only — the docs state it and offer no
duration option (https://playwright.dev/docs/test-sharding). B6 fixed smoke by hand-ordering the file,
which decays. Instead: commit `tests/data/spec-timings.json` (test title → seconds, llvmpipe), and let
`select-specs.mjs` — which already emits an explicit `{name,specs,tests,timeout}` matrix — bin-pack by
TIME for the smoke/wide runs too, emitting `--grep`-free explicit spec lists per shard. Regenerate the
file in the nightly from the blob/junit and open a PR with the diff. Saving: the pole shard, not the sum
(smoke p90 was 14.5 min pre-B6); durable where hand-ordering is not. Risk: a stale timing file → cap it
with the existing per-shard `shardTimeoutMin`.
**3b. Blob reporter + one merged report.** Add `blob` to the reporter list under `CI`, upload per shard,
and a final `if: always()` job running `playwright merge-reports --reporter=html,junit`. Enables 3c/5a
(one junit for the whole run) and replaces four failure artifacts.
**3c. Advisory lanes.** `continue-on-error: true` is already the `baseline-trial` pattern; make it a
convention: any NEW job enters as advisory with a summary row, and is promoted by deleting one line —
this is exactly how `renderer-macos` and `baseline-trial` were meant to work (and E3 shows an advisory
job's `if:` is easy to get wrong; test it in `ci-coverage.test.mjs`).
**3d. A run-summary dashboard.** A final `summary` job (`if: always()`, `needs:` every job) that reads
`jobs` via the API and writes ONE table to `$GITHUB_STEP_SUMMARY`: job, conclusion, minutes, and for
failures the test names from the merged junit (fixes E5). ~20 lines of `gh api` + node.

## 4. Runners

- **Larger runners are unavailable.** Docs: larger runners are "available for organizations and
  enterprises on GitHub Team and GitHub Enterprise Cloud plans"
  (https://docs.github.com/en/actions/reference/runners/github-hosted-runners). Same class as merge
  queues: close it, like the note closed §1's merge-queue row.
- **Standard runners on a PUBLIC repo are free and unlimited, 4 vCPU (x64 AND arm64).** Two consequences:
  (i) the "macOS bills at 10×" comments in `ci.yml`/`gpu-census.yml` are about a billing model that does
  not apply here — the real constraint is the 20-slot concurrency and macOS queue time, so
  `renderer-macos` could be promoted from nightly to "on renderer diffs" if its queue time is acceptable
  (*measure first*); (ii) ARM buys no extra cores, but a per-core comparison is a free experiment:
  duplicate the `vm-a` slice on `ubuntu-24.04-arm` in the nightly and compare wall time (*unverified*).
- **Self-hosted GPU runner: do not.** GitHub: "We recommend that you only use self-hosted runners with
  private repositories… forks can potentially run dangerous code on your self-hosted runner"
  (https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners). The
  real-GPU need is already served by `gpu-census.yml` + `renderer-macos` on hosted macOS.
- **E4 chore:** bump `actions/*@v4` → `@v5` and `setup-node` to node 22 in one PR.

## 5. "Was it already red on the base?" — one line in the run summary

`tools/ci/base-verdict.sh <job-name>`: resolve the base (`inputs.before_sha`, else the live apex-sha, the
same resolution `ci-resolve-before.sh` already does), `gh api actions/runs?head_sha=<base>` → find the same
workflow's run → `jobs` → the same job name's conclusion; and, with 3b's merged junit downloaded from
that run (`download-artifact` with `run-id`), diff the FAILING TEST NAMES. Emit one line:
`sweeps: 2 failing (suzuka-*, …) — ALSO failing on base 086e162 (not introduced by this push)`.
Fit: the lookup is `pages-reuse-verdict.sh` with a different predicate; the repo's own norm ("a red you did
not cause is a different decision from a red you did"). Saving: minutes of agent triage per red tip, and
it directly answers today's situation (E1) — the tooling change wanting to ship can see in one line that
`sweeps`+`selected` were red on the base. Risk: none to the gate (summary-only, never a skip).

## 6. One request for "what is going on with the deploy?"

Two halves:
1. **`_site/status.json`, stamped by the `deploy` job** next to `version.json`:
   `{build, sha, published_at, gate_run, gate_conclusion, fast_tier_run, reused}`. It is the only
   artifact an agent can read WITHOUT a token, and `pages-live-sha.sh` already parses the live shell.
2. **`tools/ci/status.mjs`** — one command, one API call (`actions/runs?branch=<deploy>&per_page=20`) plus
   that JSON: prints `live sha/build`, `tip sha`, `tip gate verdict`, `red jobs + failing test names`,
   `trains queued`, `is my sha live?`. `deploy-research` and `verify-change` call it instead of polling
   several endpoints. GOTCHA to record: do NOT publish status by pushing to a branch — `ci.yml` runs on
   push to EVERY branch, so a status branch would start CI runs unless `branches-ignore` is added.
Saving: replaces the multi-call polling every session does; makes E1-style "whose red is it" a one-liner.

## Ranking (saving ÷ risk, highest first)

| # | item | effort | expected saving | risk |
|---|---|---|---|---|
| 1 | §5 base-verdict line in the summary + §3d failure digest | 3 h | minutes of triage per red tip; unblocks a red-tip session today | none (advisory) |
| 2 | §2a per-job inputs-hash verdict cache | 1 d | ~7 min per push, ~9 min per train; covers the cases `fast_tier_run` misses | stale skip — nightly no-memo run is the auditor |
| 3 | §6 status.json + `status.mjs` | 4 h | one request replaces N; fewer wrong "is it live" reads | low |
| 4 | §2b geometry build cache | 1 d | 4-8 min on geometry pushes, the `vm-a` floor (*unverified*) | stale geometry — key must include the builders |
| 5 | §3a timing-balanced shards from a committed timing file | 1 d | the pole shard, durably (B6 by hand decays) | stale timings, capped by `shardTimeoutMin` |
| 6 | §1a landing bot (with §1c flags, and item 5's ruleset) | 1-2 d | removes the push race + the 15 % cancelled class | a bot with write on the deploy branch |
| 7 | §3b blob + merge-reports | 3 h | prerequisite for 1 and 5 | low |
| 8 | E3 `baseline-trial` `if:` + E4 action pins + `ci-coverage` pins for both | 1 h | a slot per train; avoids a forced-Node total-red | low |
| 9 | §4 ARM nightly comparison / `renderer-macos` promotion | 2 h | unknown, cheap to learn | none |
| — | §1b per-session PRs + auto-merge | — | NEGATIVE before §2a (every merge re-gates) | — |
| — | larger runners, self-hosted GPU runner | — | unavailable / discouraged on a public user repo | — |

**Unverified claims flagged above:** ARM per-core gain; geometry-cache saving; Mergify/Aviator on this
account; macOS queue times; that the Playwright version in use (1.63.0) still offers no duration-based
sharding beyond the documented count split.
