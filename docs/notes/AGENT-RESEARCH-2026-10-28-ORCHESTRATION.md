<!-- Research subagent report (2026-10-28), copied verbatim from scratch/research/orchestration.md. Spot-checked claims are listed in docs/notes/SKILL-REVIEW-2026-10-28.md; everything else is unverified. -->
# Orchestrating many AI coding agents: research vs Apex 26's design (read 2026-10-28)

Read-only research. Sources were fetched this session (TinyFish fetch/search, Context7 `/websites/code_claude`, arXiv
HTML). Quotes are copied from the fetched text. The repo files compared at the end are `docs/WORKERS.md`,
`tools/ci/dispatch.mjs` + `dispatch.json`, `.claude/agents/worker.md`, `.claude/skills/{steward,handoff}/SKILL.md`,
`docs/plans/2026-10-27-orchestration-redesign.md`, `tools/ci/ready-gate.mjs`, `.github/ISSUE_TEMPLATE/task.yml`.

## 0. The cross-source consensus in eight lines

1. Multi-agent setups buy capacity mostly by spending more tokens (about 15x a chat). They pay off on parallel, read-heavy
   work and cost you on sequential, tightly coupled work, which describes most coding.
2. Writes should stay single-threaded per unit of code. Parallel writers need disjoint files or separate checkouts plus a
   merge gate (Cognition 2026, Claude Code agent teams, Cursor).
3. Hierarchy beats a flat swarm for many agents: a planner or dispatcher, workers that do not coordinate, and a judge
   or gate. Flat self-claiming with locks fell apart (Cursor).
4. A central verification point limits how far errors spread: 4.4x for centralized setups vs 17.2x for independent ones
   (Google). Verification failures are about a quarter of MAS failures (MAST).
5. A reviewer with a fresh context and no knowledge of how the code was written is the most reliable add-on. Tune it to
   be skeptical, and tell it to skip style.
6. Briefs need four parts: an objective, an output format, tool/source guidance and boundaries, plus explicit
   effort-scaling rules.
7. Hand off state through durable artifacts: progress files, feature lists in JSON, git history, PR bodies. Avoid long
   message relays (the "game of telephone").
