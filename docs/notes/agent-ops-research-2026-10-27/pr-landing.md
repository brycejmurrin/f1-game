# Throttle the fleet, then batch the landings

Landing faster in this repo is a capacity problem before it is a tooling problem. About 7 PRs arrive per hour and about 3.5 merge, so utilization is near 2 and the open count grows by roughly 84 PRs a day, whatever merge tool sits at the end. A strictly serial queue that ran the ~40-minute full tier on every combined state could land only 1.5 PRs an hour. Today's 3.5/h is possible only because most PRs land on a full-tier result that is up to six game merges stale. The gate's cheap merge-result checks and the Pages train are the backstops: they keep breakage off the site, but not off the branch.

The highest-return moves need no rule change:

- cap each agent lane's open PRs and creation rate, and admit only PRs whose own floor is green;
- refresh only the PRs about to land;
- make every generator's output independent of merge order;
- then batch: first as Rust-style merge-commit rollups of low-risk PRs through the existing `gate`, later as a train that runs the full tier once per batch and releases each PR through `gate` and auto-merge.

A toy model of this queue shows the size of the gain. Two lanes of four-PR batches land 6–9 PRs/h at a 2–5% per-PR train failure rate, for under half a full-tier run per PR. Unbatched speculation needs five to eight full tiers in flight, which a 40-job concurrency cap cannot hold. The master variable is that failure rate. Above ~10%, no queue design keeps up, and the money is better spent on admission control and flakes.

Review scales the same way. Route each PR by its risk tier and make Claude Code Review's machine-readable "Important" count an input to `gate` for code PRs. Keep the maintainer's attention for a labelled tail that touches the landing machinery or physics.

Among the rule changes, generating runtime files at deploy time pays most, because Pages already deploys an Actions artifact. Moving to a free organization for GitHub's native merge queue pays least. That queue runs one full build per PR, a free org halves concurrency from 40 to 20 jobs, and the game moves to a new origin that GitHub will not redirect, which strands installed PWAs and browser-stored saves. Squash, rebase and stacked PRs solve problems this repo does not have.

## Fourteen moves ranked, seven of them possible under today's rules

The ranking weighs throughput or safety gained against build-and-operate effort. Impact is judged against the two goals in the question: land more PRs per hour, and keep the deploy branch green. "Today's rules" means the AGENTS.md regime:

- merge commits only;
- only PRs land, through `gate` plus auto-merge;
- no pushes to the deploy branch, no force-pushes and no rebases;
- generated files are committed and there is no build step;
- no Actions run is ever cancelled;
- the repo is user-owned, with Pages at `brycejmurrin.github.io/f1-game`.

| # | Move | Rules | Impact | Effort | Main cost |
|---|---|---|---|---|---|
| 1 | Admission control: per-lane open-PR cap, hourly PR-creation cap, `land` only after the lane's floor is green | Today | Very high. It is the only lever that makes the queue stable | Low (dispatcher policy) | New work waits; lanes finish before they start |
| 2 | Lazy freshness: sync only the PRs next in line; supersede PRs that are both far behind and idle | Today | High (CI and sync churn saved) | Low | Some PRs closed and re-authored |
| 3 | Order-independent generators, per-entry fragment inputs, regenerate (never hand-merge) during sync | Today | High for `gen:check` drift reds | Low–medium per generator | One-time refactor of positional fields |
| 4 | Risk-classed rollup PRs built from merge commits and landed through the normal `gate` | Today | High: 4–6 PRs per full-tier run | Medium | A failed rollup needs bisecting; `Closes #n` restated; App token so CI fires |
| 5 | Risk-tiered review: Claude Code Review severity read by `gate`, a maintainer label on the high-risk tail, PR creation restricted to collaborators | Today | Medium–high (quality, not speed) | Low–medium | $15–25 per managed review at the vendor's quote |
| 6 | Two-step CI: a slim per-PR tier, the full browser tier once per batch | Today | High: frees runner slots | Medium | Weaker per-PR signal; batches absorb failures |
| 7 | Batch train that releases PRs one by one via `gate` + auto-merge (shunt pattern), replacing the distance row | Today (repo code only) | Highest: full-tier testing of the combined state at 6–9/h | High | A controller to build and own; any outside merge invalidates a train |
| 8 | Generate runtime files at deploy time instead of committing them | Change rule 11 and "no build step" | High: the generated-file conflict class mostly disappears | Medium | A checkout is not servable before `npm run gen` |
| 9 | Give agents a separate identity (a GitHub App or the one permitted machine account) and put CODEOWNERS on high-risk paths | Change: agents stop acting as the maintainer | Medium | Low–medium | Re-plumbed agent auth |
| 10 | Let the train controller (not agents) cancel its own obsolete runs | Change "never cancel" | Medium (runner slots) | Low | Evidence from cancelled runs is lost |
| 11 | Hosted queue: Mergify Open Source plan or Trunk free tier | Change: a vendor app merges | High *if* batching is on the free plan | Medium | Plan coverage and personal-account support unverified |
| 12 | Bot fast-forwards the deploy branch to the tested merge commit (bors/gitea-mq) | Change: a bot pushes the deploy branch | Medium: tested SHA = landed SHA | High | The bot becomes the protection; needs Postgres |
| 13 | Transfer to a free org for GitHub's native merge queue | Change: owner and Pages origin | Low or negative | High | New origin, stranded saves and PWAs, 20-job cap, no CI saving |
| 14 | Squash or rebase merges; stacked PRs | Change: merge method and force-push | About none for landing speed | Medium | Breaks the "Live?" ancestry check and issue auto-close; stacks lack auto-merge |

