# Gate commits once, route models cheaply, reap nightly

The fleet's three biggest avoidable costs come from defaults that nobody chose. The first is Opus spend that subagents inherit. The second is a commit gate built into a per-call hook. The third is cleanup that waits for a human to press "dispatch". Fix them in that order.

Claude Code's built-in Explore subagent runs on the parent session's model, and this repo defines no `Explore` override. Every exploration in an Opus session is therefore billed and quota-counted at Opus rates. A one-file `model: haiku` override is the cheapest quota relief available ([Claude Code subagents](https://code.claude.com/docs/en/sub-agents)).

The commit gate is the costliest hook. `bash-guard.sh` runs a 50–110 s test suite inside a PreToolUse hook with a 360 s timeout. That duplicates a host-neutral git pre-commit hook that already exists and already reuses a verdict keyed to the staged tree. The fix is to make git's hook the only owner of the suite and shrink the Claude guard to millisecond refusals. That is the "block at submit, never at write" pattern practitioners have converged on ([Shrivu Shankar](https://blog.sshh.io/p/how-i-use-every-claude-code-feature)).

Cleanup should split along a boundary the platform already enforces. Actions owns refs, caches and artifacts; the dispatcher and SessionStart own sessions and worktrees. Today 282 of 358 remote branches have no open PR, yet `prune-branches.yml` runs only on manual dispatch. The open-PR queue is a different story: it is young and fast-moving, so an idle-based stale bot would do nothing. Its real risks are superseded work and agent-written closing keywords.

Of the sixteen ranked moves below, eight need a rule change, mostly because hooks and settings need Bryce's explicit yes. Two more need a one-line note in WORKERS.md, because they automate or enforce something it already governs.

## One slow commit gate outweighs the other nineteen hooks

The platform contract sets the rules. A Claude Code hook blocks only by exiting 2. Any other exit code, a crash, invalid JSON or a timeout is a non-blocking error, and the action proceeds. Hooks for one event **run in parallel**, and one hook's `deny` does not stop a sibling's side effects. The default command timeout is **600 s**, and a timed-out PreToolUse hook "doesn't block the tool call" unless it opts into `onFailure: "block"`, which shipped in v2.1.295 ([hooks reference](https://code.claude.com/docs/en/hooks)).

This repo registers **20 hook handlers**: one SessionStart, eight PreToolUse, five PostToolUse, three UserPromptSubmit, two Stop and one SubagentStop. Seven of the eight PreToolUse guards fail closed. The exception is `launch-gate.py`, the hook that refuses `create_session` without a fresh quota receipt. It sets no `onFailure`, so a crash or a 5 s timeout lets a launch through with no receipt — exactly what the hook exists to prevent ([.claude/settings.json](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/.claude/settings.json)). Fixing it is a one-line change.

The commit gate is where the cost concentrates. On a `git commit`, `bash-guard.sh` runs the ratchet auto-raise and then `npm run test:guards` before git starts. Its own header records **~110 s for a code commit at loadavg 4–6 on 2026-10-26**, against a brief that cites ~50 s. It runs under a **360 s timeout** that also covers the guard's ordinary non-commit path on every Bash call ([bash-guard.sh](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/.claude/hooks/bash-guard.sh)).

The same suite already lives in `.githooks/pre-commit`, which every host activates through `npm install`. That hook exits early when `CLAUDECODE=1`, and it shares a verdict file (`artifacts/pre-commit-guards.ok`, keyed to the staged tree, valid 10 minutes) with the Claude guard ([.githooks/pre-commit](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/.githooks/pre-commit)). The repo has therefore half-built the pattern Shrivu Shankar describes. His commit guard only checks for a marker that the test script writes when tests pass, so the hook itself stays a fast file check. He deliberately avoids block-at-write hooks because "blocking an agent mid-plan confuses or even 'frustrates' it" ([blog.sshh.io](https://blog.sshh.io/p/how-i-use-every-claude-code-feature)).

The finished design has three parts. First, git's hook owns the suite for every host. Second, agents run `test:guards` as an explicit background step that writes the verdict, so a commit costs milliseconds when the verdict is fresh. Third, the Claude guard keeps only what git cannot enforce on itself: refusing `--no-verify`, which skips pre-commit hooks ([git-commit](https://git-scm.com/docs/git-commit)), and refusing `core.hooksPath` rewrites. The guard's timeout can then fall to 10–30 s, in line with the practitioner budget of under 200–500 ms per guard ([Blake Crosley](https://blakecrosley.com/blog/claude-code-hooks-tutorial)) and GitHub's advice to keep hooks under 5 s ([GitHub Docs](https://docs.github.com/en/copilot/concepts/agents/hooks)).

The refusal guards themselves should stay. They cover protected files, PID kills, force pushes, run cancels, and the merge and dispatch MCP calls, and these are the "rule with zero exceptions" cases Anthropic says belong in hooks rather than in CLAUDE.md ([best practices](https://code.claude.com/docs/en/best-practices)). Three hardening steps follow from the failure-mode evidence:

- **Move pattern-shaped bans into `permissions.deny`.** A deny rule "cannot crash" and holds in every permission mode ([DevelopersDigest](https://www.developersdigest.tech/blog/coding-agent-hooks-fail-open-vs-fail-closed-2026)). The hook then keeps only logic a rule cannot express.
- **Make every shell guard turn its own errors into exit 2** with `set -euo pipefail` and an `ERR` trap. DevelopersDigest showed that only this version blocks when the input is malformed JSON or `jq` is missing. Fixture-test each guard with four payloads: safe, blocked, malformed and missing dependency.
- **Use `if` filters only to skip slow paths, never as the policy.** They are best-effort: when Claude Code cannot parse a command, it runs the hook anyway ([hooks reference](https://code.claude.com/docs/en/hooks)). A fast unfiltered guard has to remain.

Shell-string matching is "the tripwire, not the wall" ([DevelopersDigest](https://www.developersdigest.tech/blog/coding-agent-hooks-fail-open-vs-fail-closed-2026)). The real walls here are the deploy-branch ruleset and `land.yml`.

The advisory hooks need a relevance test rather than a speed test. That set is `skill-hint.py`, `lsp-hint.py`, `ui-fixer-uncommitted.sh`, `memory-sync.sh` on every edit and every Stop, `stop-guard.sh`, and `context-cap.py` on every PostToolUse call. ClaudeFast spent 18 months iterating a skill-activation hook and ended with one question for every hook: **"can you name a decision this changed?"** They deleted a routing feature that "never once changed a routing decision". They moved to word-boundary matching, at most three suggestions, an advisory voice that shows the matched terms, and no repeats. They also found that on the Claude 5 generation, "an instruction that overrides judgment makes behaviour worse, not more reliable" ([ClaudeFast](https://claudefa.st/blog/tools/hooks/skill-activation-hook)).

`skill-hint.py` already scores matches and caps them at two. But its fixed sentence is the imperative pattern ClaudeFast found counterproductive: "a task that matches a skill starts with the Skill tool call for it, before Bash, Read or Grep" ([skill-hint.py](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/.claude/hooks/skill-hint.py)). Its own A/B mode against `off` is the only evidence that can settle whether it helps. No controlled study on current models exists, and Scott Spence's widely quoted activation rates came from Haiku 4.5 on synthetic prompts; he later warned they should not be treated as predictions ([Scott Spence](https://scottspence.com/posts/how-to-make-claude-code-skills-activate-reliably)). Whatever survives the test should be written "as factual statements rather than imperative system instructions" and kept well under the 10,000-character injection cap ([hooks reference](https://code.claude.com/docs/en/hooks)).

Portability across hosts sets a ceiling on what any hook can promise. Agent Plugins 1.0 standardizes skills and MCP but leaves hooks "client-specific" ([Visual Studio Magazine](https://visualstudiomagazine.com/articles/2026/08/06/vs-code-agent-plugins-go-cross-client-with-new-open-standard.aspx)). Each host weakens the guards in its own way:

| Host | How it weakens the guards |
|---|---|
| Codex | Parses `ask` but fails open on it. Does not hook hosted tools. Skips any edited hook until someone re-trusts its hash ([Codex hooks](https://developers.openai.com/codex/hooks)). |
| Cursor | Imported Claude hooks reportedly run with `failClosed: false` and see `tool_name: "Shell"`, so a guard that checks for `"Bash"` allows everything ([DevelopersDigest](https://www.developersdigest.tech/blog/coding-agent-hooks-fail-open-vs-fail-closed-2026)). |

The design consequence is that host-neutral enforcement — git hooks, GitHub rulesets and the `gate` check — carries the zero-exception rules, and each host's hooks act as early tripwires. A conformance fixture per host keeps the tripwires honest.

## Inherited Opus is the easiest spend to cut, ahead of the worker model

The current Claude family at list price, per million tokens (input / output / cache read):

| Model | Input | Output | Cache read |
|---|---|---|---|
| Opus 5.5 | $4 | $20 | $0.20 |
| Sonnet 5.5 | $2 | $10 | $0.10 |
| Haiku 5.5, prompt ≤100K tokens | $0.10 | $0.50 | $0.01 |
| Haiku 5.5, prompt >100K tokens | $0.50 | $2.50 | $0.05 |

([Pricing](https://platform.claude.com/docs/en/about-claude/pricing))

The built-in Explore and Plan subagents inherit the main model. A general-purpose subagent inherits it too unless `CLAUDE_CODE_SUBAGENT_MODEL` is set. A project agent named `Explore` overrides the built-in, "so define one with `model: haiku` to run exploration on a lower-cost model" ([Claude Code subagents](https://code.claude.com/docs/en/sub-agents)).

This repo's reporter agents are already tiered: `code-hunter` runs on Opus, the auditors and `ci-red-triage` on Sonnet, and `deploy-research`, `verify-agent` and `prior-art-scout` on Haiku. But there is no `Explore.md`. `worker` and `track-surveyor` use `model: inherit`, and no agent sets `effort:` ([.claude/agents](https://github.com/brycejmurrin/f1-game/tree/claude/f1-game-project-26h3ng/.claude/agents)).

Run the override at `effort: medium`, not low. At `low`, Haiku in long agent prompts "is more likely to skip a search, stop early, or skip a check" ([Effort docs](https://platform.claude.com/docs/en/build-with-claude/effort)). Expect a saving of about 4–8x rather than 40x, because exploration contexts cross Haiku's 100K price step quickly.

What the workers run is less settled than the brief assumes. Since 2026-10-27, `tools/ci/dispatch.json` has passed `"model": "claude-sonnet-5-5"` to every dispatcher launch ([dispatch.json](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/tools/ci/dispatch.json)). So either the all-Opus picture predates that change, or Opus spend now comes from other paths: hand-launched sessions, the orchestrator, and `inherit` subagents. Each session's configured and served model should be confirmed before policy is set on top of it.

The evidence on Sonnet versus Opus for implementation does not support assuming that Sonnet is cheaper per task:

- **Vals Terminal-Bench 4.0** (2026-10-26) scored the two at 64.1% and 65.2%. But Sonnet used **58.5M tokens per task against Opus's 28.3M** and cost more, **$16.51 against $13.20** ([Vals AI](https://www.vals.ai/benchmarks/terminal-bench-4)).
- **Artificial Analysis' coding-agent index** found the opposite regime. Claude Code with Sonnet 5.5 at xhigh scored 62.9 for $3.33 per task, against 66.0 for $13.04 with Opus at max ([Zest](https://meetzest.com/blog/best-model-for-coding)). That reading predates the 2026-10-07 cache-read price cut, which lowered Sonnet's agentic cost by about 20% ([Anthropic, Haiku 5.5](https://www.anthropic.com/claude-haiku-5-5)).
- **Zest's real-team data** put Opus 5.5 at **$19 per merged PR**. Matched by repo, engineer and week, "the model gap mostly disappears", while PRs over 1,000 lines drew 36 points more review flags than PRs under 300 lines ([Zest](https://meetzest.com/blog/best-model-for-coding)).

The right test is an A/B on cost per merged PR, not on per-token price.

The quota motive is real but uncertain. Session and weekly limits are "shared across all models", so a downgrade frees weekly allowance only to the extent that Sonnet usage counts for less. No source read publishes those weights. An Opus-specific limit, by contrast, can be sidestepped by switching model family ([Claude Code costs](https://code.claude.com/docs/en/costs)).

Effort is the cheaper lever. Anthropic says "tuning effort is often a better lever than switching models" ([Choosing a model](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model)). In Claude Code, Opus 5.5 defaults to `medium`, and "Opus 5.5 at `medium` matches or exceeds Opus 5 at `high`" ([model config](https://code.claude.com/docs/en/model-config)).

Higher effort pays off where hidden edge cases dominate. On Fable 5.1, Terminal-Bench 3.0 security tasks rose from 64% to 87% between low and max effort. Effort "does not fix when the model has the wrong approach", and the recommended loop is to implement at low effort and verify at high ([claude.dev](https://claude.dev/blog/spending-your-effort/)).

`max` can hurt. Sonnet 5.5 scored lower at max than at xhigh on FrontierCode because, at max, it more often ran Claude Code's code-review skill and fanned out into subagents, which led to timeouts or edits outside the task's scope ([Anthropic, Sonnet 5.5](https://www.anthropic.com/claude-sonnet-5-5)). At its lowest effort, Opus 5.5 still caught 72% of known bugs in Deloitte's code reviews ([Anthropic, Opus 5.5](https://www.anthropic.com/claude-opus-5-5)).

Two operational details matter. Setting `CLAUDE_CODE_EFFORT_LEVEL` fleet-wide silently overrides every agent's `effort:` frontmatter ([model config](https://code.claude.com/docs/en/model-config)), so per-role tuning belongs in frontmatter and settings. And unattended lanes should treat `max` and ultracode as opt-in per task.

Three kinds of extra machinery cost more than they return:

- **An Opus or Fable advisor.** Anthropic measured an Opus 5.5 executor at high effort with a Fable 5.1 advisor at **+1.7 points for about 2.1x the cost**, "about what more effort does".
- **Cheap-worker orchestration.** It saved money only for routine work with a long cost tail, or for work larger than one context window ([Optimizing for cost and intelligence](https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence)).
- **Agent teams.** They use about 7x the tokens of a standard session when teammates run in plan mode ([Claude Code costs](https://code.claude.com/docs/en/costs)).

On the Codex lanes, GPT-6.1 Sol is the cost outlier: 55.1% on Vals' Terminal-Bench 4.0 for **$1.72 per task**, against $13.20 for Opus 5.5 ([Vals AI](https://www.vals.ai/benchmarks/terminal-bench-4)). OpenAI positions Astra for the hardest reasoning and Luna for "focused tasks at scale" ([OpenAI GPT-6 guide](https://openai.com/index/practical-guide-building-gpt-6/)).

| Task | Model | Effort | Basis |
|---|---|---|---|
| Dispatcher / orchestrator loop | Opus 5.5 | medium | "start with Claude Opus 5.5 for most workloads" ([Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)) |
| Well-scoped Plan item | Sonnet 5.5 or Opus 5.5, decided by the per-PR A/B | medium | Sonnet is "strongest at well-scoped everyday tasks" ([Sonnet 5.5](https://www.anthropic.com/claude-sonnet-5-5)) |
| Ambiguous multi-file brownfield fix | Opus 5.5 | high | `high` for "fixing a bug in an existing codebase" ([model config](https://code.claude.com/docs/en/model-config)) |
| Review, verification, `code-hunter`, `finding-verifier` | Opus 5.5 (Sonnet for verifiers) | high, never max | edge-case-heavy work ([claude.dev](https://claude.dev/blog/spending-your-effort/)) |
| CI-red triage | Sonnet 5.5 digests the logs; Opus 5.5 finds the root cause | high | delegate log processing ([Claude Code costs](https://code.claude.com/docs/en/costs)) |
| Exploration, search, `Explore` | Haiku 5.5 | medium | built for "subagent tasks" ([Choosing a model](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model)) |
| Log and transcript summaries, `deploy-research` | Haiku 5.5 (Batch API at 50% off for bulk work) | low–medium | "summaries, compactions" ([Haiku 5.5](https://www.anthropic.com/claude-haiku-5-5)) |
| Renames, regeneration, precisely described edits | smallest adequate model | low | "small change like a rename" ([model config](https://code.claude.com/docs/en/model-config)) |
| Web research reports | Opus 5.5 | medium–high | 16 of 18 reports cleared Anthropic's no-fabrication bar ([Opus 5.5](https://www.anthropic.com/claude-opus-5-5)) |
| Hardest problems after Opus fails at xhigh | Fable 5.1 (consent prompt bills credits) | high | ([Choosing a model](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model)) |
| Codex lanes | GPT-6.1 Sol by default; Astra for the hardest work; Luna for bulk | medium | ([OpenAI GPT-6 guide](https://openai.com/index/practical-guide-building-gpt-6/)) |

## Cleanup belongs with whoever holds the permission

The platform has already drawn the line. Inside a session, the git proxy refuses ref deletion with a 403 ([prune-branches.yml](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/.github/workflows/prune-branches.yml)). The session proxy also refuses Actions REST paths and GraphQL (a 403 observed on [actions/cache/usage](https://api.github.com/repos/brycejmurrin/f1-game/actions/cache/usage)). Branch, cache and artifact deletion therefore has to run as Actions workflows. Only the session host can call `archive_session` or touch local worktrees, so those jobs belong to the dispatcher and SessionStart.

Each job should follow the shape Kubernetes' triage robot has run for years. Every job is one search query, one action and one explanatory comment, with a ceiling (`--ceiling=10` items per run), an opt-out label, and a report-only mode until `--confirm` is passed ([kubernetes/test-infra](https://github.com/kubernetes/test-infra/blob/master/config/jobs/kubernetes/sig-k8s-infra/trusted/sig-contribex-k8s-triage-robot.yaml)). GitHub's Agentic Workflows formalise the same idea for agent-created items. Each item carries an `expires` checkbox that a human can untick to keep it, and a generated maintenance workflow closes whatever has expired ([gh-aw Ephemerals](https://github.github.com/gh-aw/reference/ephemerals/)).

### Branches

GitHub's "Automatically delete head branches" is already on, and the only ruleset covers the deploy branch alone. The setting acts only "after pull requests are merged" ([GitHub Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-the-automatic-deletion-of-branches)), so the backlog is by construction closed-unmerged, never-PR'd and superseded work. On 2026-10-28 the remote held **358 branches, 282 of them without an open PR** (301 `cursor/*`, 17 `claude/*`, 13 `fleet-claims/*`) and **71 `archive/*` tags** ([branches API](https://api.github.com/repos/brycejmurrin/f1-game/branches)).

`prune-branches.yml` already does the hard part safely. It runs a dry run by default, archives each branch as a tag before deleting it, and never touches open-PR heads or the deploy branch. But it is `workflow_dispatch`-only, and 475 branches had piled up by 2026-10-01 ([prune-branches.yml](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/.github/workflows/prune-branches.yml)). Two changes would clear the backlog and keep it clear:

- **A nightly `schedule:`** that applies only the zero-loss verdicts (merged and absorbed) and reports the rest as a dry run.
- **A `pull_request: closed` job** that, when a `cursor/*` PR closes unmerged, pushes `archive/<branch>` and deletes the head. This catches the backlog at the moment it is created, without waiting for a sweep.

Before adding any ruleset that covers `cursor/*`, untick "Restrict deletions", which is selected by default on new rulesets ([available rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)). Left on, it would silently stop both auto-delete and the prune job. A separate tag ruleset should protect `archive/*` from rewrites.

Containers should also set `fetch.prune` ([git-fetch](https://git-scm.com/docs/git-fetch)). A clone counted 388 remote-tracking refs on 2026-10-27 against the 358 branches GitHub held a day later.

### PRs and issues

The PR queue is a flow, not a backlog. There were **76 open PRs** (26 drafts). The oldest was opened 2026-10-26, and none had been idle longer than **6.4 hours**. On 2026-10-27 alone, **78 PRs merged** and 4 closed unmerged ([pulls API](https://api.github.com/repos/brycejmurrin/f1-game/pulls?state=open)).

The dispatcher already acts as the idle clock. It re-owns any PR silent for 2 hours (6 for `lane:codex`) ([docs/WORKERS.md](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/docs/WORKERS.md)). `actions/stale` measures idleness from `updated_at`, which any comment or label change resets ([actions/stale](https://github.com/actions/stale)), and the dispatcher's own label writes do exactly that. A stale bot here would be redundant at best. At most it is worth keeping as a 14-day backstop, scoped to lane labels and run in report-only mode.

The live risk is superseded and duplicate work. Because the default branch is the deploy branch, `Closes #n` in an agent's PR body really does close issues on merge ([GitHub Docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)). Tian Pan documents an agent that inferred supersession from an old comment, wrote `Closes #1247`, and closed real work when its PR merged ([Tian Pan](https://tianpan.co/blog/2026-06-03-the-pull-request-your-coding-agent-opened-that-closed-a-real-one)). 2026 practice keeps duplicate detection advisory: the Prism action "never auto-closes" ([Prism](https://github.com/danhdox/prism)). Three changes fit:

- **A nightly report** that flags two open PRs carrying the same `Closes #n`, or overlapping paths.
- **A body linter** that allows closing keywords only for the lane's claimed issue.
- **Auto-close only when the older draft's diff is already absorbed into the base.** That is the same zero-loss test `prune-branches` already uses.

GitHub's 2026 per-user caps on open PRs apply only to users without write access ([GitHub Changelog](https://github.blog/changelog/2026-06-17-limit-open-pull-requests-for-users-without-write-access/)), so the fleet's throttle remains the dispatcher's own `maxLiveWorkers`.

Label hygiene ranks last. A labels-as-code check, modelled on gh-aw's `create_labels` operation, can flag labels missing from the documented set ([gh-aw](https://github.github.com/gh-aw/reference/ephemerals/)).

### Sessions

Nothing archives Claude cloud sessions automatically. Desktop's "Auto-archive after PR merge or close" explicitly excludes cloud sessions ([Claude Code Desktop](https://code.claude.com/docs/en/desktop)). Idle sessions cost nothing in VM terms, but their VMs are reclaimed and any background work is lost ([Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)).

The dispatcher's archive pass is therefore the only list cleanup. Today it archives a session 10 minutes after its PR merges or closes, and never touches untagged sessions, sessions without a claim comment, or sessions that are running ([WORKERS.md](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/docs/WORKERS.md)). Two extensions follow:

- **Archive sessions idle beyond N hours** whose branch is pushed and that own no live CI, plus children that never opened a PR.
- **Build the $15 hard-cap archive.** WORKERS.md says it "is NOT built" because `dispatch.mjs` reads no cost.

One user's reaper surfaced a trap for any such job: the API returns `cse_<suffix>` while local files store `session_<suffix>` for the same session, so ids must be matched on the suffix ([claude-code#93988](https://github.com/anthropics/claude-code/issues/93988)).

### Worktrees and CI storage

Worktrees need a janitor of their own. Claude Code's sweep removes only clean, pushed subagent and background worktrees older than `cleanupPeriodDays`, and it never cleans `-p` worktrees ([Claude Code worktrees](https://code.claude.com/docs/en/worktrees)). Separately, the harness writes `.claude/settings.local.json` into each worktree, which marks the worktree dirty so the sweep skips it ([claude-code#84027](https://github.com/anthropics/claude-code/issues/84027)).

The janitor step runs `git worktree list --porcelain`. For each worktree that is clean (ignoring that file) and whose branch is pushed, it unlocks and removes the worktree, then runs `git worktree prune -v`. It never forces removal of a worktree with unpushed commits ([git-worktree](https://git-scm.com/docs/git-worktree)).

On Actions, per-artifact `retention-days` are already set between 1 and 30 days across the workflows, and storage on a public repo is free ([Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)). The remaining gaps are two:

- **PR-scoped caches.** They thrash the 10 GB per-repo cap. GitHub's documented fix is a `pull_request: closed` job that runs `gh cache delete` on the PR's caches ([Managing caches](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manage-caches)).
- **Run history.** Since 2026-10-01, the retention setting also expires workflow runs, checks and statuses ([Actions settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)). `flake-tally`, `spec-timings` and prune-branches' last-CI column must tolerate runs that disappear after that window.

## Sixteen moves ranked, eight of them rule changes

Each move below is ranked by impact relative to effort. Impact is how many sessions or events it touches, times how often, times the cost avoided. "Rule change" means one of three things:

- **Hooks or settings**, which `.claude/rules/claude-config.md` says "need Bryce's explicit yes" ([claude-config.md](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/.claude/rules/claude-config.md)).
- **AGENTS.md or WORKERS.md wording.**
- **A repo admin setting.**

Bryce treats the rules as drafts, so the rule-changing items can go to him as one bundled PR for a single yes.

| # | Move | Area | Impact | Effort | Rule change? |
|---|---|---|---|---|---|
| 1 | Add `.claude/agents/Explore.md` with `model: haiku`, `effort: medium` (Sonnet if Haiku's recall disappoints) | Models | High | Trivial | No (agent file) |
| 2 | Confirm each session's served model, then A/B Sonnet 5.5 against Opus 5.5 workers on cost per merged PR | Models | High | Medium | No for the test; WORKERS.md if the winner becomes policy |
| 3 | Make `.githooks/pre-commit` the only owner of `test:guards` for every host. Run the suite as a background step that writes the existing verdict. Shrink `bash-guard.sh` to fast refusals, including `--no-verify` and `core.hooksPath`, with a ≤30 s timeout | Hooks | High | Low–medium | Yes: hooks and settings, plus AGENTS.md rule 12 and §Hooks |
| 4 | Extend `ci-cancel-on-close.yml`: when a `cursor/*` PR closes unmerged, push an archive tag and delete the head; delete the PR's caches | Cleanup | High | Low | No |
| 5 | Give `prune-branches.yml` a nightly schedule for zero-loss verdicts, with the rest as a dry-run summary | Cleanup | High | Low | Light: a WORKERS.md note |
| 6 | Effort policy: medium to build, high to verify, review and triage, never max or ultracode unattended. Set `effort:` in frontmatter; never set the env var fleet-wide | Models | Medium–high | Low | Yes: one line in the WORKERS.md brief |
| 7 | Add `onFailure: block` to `launch-gate.py`, an ERR-trap-to-exit-2 in every guard, and four-payload fixture tests | Hooks | Medium | Low | Yes: hooks and settings |
| 8 | Dispatcher archives idle, pushed sessions and sessions with no PR; build the cost hard-cap archive; match ids by suffix | Cleanup | Medium | Medium | Yes: WORKERS.md dispatcher rule 4 |
| 9 | Worktree janitor and `fetch.prune` in SessionStart or the dispatcher cycle | Cleanup | Medium | Low–medium | Yes: a hook (`session-start.sh`) |
| 10 | Audit the advisory hooks with "name a decision it changed". Rewrite `skill-hint` as advisory with matched terms and prove it against `off`; review context-cap's every-call PostToolUse, `lsp-hint`, `ui-fixer-uncommitted` and `memory-sync` | Hooks | Medium | Medium | Yes: hooks |
| 11 | Supersession report, a `Closes #n` linter, and auto-close only for absorbed drafts | Cleanup | Medium | Medium | Light: enforces WORKERS.md §2 |
| 12 | Cross-host conformance fixtures covering the `Shell`/`Bash` names, `ask` failing open and hash re-trust | Hooks | Medium | Medium | No |
| 13 | Move pattern-shaped bans into `permissions.deny`; add `if` filters only to skip slow paths | Hooks | Low–medium | Low | Yes: settings |
| 14 | Codex lanes: GPT-6.1 Sol by default, Astra for the hardest work, Luna for bulk | Models | Medium (that lane only) | Low | No (Bryce's tool) |
| 15 | Protect `archive/*` with a tag ruleset; set Actions retention deliberately; make run-reading tools tolerate expiry | Cleanup | Low | Low | Yes: repo admin |
| 16 | Do not build an advisor pair, a cheap-worker cascade, agent teams or an idle-based PR stale bot | All | Avoids waste | None | No |

Sequencing follows from the table:

- **Ship first:** items 1, 4 and 5. They need no rule change and remove the largest recurring waste.
- **Send as one rules PR:** items 3, 6, 7, 9, 10 and 13, which all touch hooks or settings.
- **Start now, decide later:** item 2's A/B runs underneath the rest, because its answer decides whether the worker model or worker effort should move next.

## Conclusion

The common thread is that the fleet's waste sits in defaults: an `inherit` model, a 600 s fail-open timeout, a workflow that waits for dispatch, a stale clock that the dispatcher's own label writes keep resetting. Each one is invisible until it is multiplied by dozens of sessions. Auditing defaults rather than decisions is therefore the recurring job.

Putting enforcement in host-neutral layers — git's own hooks, GitHub rulesets and the `gate` check — does more than close the cross-host fail-open gaps. It also makes the rulebook cheaper to change. A rule with one executable home can be rewritten in one PR without re-proving it on Claude, Codex and Cursor separately. That matters most for a maintainer who has said the rules are drafts.

At 78 merges a day, cleanup should fire on events (a close, a merge, a session ending), with nightly sweeps only as a backstop. Two questions remain open:

- **Quota weights.** How Sonnet and Haiku usage counts against the shared weekly limit is unpublished, and it decides how much the model moves relieve `allowed_warning`.
- **Skill-hint's effect.** Whether the hook changes routing for the better is unknown until its own A/B against `off` runs.