8. Caps and stop conditions belong to the harness (max turns, budget, Stop hooks, a loop's max_iterations), not to
   prompt text. Every harness component encodes an assumption about the model, so re-test each one as models improve.

## 1. Methods

### 1.1 Single agent first (the baseline every method must beat)
- **What it is:** one agent loop with a continuous context, plus compaction and notes.
- **When it wins:** sequential tasks with many dependencies. Google measured every multi-agent variant worse on sequential
  planning: "every multi-agent variant we tested degraded performance by 39-70%". The arXiv abstract gives a range from
  "+80.8% on decomposable financial reasoning to -70.0% on sequential planning"
  (https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/ ,
  https://arxiv.org/abs/2512.08296). Tool-heavy tasks (16+ tools, i.e. coding agents) pay a disproportionate coordination tax.
- **Quote:** "We recommend finding the simplest solution possible, and only increasing complexity when needed."
  (https://www.anthropic.com/engineering/building-effective-agents)
- **2026 update:** Claude Code's best-practices page says "Running out of context is rarely the problem anymore" and
  "Handing the same task to a subagent doesn't make the answer any better. A fresh reviewer does help"
  (https://code.claude.com/docs/en/best-practices).

### 1.2 Orchestrator–workers (lead agent + parallel subagents)
- **What it is:** a lead agent breaks the task down, spawns 3–5 workers in parallel, then synthesizes their output.
- **Measured:** Opus lead + Sonnet subagents beat single-agent Opus by 90.2% on Anthropic's research eval. Token use alone
  explains 80% of the variance. Multi-agent runs use about 15x the tokens of chat. Parallel spawning cut research time
  "by up to 90%".
- **When it loses:** "most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet
  great at coordinating and delegating to other agents in real time".
- **Failure modes:** duplicate work and gaps when briefs are vague; the "game of telephone" through the lead; synchronous
  barriers ("the entire system can be blocked while waiting for a single subagent"); over-spending on simple queries.
- **Quote:** "Each subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task
  boundaries." (https://www.anthropic.com/engineering/multi-agent-research-system)

### 1.3 Subagents vs forks vs separate sessions vs agent teams (Claude Code, current docs)
- **Subagent:** its own context window and tools, and it returns a summary. The docs say use one when "The task produces
  verbose output", for tool restrictions, or when "The work is self-contained and can return a summary". Keep work in the
  main conversation when "Multiple phases share significant context" or "Latency matters. A subagent that isn't a fork
  starts fresh". Nesting goes up to 3 levels below the main conversation; `maxTurns` returns output marked partial;
  `isolation: worktree` is enforced by a git/cwd guard (https://code.claude.com/docs/en/sub-agents).
- **Fork:** inherits the conversation and system prompt, skips the subagent tool filters, and always runs on the
  parent's model. It is the cheap way to pass full context (Cognition's "80/20 solution is to just share a fork of the
  full context").
- **Separate sessions / background agents** (`claude agents`, `claude -w`, cloud sessions, cross-session messaging): use
  them "For work that needs to keep running in parallel or won't fit in one context window" (sub-agents doc).
- **Agent teams** (experimental, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`): a shared task list with file-locked claiming,
  direct peer messages, and the `TeammateIdle` / `TaskCreated` / `TaskCompleted` hooks (exit 2 blocks). Its own docs warn
  against it "For sequential tasks, same-file edits, or work with many dependencies". Recommended size: "Start with 3-5
  teammates"; "Three focused teammates often outperform five scattered ones"; "5-6 tasks per teammate"; "Two teammates
  editing the same file leads to overwrites. Break the work so each teammate owns a different set of files"; "Letting a
  team run unattended for too long increases the risk of wasted effort" (https://code.claude.com/docs/en/agent-teams).
  Teams do not form under `-p` or the Agent SDK.

### 1.4 Dispatcher + parallel cloud sessions (one task → one sandbox → one PR)
- **Products:** Codex Cloud ("Each task has its own workspace and can keep working while your computer is asleep",
  https://developers.openai.com/codex/cloud). Copilot cloud agent ("can only work on one branch at a time and can open
  one pull request per task"; "maximum execution time of 59 minutes ... Break complex tasks into smaller, focused tasks",
  https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent). Claude Code `/batch` "splits the work
  into 5 to 30 units ... runs each unit in its own worktree and opens a PR for it" (best-practices).
- **When it wins:** independent, well-specified tickets. The PR is both the isolation unit and the review unit.
- **Failure modes:** the bottleneck moves to review and verification. arXiv 2609.04681 calls this the "Verification Tax"
  and describes gains that "attenuate sharply between writing code and shipping reliable software". Other failure modes
  are an under-specified issue becoming a wrong PR, and parallel PRs conflicting at merge time.

### 1.5 Planners / workers / judge at scale (Cursor, hundreds of agents)
- **Measured:** about 1M LoC browser in about a week, and a Solid→React migration of +266K/-193K over 3 weeks.
- **Failure of the flat design:** shared-file locks: "Twenty agents would slow down to the effective throughput of two or
  three". Optimistic concurrency was more robust, but "With no hierarchy, agents became risk-averse".
- **What worked:** "Workers ... don't coordinate with other workers ... At the end of each cycle, a judge agent determined
  whether to continue, then the next iteration would start fresh." Removing complexity helped: "an integrator role ...
  created more bottlenecks than it solved". "The harness and models matter, but the prompts matter more."
  Remaining problems: "Agents occasionally run for far too long. We still need periodic fresh starts"
  (https://cursor.com/blog/scaling-agents).

### 1.6 Git-worktree isolation
- **What it is:** one checkout per agent. Claude Code `claude -w`, subagent `isolation: worktree`, `.worktreeinclude`,
  `worktree.symlinkDirectories`. Cursor `.cursor/worktrees.json` setup scripts and `/best-of-n` (the same task across
  models, one worktree each), capped at 25 worktrees per machine by default
  (https://cursor.com/docs/configuration/worktrees).
- **Failure modes:** a fresh tree has no deps or `.env`. Cursor warns against symlinking deps. Worktrees get left behind.
  Worktrees only delay conflicts until the merge; they do not prevent them.

### 1.7 Hand-off and state through files, issues and PRs
- **Anthropic long-running harness:** an initializer writes `init.sh`, `claude-progress.txt`, a JSON feature list of 200+
  items all set to `passes:false`, and a first commit. Each later session reads the progress file and git log, runs a
  smoke test, does ONE feature, then commits and updates progress. JSON was chosen because "the model is less likely to
  inappropriately change or overwrite JSON files compared to Markdown files". Two failure modes are named: one-shotting
  the job, and declaring victory early ("a later agent instance would look around, see that progress had been made, and
  declare the job done") (https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents).
- **Harness v2 (Mar 2026):** "Communication was handled via files: one agent would write a file, another agent would read
  it and respond" (https://www.anthropic.com/engineering/harness-design-long-running-apps).
- **Research system:** "Subagents call tools to store their work in external systems, then pass lightweight references
  back to the coordinator."
- **Context engineering:** subagents return "a condensed, distilled summary of its work (often 1,000-2,000 tokens)"
  (https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).

### 1.8 Lane claiming
- **Approaches:** a file lock in agent teams ("Task claiming uses file locking to prevent race conditions"); optimistic
  concurrency in Cursor; a hierarchical assignment by a planner (Cursor's winner).
- **Lesson:** self-claiming works for small teams with a harness-enforced lock. At scale, assignment by a planner beats
  free-for-all claiming.

### 1.9 Cost and context caps
- **Harness-enforced caps:** `--max-turns`, `--max-budget-usd` with `-p`, subagent `maxTurns`, `CLAUDE_CODE_SUBAGENT_MODEL`
  (e.g. Haiku for simple jobs). The best-practices table lists "How much it spends" under deterministic controls:
  "`--max-turns` or `--max-budget-usd` with `-p`, a spend limit you've set".
- **Context resets vs compaction:** "a reset provides a clean slate, at the cost of the handoff artifact having enough
  state". Opus 4.5 "largely removed" context anxiety, so v2 dropped resets.
- **Cost numbers:** harness v1 ran 6 h for $200 vs a 20-min $9 solo run; v2 ran about 4 h for $124
  (harness-design-long-running-apps).

### 1.10 Evaluator / verifier agents
- **Anthropic, harness v2:** "agents tend to respond by confidently praising the work"; "tuning a standalone evaluator to
  be skeptical turns out to be far more tractable than making a generator critical of its own work"; "Out of the box,
  Claude is a poor QA agent ... talk itself into deciding they weren't a big deal and approve the work anyway". Sprint
  contracts (with hard per-criterion thresholds) were negotiated before coding. Most important: "the evaluator is not a
  fixed yes-or-no decision. It is worth the cost when the task sits beyond what the current model does reliably solo."
- **Cognition (Apr 2026):** Devin Review "catches an average of 2 bugs per PR, of which roughly 58% are severe", and works
  best "when the coding and review agents do not share any context beforehand". The coder must filter findings against
  the user's intent "to prevent looping, disobeying the user, doing work that is out of scope"
  (https://cognition.com/blog/multi-agents-working).
- **Claude Code best practices:** "A reviewer that's asked to find problems will always find *something*. If you fix every
  finding, you end up with extra abstraction layers". Use a `tools: Read, Grep, Glob` reviewer, where the restriction is
  "enforced by Claude Code rather than requested in a prompt".
- **MAST:** adding a high-level objective verification step to ChatDev gave "+15.6% improvement in task success".

### 1.11 Stop conditions
- MAST failure modes: FM-1.5 "unaware of stopping conditions" (12.4%), FM-3.1 premature termination (6.2%), FM-1.3 step
  repetition (15.7%) (https://arxiv.org/html/2503.13657v3).
- Harness mechanisms: `/goal <condition>`, checked "by a separate model ... after every turn", and a `Stop` hook where exit
  2 "sends Claude back to work" (best-practices). ADK `LoopAgent`: "the `LoopAgent` itself does *not* inherently decide
  when to stop looping. You *must* implement a termination mechanism" (max_iterations or a critic's escalate)
  (https://google.github.io/adk-docs/agents/workflow-agents/loop-agents/). Cursor uses a judge per cycle.
- Anti-pattern: "Tell Claude to keep going, loop until done" prompts "are more likely to cause over-work than fix a stall".

### 1.12 Human-in-the-loop gates
- "Agents can then pause for human feedback at checkpoints or when encountering blockers" (building-effective-agents).
- Agent-teams plan approval is auto-approved unless the lead or human intervenes. Teammate messages "can't approve a
  permission prompt or supply consent on your behalf".
- Copilot: the ruleset or branch protection is the gate, and "Logs do not replace your own review and testing".
- Cognition's direction: "a coordinated system that scales human taste", not a swarm.

### 1.13 Handoffs vs agents-as-tools; supervisor vs swarm
- **OpenAI Agents SDK:** with agents-as-tools, "a manager agent keeps control"; with handoffs, "that specialist becomes the
  active agent". Code orchestration covers chaining, parallel `asyncio.gather`, and an evaluator `while` loop that stops
  "when the evaluator says the output passes" (https://openai.github.io/openai-agents-python/multi_agent/). Handoffs are
  `transfer_to_<agent>` tools with an `input_filter` for history.
- **LangGraph benchmark (Jun 2025):** swarm slightly beat supervisor because of supervisor "translation". Supervisor
  gained "nearly 50%" after removing handoff messages from sub-agent context and adding `forward_message`
  (https://blog.langchain.com/benchmarking-multi-agent-architectures/).

## 2. Failure taxonomies

- **MAST** (1600+ traces, 7 frameworks, κ = 0.88; failure rates 41%–86.7%): FC1 system design (FM-1.1 disobey task spec
  11.8%, FM-1.3 step repetition 15.7%, FM-1.5 unaware of stop 12.4%); FC2 inter-agent misalignment (FM-2.2 proceed on
  wrong assumptions instead of asking 6.8%, FM-2.6 reasoning–action mismatch 13.2%); FC3 verification (FM-3.1 premature
  termination 6.2%, FM-3.2 no/incomplete verification 8.2%, FM-3.3 incorrect verification 9.1%).
- **Google scaling** (180–260 configs): error amplification is 17.2x for independent setups vs 4.4x for centralized ones;
  an architecture predictor picked the right one for 87% of held-out configs.
- **Cognition, manager→children:** "Managers ... default to being overly prescriptive ... Agents assume they share state
  with their children when they don't. Cross-agent communication ... doesn't happen by default."
- **arXiv 2610.17418 (GitHub-derived failures):** "concentrate on execution-stage, actuation-related, tool, API, and
  infrastructure failures", so reliability is "a systems problem rather than only a model-output problem".

## 3. Brief design for workers (synthesis)

| element | source rule | concrete form |
|---|---|---|
| Objective | Anthropic research §2 | one sentence, plus the user's words |
| Done-when / output format | Anthropic research; sprint contract (harness v2); `/goal` | an observable check plus the exact report shape |
| Tools and sources | Anthropic research | named skill, verify command, which docs to read |
| Boundaries | Anthropic; agent-teams "own a different set of files" | OWNED / FORBIDDEN paths and peers' areas |
| Effort scaling | Anthropic "1 agent 3-10 calls ... >10 subagents" | an effort tier and model per task class |
| Context, not orders | Cognition: managers "overly prescriptive"; harness v2 planner stays high-level | state the goal and constraints; leave the implementation to the worker |
| Decisions already taken | Cognition principle 2 ("actions carry implicit decisions") | list the decisions the worker must not re-open |

## 4. Verification agents (synthesis)

- Separate the generator from the judge, and give the judge a clean context and read-only tools.
- Grade against explicit criteria with hard thresholds.
- Calibrate the judge by reading its logs against a human's judgement.
- Tell it to skip style.
- Have the generator filter findings against intent.
- Spend on a judge only where the task is beyond what the model does reliably solo.
- A deterministic check (tests, CI) is the first judge. The LLM judge covers what tests cannot see.

## 5. Shared state vs messages

- **Shared durable state wins** for hand-off and for async, cross-host and cross-vendor work: files, a JSON feature list,
  git, PR bodies (Anthropic harnesses, Cursor planners pushing to one branch, Copilot PR-per-task).
- **Messages win** only for live steering inside a short-lived team (agent teams, cross-session messaging).
- **Messages fail** as a store: no replay, translation loss (LangGraph "telephone"), relays.
- **Locks on shared files fail at scale** (Cursor). Prefer an ordered append-only record (comments) or optimistic writes.

## 6. Apex 26 vs the research

**Matches (keep):**
- GitHub as the only store, comments as the only message, the PR body as the hand-off. This matches §1.7 and §5.
  The redesign's own numbers motivate it: the bus had a 12% reply rate and orchestration was about 40% of spend
  (plan §1).
- No live coordinator; a stateless hourly dispatcher. This is Cursor's "start fresh" per cycle and avoids the 42-min
  orchestrator churn.
- One task → one session → one branch → one PR, with no worker-to-worker coordination. This is Cursor's worker role
  and the Copilot/Codex shape.
- `land.yml` + `merge-gate.mjs` + a ruleset that binds admins: a deterministic, central gate. This is the 4.4x-vs-17.2x
  argument for centralized verification.
- `ready-gate.mjs` refuses an open Plan checklist. This is the JSON-feature-list idea (a structured definition of done)
  and stops premature "done" (MAST FM-3.1).
- In-session `worker` subagents use `isolation: worktree`, `maxTurns: 120`, a fixed report shape and OWNED/FORBIDDEN
  paths in the brief. This is §1.3 / §3.
- Browser runs stay out of subagents, and CI is the verifier for lanes (redesign principle 6).
- Claims by an ordered comment (oldest wins) rather than a lock. This avoids Cursor's lock pathology.

**Departures (gaps):**
- D1. Cloud-worker briefs (`dispatch.mjs` `issuePrompt`, ~L284) carry `excerpt(issue.body)` = the first 6 non-empty lines
  at 160 chars. With `task.yml`'s form (Goal / Done when / Area / Context) a two-line Goal pushes "Done when" out of the
  brief. The brief has no output format beyond `land`, no OWNED paths and no effort tier. Two-thirds of its lines are
  protocol (labels, chat, subscribe) rather than task. This misses the four elements in §3.
- D2. No independent reviewer before `land`. The gate checks CI, Plan, gen and ratchets. Nothing gives a fresh-context
  read of the diff against the issue's Done-when, and that is the cheapest add-on with measured value (§1.10).
  `finding-verifier` exists, but only for verifying findings.
- D3. No cross-PR collision check at launch. AGENTS.md says "a path in an OPEN PR's diff belongs to that PR". The
  dispatcher can launch up to 8 Claude workers whose issues touch the same files, and nothing compares areas. This
  ignores agent-teams' "own a different set of files" rule and Cognition's implicit-decision conflicts.
- D4. Caps are prompt text. "STOP AT: 300k" and "$10 soft" sit in the brief, and "The $15 hard-cap archive is NOT built
  (`dispatch.mjs` reads no cost)" (WORKERS §6). The plan's own data shows "83 % of sessions ended above their cap".
  The research says caps belong to the harness (§1.9).
- D5. One model for every task (`dispatch.json` `"model": "claude-sonnet-5-5"`) and no effort tier. This misses
  Anthropic's effort-scaling rules, Cursor's "model best suited for each role" and Cognition's smart-friend routing.
- D6. The Hand-off block (branch/head/owner/lane/verified/not-run/next) has no field for decisions taken. A `CONTINUE PR`
  takeover "reads nothing else" (WORKERS), so the predecessor's implicit choices (Cognition principle 2) are lost unless
  they happen to be in the Plan.
- D7. Doc drift: WORKERS.md §The dispatcher rule 1 says "The script reads one page of 100 open issues (a known gap)",
  but `readState` already pages with `getAll(api, "issues?state=open")` (dispatch.mjs ~L469–483, "review H3").
- D8. The dispatcher's hourly cadence means a merged PR waits up to 1 h before the next launch. Cursor: "Planners should
  wake up when their tasks complete". This is low priority, because the queue is usually full.

## 7. Proposals (ranked; none applied)

1. **Structured brief from the issue form** — `tools/ci/dispatch.mjs` `issuePrompt`/`excerpt` (~L270–290). Parse the
   `### Goal`, `### Done when`, `### Area / skill` sections of `.github/ISSUE_TEMPLATE/task.yml` verbatim, with no line
   cap on those three. Add `Read the whole issue #n first.` Add an `Report:` line naming the PR Plan + Verified/Not run
   as the output, and an `Effort:` line (see 5). Move the protocol lines to one `Contract: docs/WORKERS.md` line plus
   the two lines that hooks cannot enforce (NOBODY, SUBSCRIBE). Test it in `tests/unit/` with a two-paragraph Goal
   fixture that today loses Done-when. Fixes D1; MAST FM-1.1 / FM-2.2.
2. **Fresh-context review step before `land`** — `docs/WORKERS.md` §3/§5, `.github/pull_request_template.md` Plan
   (`- [ ] review: …`), optionally a `ready-gate.mjs` row that requires a `review:` Plan item ticked with a verdict.
   Spawn a read-only reviewer subagent (`tools: Read, Grep, Glob`; reuse `finding-verifier` or add `.claude/agents/
   pr-reviewer.md`) on `git diff origin/<deploy>...HEAD` plus the issue's Done-when. Have it report correctness only
   ("skip style"), and have the worker accept or reject each finding in the PR. Scale it: skip for docs-only diffs.
   Evidence: Devin Review 2 bugs/PR, 58% severe; MAST +15.6%. Fixes D2.
3. **Launch-time collision guard** — `dispatch.mjs` `planDispatch` rule 1. Skip, with a Board skip line, any `ready`
   issue whose `area:*` label or `Area` path matches an open PR's changed files. This costs one `pulls/<n>/files` GET per
   open PR, cached per run. Add a `collision` reason to `skipped`. Fixes D3.
4. **Make the cost/size cap mechanical, or delete the claim** — check whether `get_session` exposes usage or turn counts
   (the `read_documentation` topic `session.resources`). If it does, add an `ARCHIVE_SESSION` (after `needs-owner`) for a
   worker over `workerCostCapUsd * 1.5` in `planDispatch` rule 4. If it does not, delete the "$10 soft" and "$15 hard"
   prose from WORKERS.md §6 and the brief, and keep only what a hook (`context-cap.py`) enforces. Fixes D4.
5. **Per-class model and effort map** — `tools/ci/dispatch.json`: `"modelByLabel": {"epic": "<opus>",
   "area:physics": "<opus>", "docs": "<sonnet>"}`, plus `"effortByLabel"`. `launchSpec` picks the first match. The brief
   states the tier as Anthropic-style scaling rules ("one spec, ≤ N files" vs "plan first, then implement"). Record the
   result per merged PR on the Board so the choice is measured, not assumed. Fixes D5.
6. **`decisions:` line in the Hand-off block** — `docs/WORKERS.md` §The Hand-off block, the PR template fence and
   `parseHandoff` in dispatch.mjs (already passes up to 8 keys into `continuePrompt`). The line holds one short list of
   choices a successor must not re-open (API shape, chosen approach, rejected alternatives). Fixes D6 and Cognition's
   "agents assume they share state".
7. **Fix the doc drift** — `docs/WORKERS.md` §The dispatcher rule 1: drop "reads one page of 100 open issues (a known
   gap)", since `getAll` paginates. Fixes D7. Docs-only fast path.
8. **Harness-assumption review** — a dated `docs/notes/` entry that lists each orchestration component (nudges at 20 min,
   STOP AT 300k, staleHours 2, archiveAfterMinutes 10, landQueueMax 15) with the model limitation it assumes and a
   metric that would retire it. Anthropic: "every component in a harness encodes an assumption about what the model can't
   do ... worth stress testing".
9. **Event-driven dispatch (low)** — on a PR merge, `land.yml` could post a comment on the Dispatch issue. The Claude
   scheduled task cannot be fired from Actions, so this only helps if a GitHub-side trigger can reach `fire_trigger`;
   verify that before building anything. Fixes D8.

Not proposed: agent teams for cloud lanes (experimental, interactive-only, same-session); a message bus (retired for
measured reasons); integrator or merge-desk agents (Cursor removed theirs; GitHub lands PRs here).