The order follows from the queueing arithmetic in the next two sections. Moves 1–3 are cheap and make every later move cheaper. Move 4 delivers most of move 7's throughput at a fraction of the build cost, so it should come first. Move 7 is where a self-hosted merge queue ends up if the per-PR failure rate proves low.

## Arrivals at twice capacity make admission control the first fix

Little's law ties the numbers together. The long-run number of items in a system equals arrival rate times time in system, but only while the system is stable. When arrivals exceed exits, the waiting count "would gradually increase towards infinity" ([Wikipedia: Little's law](https://en.wikipedia.org/wiki/Little%27s_law)). At **7 PRs/h in and 3.5/h out**, the open count grows by about 3.5 an hour, roughly 84 a day. The 70 open PRs are a point on a rising line, not an equilibrium.

Suppose intake were throttled to match output. Holding 70 PRs open would then mean a **20-hour average lead time** (70 ÷ 3.5); holding about 20 open would mean about 6 hours. A fleet-wide WIP cap follows from the lead-time target: target lead time × sustainable merge rate, split across lanes. That arithmetic is standard queueing theory, not a published PR-queue study.

The mature fleets of automated authors, the dependency bots, already ship these controls:

- **Dependabot** stops opening PRs once **5** are open by default ([GitHub Docs: Dependabot options](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)).
- **Renovate** defaults to **10 concurrent PRs** and **2 new PRs per hour**, so that PRs do not "overwhelm your CI systems". It has a commit-rate cap that also limits rebases. Its `prCreation: status-success` mode opens a PR only "if/when the tests pass" ([Renovate configuration options](https://docs.renovatebot.com/configuration-options/)).

For the agent dispatcher, the translation is three rules. Each lane gets an open-PR cap and an hourly creation cap. A lane adds `land` only after its own floor is green. A lane at its cap switches to finishing or closing its own PRs. Mergify calls the green-entry rule two-step CI: fast checks gate entry to the queue, and the exhaustive checks run inside it ([Mergify: parallel checks](https://docs.mergify.com/merge-queue/parallel-checks/)).

PR size feeds the same arithmetic, because smaller PRs fail less, conflict less and review faster:

- Google's median reviewed change is **24 lines**, and small changes get first feedback in under an hour against about five hours for very large ones ([Sadowski et al., ICSE-SEIP 2018](https://sback.it/publications/icse2018seip.pdf)).
- LinearB's 2026 benchmark puts "elite" PRs under 100 lines. It reports agentic-AI PRs with a P75 of 293 lines and a P75 pickup of 17.6 hours, and only **32.7% merged within 30 days against 84.4% for manual PRs**. These are vendor figures and correlational ([LinearB benchmarks 2026](https://linearb.io/library/engineering-benchmarks-and-research)).
- Studies of agent PRs agree that unmerged ones are larger, touch more files and more often fail CI. Duplicate PRs and issues already fixed by another PR are leading reasons for non-merge ([arXiv 2601.15195](https://arxiv.org/abs/2601.15195); [arXiv 2602.00164](https://arxiv.org/abs/2602.00164)).

The repo's existing one-draft-PR-per-claimed-issue convention is therefore the right dedupe signal. Batching belongs at landing time, not authoring time.

The second cheap fix is to stop paying for freshness nobody needs. Updating every open PR after each merge costs at least N(N−1)/2 updates to drain N PRs, against N−1 when only the next PR is updated ([Kodiak config reference](https://kodiakhq.com/docs/config-reference)). For 70 PRs that is **about 2,415 forty-minute runs against 69**. Every mature system tests only the PR about to land against the current tip. Kubernetes' Tide says GitHub's up-to-date requirement "provides absolutely no benefit over Tide's natural behavior, and forces PR author's to needlessly rebase" ([Maintainer's Guide to Tide](https://docs.prow.k8s.io/docs/components/core/tide/maintainers/)).

The repo has already felt this. On 2026-10-27 the gate's distance limit was raised from 2 to 6 game merges, after green PRs were refused and re-synced three times each (repo: `tools/ci/merge-gate.mjs`, `MAX_BEHIND`).

For staleness, the common defaults (60 days to "stale", 7 more to close) were set for human contributors ([actions/stale](https://github.com/actions/stale)). They fit poorly when agents open 7 PRs an hour. Re-authoring an agent PR is cheap, so the better policy is to supersede a PR that is both far behind and idle, after pinging whoever blocks it. Microsoft's randomized "Nudge" trial, which pinged the blocking party on overdue PRs, cut their resolution time by **60%** across 147 repositories ([Nudge, arXiv 2011.12468](https://ar5iv.labs.arxiv.org/html/2011.12468)).

## One 40-minute lane lands 1.5 PRs an hour, and only batching multiplies it cheaply

The ceiling is arithmetic. A lane that runs the full tier on each combined state lands one PR per run, so a 40-minute tier gives 60 ÷ 40 = **1.5 PRs/h**. Aviator states the same formula for a 30-minute suite: "a theoretical maximum of 48 pull requests per day" ([Aviator queue modes](https://docs.aviator.co/mergequeue/concepts/queue-modes.md)).

Today's flow works differently. The `gate` re-runs the fast `gen:check` and ratchet tests on a throw-away merge with the current tip. It accepts a full-tier CI result measured against a base up to six game merges old. The Pages train then gates every deploy tip before publishing (repo: `tools/ci/merge-gate.mjs`, `.github/workflows/land.yml`). That keeps broken builds off the site but not off the branch. The repo's own measurement shows the price: trains went red **13.3% of the time when a merge landed after a PR's green run, against 4.3% otherwise** (repo: `tools/ci/merge-gate.mjs` header).

This is the "pass alone, break together" problem every merge queue exists to solve. The bors-ng README gives the canonical case: PR #1 renames a function, PR #2 adds a call to the old name, both pass CI, and main goes red ([bors-ng](https://github.com/bors-ng/bors-ng)). Uber measured roughly a **40% chance of conflict among 16 concurrent changes**, and an iOS mainline that was green only 52% of one sample week before its SubmitQueue ([The Morning Paper on Uber, EuroSys'19](https://blog.acolyer.org/2019/04/18/keeping-master-green-at-scale/)).

Three designs exist, and they differ mainly in CI cost:

- **Serial queues** test one PR at a time on the tip.
- **Speculative trains** (GitHub's native queue, GitLab merge trains, Zuul) test A, A+B and A+B+C in parallel. They cost one full run per PR plus discarded runs behind every failure. GitHub says plainly that "merge limits do not combine `merge_group` builds" ([GitHub Docs: managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)).
- **Batching** (bors, Mergify, Trunk, and Rust's human-curated rollups) tests k PRs in one run and bisects when a batch fails. It is the only design that cuts CI per landed PR.

Mergify's "RCV theorem" says a queue can optimise only two of reliability, cost and velocity. It puts batching at velocity plus cost, with the caveat that "hidden failures inside a passing batch can land on main" ([Mergify: parallel checks](https://docs.mergify.com/merge-queue/parallel-checks/)).

A toy model written for this research makes the trade concrete. It is the author's simulation, not a published figure (`merge_queue_throughput_model.py` in the research-notes folder; 20,000 rounds per cell). Its assumptions: a saturated queue, a deterministic 40-minute tier, no flakes, failures independent with probability p per PR, and a queue that pauses while it bisects.

| Design (full tiers in flight × batch size) | p = 2% | p = 5% | p = 10% | p = 20% |
|---|---|---|---|---|
| Serial, 1 × 1 | 1.5/h (1.02) | 1.4/h (1.05) | 1.3/h (1.11) | 1.2/h (1.25) |
| Speculative, 5 × 1 | 7.1/h (1.06) | 6.4/h (1.16) | 5.5/h (1.36) | 4.0/h (1.86) |
| Speculative, 8 × 1 | 11.0/h (1.09) | 9.6/h (1.25) | 7.7/h (1.56) | 5.0/h (2.40) |
| Batched, 1 × 4, binary bisect | 4.4/h (0.34) | 3.2/h (0.47) | 2.2/h (0.69) | 1.3/h (1.15) |
| Batched, 1 × 8, 2-way cumulative split | 8.3/h (0.22) | 5.5/h (0.37) | 3.3/h (0.67) | 1.6/h (1.41) |
| Batched, 2 × 4, 2-way cumulative split | 9.0/h (0.32) | 6.3/h (0.45) | 4.1/h (0.67) | 2.1/h (1.27) |
| Batched, 3 × 4, 3-way cumulative split | 13.1/h (0.34) | 9.0/h (0.50) | 5.6/h (0.80) | 2.9/h (1.57) |

*Merges per hour, with full-tier runs per merged PR in brackets.*

Three readings matter.

First, **p dominates**. At p ≤ 5%, two lanes of four keep pace with 6–9 arrivals an hour at under half a full-tier run per PR. At p = 10%, only eight concurrent speculative builds reach 7/h. At p = 20%, nothing modelled keeps up.

Second, **concurrency decides which family is even possible**. GitHub-hosted runners allow 20 concurrent jobs on Free, 40 on Pro and 60 on Team ([GitHub Actions limits](https://docs.github.com/en/actions/reference/limits)). The repo's CI notes it runs on Pro's 40 slots (repo: `.github/workflows/ci.yml`). `ci.yml` declares 22 jobs, including a six-slice node matrix and two four-shard matrices. By this report's count, a full tier at full fan-out therefore claims around twenty slots, though many jobs finish well before the 40-minute wall. Two full tiers in flight is about the ceiling. The 5–8 concurrent tiers that speculation needs do not fit, but batched lanes do, especially if per-PR CI is slimmed so the slots go to the batch.

Third, **arrivals must still come down**. One lane of eight at p = 5% lands about 5.5/h, below the 7/h arrival rate, which is why move 1 ranks above everything else.

The local measurement fits the band where batching works. Trains red 4.3% of the time without interleaved merges and 13.3% with them suggest an interaction-plus-flake rate in the mid single digits. A train covers several merges, though, so this is a proxy, not p itself. Measuring p from gate and train history is the first job of any batching rollout.

Published operating points cluster at modest batch sizes:

- Shopify chose batches of 8 with three batches in flight, because bigger batches "impede throughput by causing failures that are harder to isolate" ([Shopify Engineering, 2019](https://shopify.engineering/successfully-merging-work-1000-developers); pre-2023).
- Trunk's defaults are a target batch of 4 and a 5-minute wait ([Trunk batching](https://docs.trunk.io/merge-queue/optimizations/batching)).
- Rust rollups run 10–20 PRs against a CI of about 3 hours ([Rust Forge: rollups](https://forge.rust-lang.org/release/rollups.html)).
- GitHub's own monorepo queue deploys "30 or more changes at once" and cut the average wait to ship by 33% ([GitHub blog, 2024](https://github.blog/engineering/engineering-principles/how-github-uses-merge-queue-to-ship-hundreds-of-changes-every-day/)).

Bisection is the cost of failure. Binary halving adds about log₂B serial rounds, which is roughly two extra hours at B = 6 with a 40-minute tier. Mergify's N-way cumulative split resolves a failed batch of 2–4 in one round when N = 3. Batch sizes that keep N parallel checks busy follow (Nᵏ−1)/(N−1): 1, 4, 13 for N = 3 ([Mergify: batches](https://docs.mergify.com/merge-queue/batches/)).

Flakes masquerade as failures. Shopify's table shows that a test failing spuriously 25% of the time wrongly evicts 25% of PRs if a single failure evicts, and 1.5% if three consecutive failures are required ([Shopify, 2019](https://shopify.engineering/successfully-merging-work-1000-developers)). The repo's quarantine file and its "a pass that needed a retry is a red" rule lower p directly.

One residual risk stays even in a passing batch. Bisection can put two semantically conflicting PRs into different halves that each pass, so both land ([gitea-mq README](https://github.com/Mic92/gitea-mq)). That argues for a `max` of 4–6 and for keeping the Pages train as the backstop.

Under today's rules this can be built in two steps.

**Step one: rollup PRs.** A bot selects green, low-risk PRs: the analogue of Rust's `rollup=always`, such as docs-, tests- or tools-only diffs. It merges each PR's head with `--no-ff` into a rollup branch and opens one PR that passes through the normal `gate`.

When the rollup lands with a merge commit, GitHub marks every original PR as merged, because its commits "become reachable from the base branch" ([GitHub Docs: pull request merges](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/about-pull-request-merges)). The original commits stay ancestors, so the repo's "Live? = ancestor of `apex-sha`" check keeps working. GitHub's own `combine-prs` Action does the mechanical version. It combines only green PRs by default, leaves out PRs that conflict, and recommends an App token so CI runs on the combined PR ([github/combine-prs](https://github.com/github/combine-prs)).

The costs are small but real. Each original's `Closes #n` must be restated in the rollup body, because whether closing keywords fire through an indirect merge is unverified. Indirect merges also skip the originals' own branch protection, so the gate must judge the rollup itself, which it already would. When a rollup fails, Rust's procedure applies: find the culprit from the logs, un-approve it, and rebuild the rollup without it ([Rust Forge](https://forge.rust-lang.org/release/rollups.html)).

**Step two: a release train.** This is the shunt pattern. A controller builds `train/<n>` as the tip plus PR₁…PRₖ in merge commits and runs the full tier once. On green, it releases PR₁ by setting the required status and waits for the forge's auto-merge, then releases PR₂, and so on. The bot never pushes to the base branch ([shunt](https://pkg.go.dev/github.com/rbtr/shunt)). gitea-mq's serial mode does the same thing on GitHub as an App ([gitea-mq](https://github.com/Mic92/gitea-mq)).

A few points need care:

- With merge commits, each GitHub merge should reproduce the tested tree if nothing else lands in between. That is reasoning from git's deterministic three-way merge, not a documented guarantee. The gate must therefore refuse non-train merges while a train is in flight; Tide's maintainer guide says "Every merge invalidates currently running tests for that pool" ([Tide](https://docs.prow.k8s.io/docs/components/core/tide/maintainers/)).
- The distance row becomes "tested in a train whose base is the current tip".
- The controller needs an App or PAT token, because "events triggered by the GITHUB_TOKEN will not create a new workflow run" ([GitHub Docs: GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token)).
- The no-cancel rule means obsolete train runs keep holding slots until they finish. GitLab cancels redundant train pipelines automatically ([GitLab merge trains](https://docs.gitlab.com/ci/pipelines/merge_trains/)), which is why move 10 is listed.
- Pairing the train with two-step CI is the main cost lever. shunt exists to move "an expensive suite… from every PR to once per batch" ([shunt](https://pkg.go.dev/github.com/rbtr/shunt)), and the repo's path-based test selector already supplies the slim per-PR tier.

## Generated files collide because their output depends on merge order

Fowler defines a semantic conflict as changes that "can be safely merged on a textual level but cause the program to behave differently", and he notes that tools "can't automatically resolve" them ([Martin Fowler: SemanticConflict](https://martinfowler.com/bliki/SemanticConflict.html)).

They are more common than file ownership suggests. In MERGEGYM's sample of 715 PR pairs, **47.3% of textual conflicts occurred despite disjoint authored file sets**. A local `git merge-tree` replay took a median **0.02 seconds**, which led the authors to conclude: "when exact replay is cheap, verify everything" ([arXiv 2610.04779](https://arxiv.org/abs/2610.04779)). Shared derived files are where agents on disjoint source files still meet: generated indexes, manifests and changelogs.

Two repairs that look obvious do not work here. GitHub's server-side merges ignore a repository's `.gitattributes` merge drivers. The evidence is a quoted GitHub Support reply and a feature request open since 2021, not formal documentation ([GitHub Community #9288](https://github.com/orgs/community/discussions/9288)). And the built-in `union` driver keeps lines "in random order" ([git-scm: gitattributes](https://git-scm.com/docs/gitattributes)), which is unsafe for JSON. No merge-driver trick fixes PRs landed by auto-merge.

The concrete failure, a generated JSON index with a sequential `order` field that broke the deploy branch when two PRs each added an entry, is a textbook non-commutative generator. Rails hit the same anti-pattern with sequential migration numbers and switched to UTC timestamps because parallel branches collided ([Rails forum](https://discuss.rubyonrails.org/t/timestamped-migrations/31715)). The durable fixes, in order:

1. **Remove positional counters.** Sort entries by a stable key and derive position at read time. If display order is a product need, store an author-chosen sort key: a lexicographic or fractional key, as in Figma's ordering scheme, with ties broken by id ([Figma: realtime editing of ordered sequences](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/)). The generator then gives the same result whichever PR lands first.
2. **Keep inputs as one source file per entry.** This is towncrier's news-fragment model ([towncrier](https://towncrier.readthedocs.io/en/stable/tutorial.html)), and the repo already does it for `docs/changelog.d/` and `ratchets.d/`.
3. **Keep the land-time merge check, and re-run it when the tip moves.** The gate already runs `gen:check` and the ratchets on a throw-away merge with the current tip (repo: `tools/ci/merge-gate.mjs`). At sub-second replay cost, re-checking on every tip move is affordable.
4. **Serialize only PRs that touch generator inputs or outputs.** This is the cheap cousin of Uber's rule that two changes conflict only "if they both affect a common set of build targets" ([Morning Paper](https://blog.acolyer.org/2019/04/18/keeping-master-green-at-scale/)).
5. **In the sync tool, treat generated files like lockfiles.** Take either side, then regenerate; npm's documented fix for a conflicted lock is likewise to rerun the installer rather than hand-merge ([npm docs: package-locks](https://docs.npmjs.com/cli/v6/configuring-npm/package-locks/)).

The rule change with the biggest payoff here is to stop committing the runtime-served generated files. The Go team's reason for committing generated code is that consumers cannot run the generator ([The Go Blog: generating code](https://go.dev/blog/generate)). This repo's only consumer is the Pages deploy, which can.

The deploy half is mostly built already. `pages.yml` stages `_site` and publishes it with `upload-pages-artifact` and `deploy-pages` (repo: `.github/workflows/pages.yml`), and GitHub supports exactly that custom-workflow source on free public repos ([GitHub Docs: custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)).

The price is the "serve the checkout as-is" premise:

- `npx serve .` and Playwright would need `npm run gen` first. npm's `prepare` hook runs on every plain `npm install` ([npm docs: scripts](https://docs.npmjs.com/cli/v11/using-npm/scripts/)), and the SessionStart hook already runs one.
- Deployed bytes would differ from committed bytes, so `version.json` must carry the source SHA.
- Tests that freeze generated output would become generate-then-assert.
- `package.json`'s generated test scripts cannot be deploy-generated at all, and would give way to one runner that reads `tests/groups.json` at run time.

A hybrid is reasonable if the no-build property matters more. Keep the runtime files committed but order-independent, and mark them `linguist-generated` so they collapse in diffs ([GitHub Docs: customizing changed files](https://docs.github.com/en/repositories/working-with-files/managing-files/customizing-how-changed-files-appear-on-github)).

## Review scales by risk tier, with bots feeding the gate rather than replacing it

Every major review bot is advisory unless wired otherwise. Claude Code Review "never approves or blocks the pull request", and its check run "doesn't conclude as a failure". It does expose a machine-readable line, `bughunter-severity`, whose `normal` count is the number of "Important" findings. A missing line means "no verdict rather than zero findings" ([Claude Code Docs: read and request reviews](https://code.claude.com/docs/en/code-review-pull-requests)). Automatic reviews skip drafts and start when a PR is marked ready ([same page](https://code.claude.com/docs/en/code-review-pull-requests)). In this repo the ready flip and the `land` label arrive together and the gate never reads the review, so findings are advisory and can arrive after auto-merge has armed.

Precision argues for gating on the top severity only. On Martian's live benchmark of 14,944 recent PRs, Claude's precision was **68.9%**, Copilot's 67.1% and the best tool's 80.9% ([Martian Code Review Bench](https://codereview.withmartian.com/)). Those rankings shuffle month to month ([aicodereviews.io](https://www.aicodereviews.io/blog/martians-code-review-bench-the-1-claim-rots-in-months/)).

Cost argues for tiers. Anthropic quotes $15–25 per managed review and reports that developers mark under 1% of findings incorrect, both vendor figures ([The New Stack](https://thenewstack.io/anthropic-launches-a-multi-agent-code-review-tool-for-claude-code/)). Reviewing every arrival, about 168 PRs a day at 7/h, would cost roughly **$2,500–4,200 a day** at that price, by this report's arithmetic.

Meta's RADAR shows what a tiered funnel can do at scale. It runs eligibility gates, static heuristics, a learned risk score, LLM review and deterministic validation, in that order. It landed 331K+ diffs automatically, with a revert rate one-third and a production-incident rate one-fiftieth of other diffs ([arXiv 2605.30208](https://arxiv.org/abs/2605.30208)). That comparison is against an already-filtered low-risk population: it shows the funnel holds risk back, not that LLM review makes code safer. Acceptance studies point the same way. Agent docs PRs are accepted at 82.1% and performance PRs at 55.4% ([arXiv 2602.08915](https://arxiv.org/html/2602.08915v1)), so path and task type are usable risk signals.

A practical three-tier policy for this repo:

| Tier | Scope | Landing rule |
|---|---|---|
| T0 | Docs, tests or tools only | Auto-land, eligible for rollups |
| T1 | Code under a size threshold | Auto-land when the targeted spec is green and the review's Important count is zero; a missing severity line counts as pending, not pass |
| T2 | `.github/workflows/`, `tools/ci/`, `.claude/hooks/`, `sw.js`/`version.json` shell policy, physics or `js/game.js`, or large diffs | Needs a maintainer label |

The policy has to come from the base branch, so a PR cannot loosen the rules that judge it. `land.yml` already runs the deploy branch's own copy of itself (repo: `.github/workflows/land.yml`). Reviewer configuration needs the same property:

- Copilot code review reads its instructions, including `AGENTS.md` and `REVIEW.md`, from the PR's head branch ([GitHub Docs: Copilot code review](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review)), so an agent could edit its own reviewer's brief.
- Claude reads `REVIEW.md` from the base branch. It honors exclusions and nit caps only when that branch counts as "protected": a ruleset that restricts updates, or that requires PRs with at least one approval ([Claude Code Docs: customize](https://code.claude.com/docs/en/code-review-customize)). Whether "Deploy-reset" qualifies is unverified.

Pinning `gate` to the GitHub Actions app as its expected source means nobody else can post a passing `gate` ([GitHub Docs: about protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)). That matters more once `gate` becomes a train's release signal. Restricting PR creation to collaborators, a free setting since February 2026, closes the outside-contributor path into an auto-merging gate ([GitHub changelog](https://github.blog/changelog/2026-02-13-new-repository-settings-for-configuring-pull-request-access/)).

The human signal for T2 runs into identity. "Pull request authors cannot approve their own pull requests" ([GitHub Docs](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews)), so while agents open PRs as the maintainer, a required approval would deadlock. Under today's rules the workable signal is a maintainer-only label whose actor the gate checks in the timeline. With a rule change, agents could author as a GitHub App or as the single free machine account GitHub's terms allow ([GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service)). The maintainer would then be a CODEOWNER on T2 paths only ([GitHub Docs: code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)). The path-scoped "required reviewer" ruleset is no substitute: it needs teams, which user-owned repos lack ([GitHub Docs: available rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)).

Three more findings shape the reviewer's role:

- **The reviewer must be at least as strong as the writer.** When Codex reviewed Claude-written drafts, pass rates fell from 91.4% to 82.8% ([arXiv 2607.21656](https://arxiv.org/html/2607.21656v1)). Bot findings should go back to the authoring agent to weigh, not be applied as patches. Anthropic's own guidance is to keep "skip style" in reviewer prompts, because a reviewer asked to find problems "will always find *something*" ([Claude Code Docs: best practices](https://code.claude.com/docs/en/best-practices)).
- **Rollups are for testing, not review.** Review quality falls with diff size, so the review unit stays the single PR.
- **Low tiers need post-merge oversight.** Agent PRs draw verified follow-up fixes at **1.62× the odds** of human PRs ([arXiv 2609.26847](https://arxiv.org/abs/2609.26847)). Under high AI adoption, PRs merged with no review rose 31.3% ([Faros, 2026](https://www.faros.ai/blog/ai-code-quality-senior-engineer-review-burden)), which describes this repo today. The cheap answer is Ship/Show/Ask's "Show": merge first, review afterwards ([martinfowler.com: Ship/Show/Ask](https://martinfowler.com/articles/ship-show-ask.html)). Here that means a periodic digest of T0/T1 landings and follow-up fixes per lane, which works because merge commits revert cleanly.

The strongest counter-position is OpenAI's harness-engineering team. It runs "minimal blocking merge gates" because "corrections are cheap, and waiting is expensive", but it warns this "would be irresponsible in a low-throughput environment" ([OpenAI: harness engineering](https://openai.com/index/harness-engineering/)). DORA 2025 found AI raising throughput while "software delivery instability continues to rise" ([InfoQ](https://www.infoq.com/news/2025/09/dora-state-of-ai-in-dev-2025)). For a single maintainer shipping a phone game, the tiered gate is the middle path.

## Rule changes worth making: generated files yes, organization move no

| Rule change | What it unlocks | What it costs | Verdict |
|---|---|---|---|
| Generate runtime files at deploy (rule 11, "no build step") | Removes most generated-file conflicts and drift reds | Checkout needs `npm run gen`; deployed bytes ≠ committed bytes | Do it, or the order-independent hybrid |
| Separate agent identity + CODEOWNERS on T2 | Real human approval on the risky tail | Agent auth re-plumbing; one machine account or App | Do it if label-checking proves leaky |
| Train controller may cancel its own obsolete runs | Runner slots back after a batch fails | Lost logs from cancelled runs | Do it with move 7 |
| Hosted queue (Mergify OSS, Trunk free) | Batching and bisection without building them | A vendor App holds merge rights; free-plan coverage unverified | Trial only after checking the plan |
| Bot fast-forward landing | Tested SHA = landed SHA | Bot is the protection; Postgres; serial unless batched | Later, only if exact-SHA identity matters |
| Transfer to a free org | GitHub's native merge queue | See below | Don't |
| Squash/rebase, stacked PRs | Linear history; layered review | Breaks ancestry checks and issue closing; stacks lack auto-merge | Don't |

The hosted queues need verification before any trial:

- **Mergify** lists a $0 Open Source plan for public repositories ([GitHub Marketplace: Mergify](https://github.com/marketplace/mergify)). An October 2026 review reads Mergify's pricing table as leaving batching off that plan ([Pyor](https://pyor.review/blog/github-merge-queue-alternatives)), which would remove the reason to adopt it.
- **Trunk** is free for up to five committers, merge queue included ([Trunk pricing](https://trunk.io/pricing)). Nothing found says whether it installs on personal-account repos, or how it counts agent authors as committers.

Both support merge commits, and batching requires GitHub's "require branches to be up to date" setting to be off ([Mergify: batches](https://docs.mergify.com/merge-queue/batches/)).

Bot fast-forward landing gives the strongest guarantee, at the highest trust cost. gitea-mq's batch mode "fast-forwards the target branch itself to the tested SHA". Its App is a ruleset bypass actor and needs Administration write access ([gitea-mq](https://github.com/Mic92/gitea-mq)). GitHub marks indirectly merged PRs as merged "even if branch protection rules on that pull request were not satisfied" ([GitHub Docs: pull request merges](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/about-pull-request-merges)), so the bot itself becomes the protection.

The organization move is the usual first suggestion and the worst fit here. GitHub's merge queue is available on "any public repository owned by an organization" ([GitHub Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)). The request to extend it to personal accounts was still unanswered in October 2026 ([GitHub Community #51483](https://github.com/orgs/community/discussions/51483)). No plan matrix names merge queue explicitly, so Free-org support should be confirmed in the ruleset UI before anyone relies on it.

The costs stack up:

- **No CI saving.** The native queue runs one build per queued PR.
- **Half the concurrency.** A free organization gets **20 concurrent jobs, half of Pro's 40** ([GitHub Actions limits](https://docs.github.com/en/actions/reference/limits)). With a full tier near twenty slots, build concurrency would effectively be one, which is the 1.5/h serial ceiling, unless the org pays for Team or the `merge_group` tier is slimmed.
- **A new origin for players.** GitHub says that on transfer "we don't redirect GitHub Pages associated with the repository" ([GitHub Docs: transferring a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository)). The game would move from `brycejmurrin.github.io/f1-game` to `<org>.github.io/f1-game` ([GitHub Docs: what is GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)). Browsers keep localStorage, IndexedDB and the Cache API per origin ([MDN: storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)), so career saves and settings stay behind, and an iPhone home-screen install stays bound to the old URL. How such a PWA behaves after the move was not verified on a device. The game does ship a versioned career export and import that its header calls "the deliberate backup path for origin / app-id moves" (repo: `js/career/career-backup.js`). But every player would have to export before the move and import after it, and anyone who missed the notice would start over.
- **No redirect stub at the old name.** A repo with more than 100 clones or Actions uses in the week before transfer has its old name permanently retired ([GitHub Docs: transferring](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository)). Serving a redirect from the `brycejmurrin.github.io` user site is an untested workaround.
- **Re-plumbing.** GitHub Apps such as Claude's and Cursor's must be installed on the org ([GitHub Docs: installing apps](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party)). Fine-grained tokens like `LAND_TOKEN` are scoped to one resource owner and must be re-minted ([GitHub Docs: PATs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)). One vendor blog reports that OIDC subject claims for transferred repos changed format in July 2026 ([Hatboy Software](https://hatboysoftware.com/blog/what-breaks-when-you-move-a-github-repo/)).

A custom domain would make any future move invisible to players, but setting one up is itself a one-time origin change ([GitHub Docs: custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)).

Squash, rebase and stacks fail on this repo's specifics:

- **Squash and rebase.** Squash loses authorship and timing, and causes repeated conflicts on branches that keep going ([GitHub Docs: merge methods](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/about-merge-methods-on-github)). Its new SHAs break the "Live? = ancestor of `apex-sha`" check. Squash-combined originals show as Closed, because "the GitHub API does not allow anyone to mark a PR as merged" ([bors-ng #899](https://github.com/bors-ng/bors-ng/issues/899)). Force-pushes are also associated with lower merge odds for agent PRs ([arXiv 2602.19441](https://arxiv.org/abs/2602.19441)).
- **Graphite.** The one queue that demands squash or rebase also needs an org App and the Team plan ([Graphite: set up merge queue](https://www.graphite.com/docs/set-up-merge-queue.md)).
- **Stacked PRs.** GitHub's native stacks are in public preview. They require a linear history and "Auto-merge is not supported for stacked pull requests" ([GitHub Docs: merging stacked PRs](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/merging-stacked-pull-requests)). Stacks serve one author's dependent layers; independent agents on disjoint files would only multiply the PR count.

## Conclusion

The binding constraints on this pipeline are the arrival rate, runner concurrency and the train-level failure rate p, not the merge mechanism. That reorders the usual advice. The highest-leverage engineering is in the dispatcher (WIP and creation caps, green-only admission) and in flake and generator hygiene, which lower p. Merge-queue machinery only pays off once p is known to be low. So the next measurement matters more than the next tool: p and the per-run flake rate from recent gate and train outcomes, and actual peak slot use per full tier. Those numbers decide whether two lanes of four can carry 7 PRs an hour, or whether intake has to stay near 5.

The repo already owns the hardest part of a merge queue. It has a trusted gate, run from the deploy branch, that tests the real merge result cheaply. The path to a green branch at higher throughput is therefore to extend that gate into a rollup and then a release train, not to adopt a platform. The option most often proposed first, moving to an organization for GitHub's queue, is the one these constraints make worst: it costs players their origin and the fleet half its runners, and buys a queue that tests no more cheaply than today.
