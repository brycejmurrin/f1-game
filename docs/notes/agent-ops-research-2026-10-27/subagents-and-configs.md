# Delegate sparingly, verify fresh, enforce portably

A subagent earns its cost in four situations only: parallel independent reading, keeping noisy output out of the parent, a reviewer that never saw the author's reasoning, and running with fewer tools or a cheaper model. A good one is an enforced contract, not a persona. Its description both routes the task and tells the parent what to put in the brief; it has one job; Claude Code enforces its tool allowlist; it has a fixed return format with a stop condition; and its model and effort fit the job. The 2026 evidence on teams is blunt. On Opus 5.5, Vals measured agent teams at **2.2–5.1x the cost of a single agent with no significant gain**, and every study that found gains found them on decomposable work with sparse dependencies, where writes stayed single-threaded. Codex and Cursor now have a counterpart to almost every Claude Code configuration surface, but they do not enforce the same things. Codex custom agents cannot narrow the sandbox, approvals or MCP servers. Cursor honours only `readonly` among subagent restrictions and imports Claude hooks fail-open. Neither expands `@imports` or reads `.claude/rules`. Apex 26 has eleven agents (twelve files counting the README), and they are above the public norm: single-job, allowlisted, contract-checked by a `SubagentStop` hook, model-tiered by a test. But they carry stale mechanics, including a "maxTurns returns NOTHING" paragraph in ten agents that has been false since v2.1.246. The larger risks are silent gaps between hosts: Codex hooks registered with relative paths, Claude hooks that also run fail-open inside Cursor, no MCP guard in Cursor Cloud, and a Bugbot file that never loads the rules it cites. Of nineteen ranked changes, the top three are hook fixes of a few lines each. Eleven need a rule change, which Bryce's "rules are drafts" stance lets travel as one bundled PR. Eighteen repo defects each still need one confirming run in a live Codex or Cursor client, and two sittings would clear them.

## A subagent is an enforced contract, not a persona

Mechanically, a Claude Code subagent is a Markdown file. Its YAML frontmatter sets the configuration and its body becomes the *entire* system prompt. "Subagents receive only this system prompt plus basic environment details like the working directory, not the Claude Code system prompt." Only `name` and `description` are required, and "Claude Code ignores a field it doesn't recognize without reporting an error" ([Claude Code subagents](https://code.claude.com/docs/en/sub-agents)). On the way in, a subagent receives the delegation prompt, the CLAUDE.md hierarchy (unless `omitClaudeMd` is set), a git-status snapshot and any preloaded skills. "The only content you pass from parent to subagent is the Agent tool's prompt string." On the way out, "only its final message returns to the parent" ([Agent SDK subagents](https://code.claude.com/docs/en/agent-sdk/subagents)).

Several 2026 defaults change how a definition behaves in practice. Subagents spawned from the main conversation **start in the background**. Fork mode, where the subagent inherits the whole conversation and shares its prompt cache, became the default on every surface in **v2.1.302**. A subagent that hits `maxTurns` has returned **partial, resumable output since v2.1.246**. Worktree isolation branches from the default branch unless `worktree.baseRef` is `"head"` ([Claude Code subagents](https://code.claude.com/docs/en/sub-agents); [CHANGELOG](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md); [worktrees](https://code.claude.com/docs/en/worktrees)).

Anthropic's current guidance on *when* to define one has narrowed. The test is "when you keep spawning the same kind of worker with the same instructions." The main conversation remains better for back-and-forth, for phases that share significant context, and whenever latency matters ([Claude Code subagents](https://code.claude.com/docs/en/sub-agents)). The best-practices page names four payoffs: parallel independent work, keeping long output out of the main conversation, "a reviewer that hasn't seen how the code was written", and "fewer tools than the main session has". It also retires two habits. "Running out of context is rarely the problem anymore," and "handing the same task to a subagent doesn't make the answer any better" ([Claude Code best practices](https://code.claude.com/docs/en/best-practices)).

Opus 5 delegates readily, so with the `claude_code` preset Claude Code now adds a line telling it not to call the Agent tool unless asked ([Agent SDK subagents](https://code.claude.com/docs/en/agent-sdk/subagents)). Anthropic's sample damping instruction reads: "Do not delegate work you can finish yourself in a handful of tool calls… If one subagent can complete the task, use one rather than several" ([Prompting Claude Opus 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5)). A fork is the cheaper choice whenever the task needs context the parent already holds.

The parts of a good definition, and what enforces each, are summarised below.

| Element | What good looks like | What actually enforces it |
|---|---|---|
| `description` | A routing condition plus the inputs the parent must supply ("give file:line rows", "pass the base ref") | Nothing; it steers routing and the brief |
| Body | Role, inputs, procedure, a hard output contract, an "obstacles / unread" field and an early-stop rule | The `SubagentStop` hook can block a malformed report |
| `tools` / `disallowedTools` | The minimum allowlist; omit `Agent` from reporters so they cannot fan out | Claude Code itself, before the model sees the tools |
| `model` / `effort` | Sized to the job: Haiku or Sonnet for recall and log digestion, high effort for verification | Frontmatter, unless `CLAUDE_CODE_EFFORT_LEVEL` overrides it |
| `isolation`, `maxTurns`, `mcpServers`, `hooks`, `skills` | A worktree for writers, a turn bound, inline MCP servers, scoped hooks, preloaded procedures | Claude Code, but plugin agents ignore `hooks`, `mcpServers` and `permissionMode` |

**The description does two jobs.** Claude reads every subagent's name and description to decide whom to delegate to. It also "uses the description as guidance for writing that prompt", so a line like "You must tell the agent precisely which files you want it to review" makes the parent actually list the files ([Claude Academy: Designing effective subagents](https://academy.claude.com/courses/introduction-to-subagents/designing-effective-subagents)). The only hard size limit is a startup warning once combined custom-agent descriptions exceed **15,000 tokens**. Detail belongs in the body, which "only loads when that subagent runs" ([Claude Code subagents](https://code.claude.com/docs/en/sub-agents)).

**Tool limits are the real boundary, and prose is only a request.** "Give a custom subagent… only `tools: Read, Grep, Glob`. Now it's a reviewer that can't edit anything, and that limit is enforced by Claude Code rather than requested in a prompt" ([best practices](https://code.claude.com/docs/en/best-practices)). Three traps follow from current mechanics:

- **Background mode strips tools silently.** A background subagent keeps every MCP tool but only about twenty built-ins (Read, Grep, Glob, LSP, Bash, Edit, Write, WebFetch, Skill, SendMessage, Monitor, Artifact and a few more). "The same definition can resolve to different tools in the foreground and the background," and the removal reports no error unless nothing is left.
- **A specifier removes the whole tool.** `disallowedTools: Bash(git push *)` "still removes the whole tool"; a single command has to be blocked with a `permissions.deny` rule.
- **Misspelled fields vanish.** Only `claude plugin validate` (v2.1.233+) and `claude --debug` (v2.1.296+) report unparsed or unrecognised frontmatter.

Instructions also reach a subagent less reliably than they reach the parent. With `omitClaudeMd`, and in a default-location worktree, the subagent misses CLAUDE.md content or worktree-specific rules. The docs' advice is to "restate it in the prompt you give Claude when delegating" ([Claude Code subagents](https://code.claude.com/docs/en/sub-agents)). A rule a subagent must obey therefore belongs in the delegation prompt, the agent body or a hook. Settings hooks do fire inside subagents.

**The return contract matters most.** Anthropic's course calls a defined output format "the single most important improvement… Without a defined output, subagents struggle to decide when enough research has been done and tend to run much longer than necessary." It also recommends an "Obstacles Encountered" section "so the main thread doesn't have to rediscover them" ([Claude Academy](https://academy.claude.com/courses/introduction-to-subagents/designing-effective-subagents)).

The report then passes several filters. It is scanned for instruction-shaped text and labelled as subagent output whose "approval claims… carry no authority" (v2.1.277). In auto mode it travels through a classifier-reviewed `SubagentHandback` call (v2.1.271), and the parent "may summarize it in its own response" ([CHANGELOG](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md); [Agent SDK subagents](https://code.claude.com/docs/en/agent-sdk/subagents)). A short, structured report that points to files survives those filters best. Anthropic's research system avoided the "game of telephone" by having subagents "store their work in external systems, then pass lightweight references back to the coordinator" ([Anthropic Engineering](https://www.anthropic.com/engineering/multi-agent-research-system)).

A `SubagentStop` hook can enforce the shape. It returns `decision: "block"` with a reason and reads `last_assistant_message` rather than the transcript ([hooks reference](https://code.claude.com/docs/en/hooks)).

**Model and effort should be set per agent, not inherited.** The resolution order is per-invocation `model`, then frontmatter, then `CLAUDE_CODE_SUBAGENT_MODEL`, then the main model. The built-in Explore agent runs on the main conversation's model unless a project agent named `Explore` overrides it ([Claude Code subagents](https://code.claude.com/docs/en/sub-agents)). Frontmatter `effort` overrides the session level "but not the environment variable" ([model config](https://code.claude.com/docs/en/model-config)). Haiku at `low` effort "is more likely to skip a search, stop early, or skip a check" in long agent prompts, so recall agents should run at `medium` ([Effort docs](https://platform.claude.com/docs/en/build-with-claude/effort)). Haiku 5.5 costs **$0.10/$0.50 per million tokens up to 100K tokens of prompt, against Opus 5.5's $4/$20**, but rises fivefold above 100K ([Pricing](https://platform.claude.com/docs/en/about-claude/pricing)). A long-context exploration agent therefore saves about 4–8x, not 40x.

**Verification agents work because they are independent, not because a second opinion is extra.** `/code-review` runs "in a fresh subagent that never saw your conversation", and reviewers must be told to "skip style", because "a reviewer that's asked to find problems will always find *something*" ([best practices](https://code.claude.com/docs/en/best-practices)). Cognition's Devin Review catches "an average of 2 bugs per PR, of which roughly 58% are severe", and it works "best when the coding and review agents do not share any context beforehand". Cognition also keeps a "communication bridge" in which the writer filters findings against the user's intent, to prevent looping and out-of-scope work ([Cognition, 2026-04-22](https://cognition.com/blog/multi-agents-working)).

Self-review is the failure case. Agents asked to grade their own work "tend to respond by confidently praising" it, and "tuning a standalone evaluator to be skeptical turns out to be far more tractable" ([Anthropic harness design](https://www.anthropic.com/research/harness-design-long-running-apps)). Prompting models to look for counter-examples raised rule discovery from **42% to 56%** ([Jhaveri et al.](https://arxiv.org/html/2604.02485v1)). Pairing one fresh same-model reviewer with one reviewer from a different strong model matched **56.7% of planted errors, against 42.7% for two same-model reviews** (p = .006). A lightweight cross-model reviewer added nothing ([Song, arXiv 2610.01471](https://arxiv.org/abs/2610.01471)).

This resolves the apparent conflict with Anthropic's Opus 5 advice to "not use subagents to verify or double-check your own work". That advice targets redundant self-checking. An independent verifier is a different instrument: it gets the artefact and the acceptance criteria rather than the author's conclusion, it has a fixed verdict vocabulary, and the parent filters what it reports.

**Delegation can be measured directly.** `claude plugin eval` can assert that an Agent call with a given `subagent_type` happened (`tool_used` with `input_match`) and grade the return with a regex. `/usage` breaks spend down by subagent ([Plugin evals](https://code.claude.com/docs/en/plugin-evals); [best practices](https://code.claude.com/docs/en/best-practices)). OpenTelemetry counters carry `agent.name`, but custom names are redacted to `"custom"` unless `OTEL_LOG_TOOL_DETAILS=1` is set ([Monitoring](https://code.claude.com/docs/en/monitoring-usage)).

## Agent teams cost 2–5x and win only on separable work

The only controlled 2026 coding comparison on current frontier models is Vals' Vibe Code Bench: 50 full-stack apps, each built once by a single agent and once by a team of up to five subagents ([Vals AI, 2026-10-09](https://www.vals.ai/blogs/multi-agent-vibe-code-bench)). It found no case for teams on Opus 5.5:

- **Opus 5.5, medium effort:** single agent 91.5% at $4.08 and 20.3 minutes; team 91.2% at $9.10 and 26.6 minutes.
- **Opus 5.5, max effort:** single agent 89.8% at $23.77; team 93.2% at $122. Not significant.
- **The best value overall** was the medium-effort single agent, within 1.6 points of the top team at about **1/30 of its cost**.
- **The one significant gain** was GPT 6 Sol at medium effort: +7.3 points (p = 0.005).

Where the team gains did appear, they came from checking the seams between parts. On the apps where Sol's team gained most, "the single agents reported that testing had passed even when some features were never built". The team lead "reviewed the separately built parts against each other". Most of a team's measured value was therefore a second, clean-context verification pass, which a single verifier subagent buys far more cheaply.

Older-generation studies point the same way and explain why:

- **Kim et al. (180 configurations).** Centralised coordination gained **+80.8%** on parallelisable finance tasks, while "every multi-agent variant… degraded performance by 39-70%" on sequential planning. Coordination gains vanished once the single-agent baseline exceeded about 45%. Independent agents amplified errors **17.2x**, against 4.4x for an orchestrated hub ([Google Research](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/)).
- **CooperBench.** When coding agents shared files, success fell from **68.6% with two agents to 30.0% with four**. A chat channel cut merge conflicts but not failures, and messaging consumed up to 20% of the action budget ([CooperBench](https://cooperbench.com/blog/curse-of-coordination)).
- **Yuan et al. (2026).** The benefit is confined to "long-horizon tasks with sparse dependencies" ([arXiv 2609.19759](https://arxiv.org/abs/2609.19759)).

Opus 5.5 at 91.5% on Vibe Code Bench sits far above the saturation threshold, and Vals' null result fits.

The patterns that hold up share one shape: **a single writer per coupled change, read-only or advisory side agents, and state passed through files**. Cognition, which argued against multi-agent setups in 2025, now endorses "setups where multiple agents contribute intelligence to a task while writes stay single-threaded". It calls the practical shape "map-reduce-and-manage", and warns that "agents assume they share state with their children when they don't" ([Cognition](https://cognition.com/blog/multi-agents-working)).

Cursor learned the same thing at scale. Twenty peer agents coordinating through a locked file "would slow down to the effective throughput of two or three". A hierarchy of planners, non-communicating workers and a judge "solved most of our coordination problems", and an integrator role "created more bottlenecks than it solved" ([Cursor, 2026-01-14](https://cursor.com/blog/scaling-agents)). Anthropic's 16-agent C compiler parallelised trivially across many independent failing tests. On the Linux kernel, "one giant task", every agent "would hit the same bug, fix that bug, and then overwrite each other's changes" until a GCC oracle split the work per file ([Anthropic, 2026-02-05](https://www.anthropic.com/engineering/building-c-compiler)). OpenAI's Codex docs draw the same line: parallel agents suit "read-heavy tasks such as exploration, tests, triage, and summarization" ([Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)).

The failure modes are mostly design failures, not gaps in model skill. MAST's taxonomy of 1,642 traces is led by step repetition (15.7%), reasoning–action mismatch (13.2%), unawareness of termination conditions (12.4%) and disobeying the task specification (11.8%). Adding a task-objective verification step improved results by **15.6%** on the same model ([MAST](https://arxiv.org/html/2503.13657v3)). CooperBench workers reported "Done ✓" for code that was missing after the merge, and in 63% of failures an agent acted as if its partner's code would not exist. A worker's self-report is not evidence. The orchestrator or CI has to check the artefact itself: the diff, the log line, the pushed commit.

The cost mechanism is also measured. Vals' team subagents read a median **224M cached tokens per app, against 55M for the single agent**, because each one re-sends its own specification and working state on every call. Worker briefs should therefore be minimal and self-contained rather than forks of a long parent context; forks pay off for advisor-style questions. One Codex user's anecdotal report puts auto-delegated helpers at about 60% of their usage, and they capped `max_depth = 1` ([r/codex](https://www.reddit.com/r/codex/comments/1uxpbzs/sol_ultra_eating_your_weekly_limit_its_the/)). Anthropic's own measurement agrees: orchestrating cheaper workers saved money only for "routine work with a long cost tail" or "work larger than one context window" ([Optimizing for cost and intelligence](https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence)).

For an Opus 5.5 fleet, the default is one agent per task. Fan-out is reserved for work that splits cleanly, and verification is bought as one skeptical fresh-context pass rather than as a team. Anthropic adds that Opus 5.5 leads coordinate better with a stated time budget, which "is advisory", so a hard timeout must stay external ([Prompting Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5)).

## Codex and Cursor copy Claude Code's surfaces but not its enforcement

Every Claude Code surface now has a counterpart in Codex or Cursor, and Cursor even reads several of Claude's files directly. The asymmetry that matters is *what each host enforces*.

| Surface | Claude Code | OpenAI Codex | Cursor |
|---|---|---|---|
| Always-on instructions | `CLAUDE.md` with `@imports` (4 hops), nested files load on demand; reads `AGENTS.md` natively only when no CLAUDE.md exists (v2.1.277+) ([memory](https://code.claude.com/docs/en/memory)) | `AGENTS.md` chain from root to cwd, **32 KiB cap**; files below cwd load only if the model looks; no imports ([Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md); [base instructions](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/prompts/base_instructions/default.md)) | Root and nested `AGENTS.md` natively; root `CLAUDE.md` via third-party import; `@file` is a pointer, "not inlined" ([Cursor rules](https://cursor.com/docs/rules)) |
| Path-scoped rules | `.claude/rules/*.md` with `paths:` | None | `.cursor/rules/*.mdc` with `globs`; `.claude/rules` ignored ([forum, staff](https://forum.cursor.com/t/claude-project-level-rules-not-loaded-with-the-include-third-party-toggle-enabled/157087)) |
| Settings and permissions | allow/ask/deny JSON; local > project > user; `deny` applies before trust ([settings](https://code.claude.com/docs/en/settings)) | `.codex/config.toml` **outranks user config**, trusted projects only; OS sandbox + `approval_policy` + Starlark `prefix_rule` files; `.git`, `.agents`, `.codex` read-only ([config](https://learn.chatgpt.com/docs/config-file/config-basic); [rules](https://learn.chatgpt.com/codex/agent-configuration/rules); [approvals](https://learn.chatgpt.com/docs/agent-approvals-security)) | `.cursor/cli.json` (CLI only); `.cursorignore` does not bind terminal or MCP ([CLI permissions](https://cursor.com/docs/cli/reference/permissions); [ignore files](https://cursor.com/docs/context/ignore-files)) |
| Skills | `.claude/skills` | `.agents/skills`, follows symlinks, does not merge same-name skills | `.agents`, `.cursor`, plus `.claude` and `.codex` for compatibility ([Cursor skills](https://cursor.com/docs/skills)) |
| Custom agents | Markdown with ~19 fields: tools, hooks, MCP, worktree isolation, effort | TOML `name`/`description`/`developer_instructions` + model/effort; **cannot override sandbox, approvals or MCP servers**; spawns only on request or instruction ([Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)) | Five fields; imports `.claude/agents`; **`readonly` is the only restriction**; isolation per request; depth 2 ([Cursor subagents](https://cursor.com/docs/subagents)) |
| Hooks | ~28 events; exit 2 blocks; `onFailure` opt-in | 12 events; trusted per hash; `ask` fails open; use git-root paths; `apply_patch` matches `Edit`/`Write` ([Codex hooks](https://learn.chatgpt.com/docs/hooks)) | `failClosed` per hook; **imports Claude hooks at lowest priority, fail-open**; `Bash` becomes `Shell` ([third-party hooks](https://cursor.com/docs/reference/third-party-hooks)) |
| MCP | `.mcp.json` | `[mcp_servers]`, 10 s / 60 s defaults; Desktop ignores project MCP ([#13025](https://github.com/openai/codex/issues/13025)) | `.cursor/mcp.json`; Cloud uses the team dashboard, not the repo ([cloud capabilities](https://cursor.com/docs/cloud-agent/capabilities)) |
| Cloud environment | Setup script cached if it finishes in ~5 min; network secrets stay outside the sandbox ([on the web](https://code.claude.com/docs/en/claude-code-on-the-web)) | Conversational "Install script" + "Start skill"; Legacy Cloud keeps setup scripts ([cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments)) | `environment.json` against a strict schema; Builds read the default branch ([setup](https://cursor.com/docs/cloud-agent/setup); [schema](https://cursor.com/schemas/environment.schema.json)) |
| Review bot | Code Review reads `REVIEW.md` + `CLAUDE.md` from the base branch ([customize](https://code.claude.com/docs/en/code-review-customize)) | `@codex review`, `## Code Review Rules`, **P0/P1 only**, on Legacy Cloud ([GitHub review](https://learn.chatgpt.com/docs/third-party/github)) | Bugbot reads `BUGBOT.md` + *linked* files, ignores `.cursor/rules` ([Bugbot](https://cursor.com/docs/bugbot)) |
| Memory | Auto memory, machine-local | Memories, off by default ([memories](https://learn.chatgpt.com/docs/customization/memories)) | Removed in 2.1 ([forum](https://forum.cursor.com/t/are-my-memories-gone/144057)) |

Read down the custom-agents row and the consequence is plain. **A Claude agent's tool list is a Claude-only guarantee.** Codex states that agent instructions "can ask an agent to avoid edits, but they don't create a separate read-only sandbox". Cursor applies none of Claude's `tools` scoping and offers only `readonly: true`. A reviewer that is read-only in Claude Code is therefore advisory-only in Codex and coarse-grained in Cursor. Agent Plugins 1.0, the August 2026 cross-vendor standard, covers skills and MCP but leaves "custom agents and hooks" client-specific ([Visual Studio Magazine](https://visualstudiomagazine.com/articles/2026/08/06/vs-code-agent-plugins-go-cross-client-with-new-open-standard.aspx)).

Most failures when one repo serves all three hosts are silent:

- **Instruction files.** Claude never reads `AGENTS.override.md` or anything under `.agents/`, and Codex ignores `CLAUDE.md` unless it is configured as a fallback ([memory](https://code.claude.com/docs/en/memory)). Codex truncates silently at 32 KiB.
- **Codex hooks.** An edited hook stops firing until it is re-trusted, and unsupported outputs such as `ask` let the call proceed.
- **Cursor's import.** The CLI loads Claude agents, skills and hooks through a third-party gate that a user's code inspection found hard-coded on ([forum](https://forum.cursor.com/t/no-way-to-opt-out-of-third-party-claude-code-codex-config-loading-the-flag-is-hardcoded/166558)).
- **Cursor's rule dedupe.** Rules are de-duplicated "by filename", so a symlinked `CLAUDE.md`/`AGENTS.md` pair is injected twice ([forum, staff](https://forum.cursor.com/t/cursor-double-counts-symlinked-files-in-context-explorer-e-g-claude-md-agents-md/164295)).
- **Precedence runs opposite ways.** A committed `.codex/config.toml` beats the user's own config, while Claude's `.local` file beats the committed one. Personal knobs (model, effort, sandbox) therefore stay out of the repo's Codex config, as OpenAI advises ([Codex best practices](https://learn.chatgpt.com/guides/best-practices)).

The vendors and the practitioners who run multiple hosts converge on one shape:

- `AGENTS.md` is canonical and self-contained, with no imports inside it.
- `CLAUDE.md` is a one-line `@AGENTS.md`. Anthropic recommends it, and Cursor staff endorse it as their fix for double-loading.
- At nested levels, `AGENTS.md` is the real file and `CLAUDE.md` an import, never a symlink pair.
- One skills tree, reached through a symlink.
- Generated `.mdc` twins of path-scoped rules.
- Shared guard scripts, registered once per host ([neurycode, 22 repos](https://neurycode.com/blog/agents-md-claude-code-codex-cursor)).

OpenAI goes further on size. Its harness team found "one big AGENTS.md" failed because "too much guidance becomes non-guidance". It now uses a roughly **100-line** AGENTS.md as a map into versioned docs, with linters whose error messages "inject remediation instructions into agent context" ([OpenAI, harness engineering](https://openai.com/index/harness-engineering/)). Cursor's subagent advice is to "start with 2-3 focused subagents" because "a 2,000-word prompt doesn't make a subagent smarter" ([Cursor subagents](https://cursor.com/docs/subagents)). Every vendor's conclusion is the same: rules that must hold every time belong in layers every host passes through, meaning git hooks, CI and branch rulesets.

## Apex 26's agents beat the norm while its cross-host plumbing leaks

### Eleven well-contracted agents carrying stale mechanics

`.claude/agents/` holds eleven agents plus a `README.md` that correctly says "Eleven agents" ([README](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/.claude/agents/README.md)). On the things Anthropic stresses most, the library is strong:

- **Single jobs and model tiers pinned by a test.** Haiku runs `verify-agent`, `deploy-research` and `prior-art-scout`; Sonnet runs five auditors and triagers; Opus runs `code-hunter`; `worker` and `track-surveyor` inherit ([skill-progressive.test.mjs](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/tests/unit/skill-progressive.test.mjs)).
- **Bounded runs and enforced allowlists.** Every agent sets `maxTurns` (12–120), and the reporters combine `tools` with `disallowedTools`.
- **Machine-checked return contracts.** `subagent-contract.py` checks each reporter's final message against a row regex and a cap (FINDING ≤ 12, CLAIM ≤ 15, BLOAT ≤ 8) and blocks it once if malformed ([subagent-contract.py](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/.claude/hooks/subagent-contract.py)).
- **Isolated writers.** `worktree.baseRef: "head"` makes the two writer agents branch from the parent's HEAD, and the scout → hunter → verifier chain mirrors the independent-verifier pattern above ([settings.json](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/.claude/settings.json)).
- **A small listing cost.** The descriptions total 3,531 characters, about 880 tokens, under 6% of the 15,000-token warning.

The weaknesses are mostly mechanics that drifted after the files were written. All were confirmed by reading the files on 2026-10-28:

- **Stale maxTurns claim.** Ten agent bodies say "Hitting `maxTurns` mid-tool-call returns NOTHING to the parent." Claude Code has returned partial, resumable output since v2.1.246; this container runs 2.1.312.
- **Wrong spawn-depth mechanism.** `worker.md` says "No Agent: the subagent spawn depth is 1." No setting lowers the default depth of three; what actually stops a worker from spawning is that `Agent` is missing from its tools.
- **Tools that vanish in the background.** The worker's allowlist includes `TaskCreate`/`TaskUpdate`/`TaskList`/`TaskGet`, `SendUserFile`, `ArtifactComments` and `ArtifactData`. None of these survive background resolution, which is now the default.
- **An unresolved interaction.** `verify-agent` and `bloat-auditor` set `memory: project`, which "automatically enable[s]" Write and Edit, while also disallowing both.
- **Rule numbers that some agents cannot resolve.** Every agent ends with "Flat prohibitions: AGENTS.md §Verification 10, 5 and 4". The five `omitClaudeMd` agents never load AGENTS.md, so they cannot look those numbers up.
- **Unused fields and blurred jobs.** No agent sets `effort` or `skills`, and there is no `Explore` override. `deploy-research` carries two jobs, deploy evidence and general web research, under the longest description. Several bodies point at a skill's reference files instead of preloading the skill.

The orchestration shape mostly fits the evidence. The dispatcher runs up to **eight Claude cloud workers at a time on Sonnet 5.5**, each owning the paths in its own PR ([dispatch.json](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/tools/ci/dispatch.json)). Those are independent PRs with sparse dependencies, the regime where fan-out pays. In-session fan-out follows a 2026-10-26 memory ([fan-out-with-subagents.md](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/.claude/memory/fan-out-with-subagents.md)): after a short survey, split independent fixes across worktree workers. It lacks the explicit separability test, cost bound and "verify the artefact, not the report" step that the CooperBench and Vals data argue for.

### Codex sees a thinner, partly unguarded repo

The Codex side is carefully built. A test keeps the six `[mcp_servers]` in lockstep with `.mcp.json`. The instruction chain is byte-budgeted against the 32 KiB cap. `.agents/skills` holds 36 symlinks, which Codex follows. Both wrapper scripts turn `ask` into `deny`, which is the right answer to Codex treating `ask` as fail-open ([.codex/hooks.json](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/.codex/hooks.json)).

Measured against current docs, the side still has six gaps:

- **Relative hook paths.** Both hook commands are `bash .codex/hooks/…`. Codex runs hooks in the session cwd and recommends resolving from the git root, because "Codex may be started from a subdirectory" ([Codex hooks](https://learn.chatgpt.com/docs/hooks)).
- **No guard on file edits.** Nothing is registered for `apply_patch`, so generated-file and live-run bans reach Codex only at `git commit`.
- **A narrower MCP guard.** The matcher covers 4 GitHub write tools against Claude's 8.
- **No lifecycle hooks.** SessionStart, Stop and SubagentStop are not registered, though Codex supports all three.
- **Invisible area conventions.** The conventions moved into `.claude/rules/game-code.md` on 2026-10-26 reach Codex only as a pointer.
- **Missing surfaces.** There is no `.codex/agents`, no `.codex/rules` and no `## Code Review Rules`.

AGENTS.md also names Claude-only tools (`subscribe_pr_activity`, `Monitor`, `EnterWorktree`), which its own "the rest is convention" line already concedes.

### Cursor runs two guard paths, and the weaker one fails open

Cursor's configuration follows staff advice in most places. It has generated `.mdc` twins, a one-line root `CLAUDE.md`, `failClosed` adapters on all three events, and the recommended "Cursor Cloud specific instructions" heading ([.cursor/hooks.json](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/.cursor/hooks.json)). The defects are silent:

- **Duplicate, fail-open hooks.** With the default-on import, Cursor *also* runs the **20 Claude-registered handlers**. They run at lowest priority and fail open, and matchers such as `^mcp__github__…$` can never match Cursor's `MCP:<tool>` names.
- **No MCP guard in Cursor Cloud.** `beforeMCPExecution` "is not available in cloud agents", and `edit-guard.sh` passes every `MCP:` tool, so the GitHub-MCP rules (no run cancel, no squash) go unenforced there ([Cursor hooks](https://cursor.com/docs/hooks)).
- **A key outside the schema.** `environment.json` carries `mcpPluginServerAllowlist`, which the published schema does not define (`unevaluatedProperties: false`).
- **Nested symlinks.** `js/track/AGENTS.md` and `js/circuits/AGENTS.md` are symlinks to `CLAUDE.md`, exactly the pair Cursor double-injects.
- **Rules Bugbot never loads.** `BUGBOT.md` names its canonical rule files in backticks, but Bugbot loads only *linked* files ([BUGBOT.md](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/.cursor/BUGBOT.md)). This one matters more than it looks: Bugbot is the repo's only reviewer from a different vendor, the very configuration Song found adds recall, and it currently reviews without the rules.
- **A path comparison that never matches.** `shell-guard.sh` skips the duplicate commit gate only when `core.hooksPath` equals the literal `.githooks`. In this container it is stored as `/home/user/f1-game/.githooks`, so the comparison fails ([shell-guard.sh](https://github.com/brycejmurrin/f1-game/blob/claude/f1-game-project-26h3ng/.cursor/hooks/shell-guard.sh)).

### Eighteen defects that one live client run each would settle

None of the following has been observed in a real Codex or Cursor session, because this container has neither client. Each row names the single run that settles it. Two Claude-side checks also remain: whether the worker's tools survive background resolution (`/tasks`), and how `memory` interacts with `disallowedTools` (`--debug`).

| # | Host | Defect | Evidence so far | The one confirming run |
|---|---|---|---|---|
| D1 | Codex | Relative `.codex/hooks/…` paths; a session started in a subdirectory probably runs no guard | Docs warn; no documented rule makes a non-0/2 exit block | Start Codex in `js/track/`, ask for a refused command, see whether it is refused |
| D2 | Codex | No `apply_patch` edit guard | Certain (nothing registered); the patch grammar is undocumented | Log one `apply_patch` PreToolUse payload |
| D3 | Codex | MCP guard covers 4 of 8 GitHub write tools | Certain from the file; tool-name shape unconfirmed | Log one GitHub connector `tool_name` |
| D4 | Codex | Desktop ignores project MCP servers | Open upstream issue #13025 | List MCP tools in Codex Desktop |
| D5 | Codex | Relative MCP `args`, no `cwd`; BrowserStack credentials without `env_vars` | Inferred | Start the CLI in a subdirectory, list tools, call one BrowserStack tool |
| D6 | Codex | `game-code.md` conventions reach Codex only as a pointer | Certain; whether the model follows it is unknown | Ask Codex to edit a `js/` file; check whether it opens the rule |
| D7 | Codex | `.agents`/`.codex` are read-only in the default sandbox, so `mirror-skills.sh` needs escalation | Documented | Run `mirror-skills.sh` from Codex |
| E1 | Cursor | 20 imported Claude handlers run beside the adapters and fail open | Documented import; not observed | Watch the Cursor "Hooks" output channel for one session |
| E2 | Cursor Cloud | No GitHub MCP guard | Certain in code; exposure depends on the dashboard | Check the team MCP list; log one cloud `preToolUse` MCP payload |
| E3 | Cursor Cloud | `mcpPluginServerAllowlist` is not in the schema | Schema says invalid; repo notes report green Builds | `environment-info` from a cloud agent |
| E4 | Cursor | Nested `AGENTS.md` → `CLAUDE.md` symlinks double-inject | Staff-confirmed for the root pair | Context explorer while editing in `js/track/` |
| E5 | Bugbot | Canonical rules named in backticks, not linked | Inferred from docs | `bugbot run verbose=true` on one PR |
| E6 | Cursor | `core.hooksPath` literal comparison means the commit gate runs twice | Mismatch confirmed in this container | Time one commit from Cursor |
| E7 | Cursor | 200 s shell-guard timeout vs 360 s for `bash-guard`; a slow gate becomes a deny | Inferred | The same commit, at load |
| E8 | Cursor | `haiku`/`sonnet`/`opus` are not documented Cursor model IDs | Undocumented | Run one reporter in Cursor and read the model it used |
| E9 | Cursor | `worker` and `track-surveyor` lose worktree isolation | Documented (no such field) | Delegate to `worker`; check its cwd and branch |
| E10 | Cursor | `README.md` may appear as a "README" agent (name derived from filename) | Inferred | Open Cursor's agent list |
| E11 | Cursor IDE | Each skill may be listed twice via `.claude/skills` and `.agents/skills` | CLI shows symlinked skills once | Count skills in the IDE list |

## Nineteen changes ranked, eleven of them rule changes

The ranking weighs impact against effort. Impact counts how many sessions or events a change touches and the cost or risk it removes. Effort counts engineering time plus billed runs. "Rule change" means one of three things:

- **A hook or settings file in any host.** `.claude/rules/claude-config.md` requires Bryce's explicit yes for Claude's; the Codex and Cursor adapters enforce the same rules and AGENTS.md describes them.
- **AGENTS.md, WORKERS.md or memory wording.**
- **A test that pins the current shape.**

The last column points to the confirming runs in the defect table.

| # | Change | Impact | Effort | Rule change? | Live client run? |
|---|---|---|---|---|---|
| 1 | Resolve both Codex hook commands from the git root (`bash "$(git rev-parse --show-toplevel)/.codex/hooks/…"`); add a test that runs each registered command from `js/track/` | High | Trivial | Yes: hooks; users re-trust in `/hooks` | Codex: D1 |
| 2 | Exit 0 at the top of every Claude-registered hook when `CURSOR_VERSION` is set, leaving Cursor's three `failClosed` adapters as its only guard path | High | Low | Yes: `.claude/hooks/**` | Cursor: E1 |
| 3 | Route Cursor `preToolUse` calls named `MCP:*` to the GitHub MCP guard, treating a missing server identity as deny | High where Cloud has GitHub MCP | Low | Yes: hooks | Cursor Cloud: E2 |
| 4 | Rewrite the stale mechanics: maxTurns now returns partial, resumable output (keep "re-emit every row in the final message"); fix the worker's depth sentence; drop or document background-stripped tools; pin the wording in `skill-progressive.test.mjs` | Medium–high | Trivial | No | No (one Claude `/tasks` check) |
| 5 | Add `.claude/agents/Explore.md` (Haiku or Sonnet, `effort: medium`, read-only tools) and per-agent `effort:` (`high` for verifiers, triage and hunter; `medium` elsewhere); keep `CLAUDE_CODE_EFFORT_LEVEL` unset; pin both | High | Low | No | No |
| 6 | Write the delegation contract into WORKERS.md and the fan-out memory: a separability test before any fan-out, one writer per coupled change, brief fields (objective, OWNED/FORBIDDEN, output, stop condition), verify the artefact rather than the report, a stated time budget; set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` once a check shows no `context: fork` skill runs inside a worker | High | Low | Yes: WORKERS.md, memory, settings | No |
| 7 | Codex: register an `apply_patch`/`Edit`/`Write` guard that runs `protect-files.sh` per path; widen the MCP matcher to all 8 tools; add SessionStart and a JSON-form Stop | Medium–high | Medium | Yes: hooks | Codex: D2, D3 |
| 8 | Invert the nested instruction files: real `AGENTS.md`, one-line `@AGENTS.md` `CLAUDE.md`; update the symlink test | Medium | Low | Yes: test pin | Cursor: E4 |
| 9 | Turn `BUGBOT.md`'s rule references into Markdown links (AGENTS.md fits under the 30,000-character per-rule cap); later share one review-rules file that `REVIEW.md` can `@include` and Codex's `## Code Review Rules` can mirror | Medium | Trivial | No | Bugbot: E5 |
| 10 | Replace each agent's "Flat prohibitions: AGENTS.md §… 10, 5 and 4" line with a `SubagentStart` hook that injects the three rules as `additionalContext`, so they survive `omitClaudeMd` and keep one home | Medium | Low | Yes: hooks, settings, rulebook map | No |
| 11 | Make `shell-guard.sh` compare the resolved hooks path, and align its timeout with the commit gate (or shrink the gate, as the hooks report proposed) | Low–medium | Trivial | Yes: hooks | Cursor: E6, E7 |
| 12 | Delete `mcpPluginServerAllowlist` unless `environment-info` shows it honoured; add the schema's `chromeExecutablePath` and a `start` terminal for the static server | Low–medium | Trivial | Yes: AGENTS.md §Cursor Cloud names the key | Cursor Cloud: E3 |
| 13 | Expose `game-code.md` to Codex: an imperative AGENTS.md line now ("before editing `js/`, `css/` or `index.html`, read …"); a generated `js/AGENTS.md` later, once a Claude session shows it does not double-load beside the path-scoped rule | Medium (Codex lanes) | Low, then medium | Yes: AGENTS.md one-home map | Codex: D6 |
| 14 | Delegation eval and usage audit: 3 should-delegate and 3 should-not prompts per agent graded on `Agent` + `subagent_type`; monthly `/usage` and OTel `agent.name`; merge or retire near-zero agents; narrow `deploy-research` to deploy evidence | Medium | Medium (billed) | No | No |
| 15 | Mirror the argv-shaped `permissions.deny` rules as Codex `.codex/rules` `prefix_rule(..., decision="forbidden")`, tested with `codex execpolicy check` | Medium (Codex lanes) | Medium | Yes: enforcement | Codex |
| 16 | Preload skills with `skills:` where bodies point at skill files (`track-surveyor` → `scenery-dress`, `bloat-auditor` → `slim-bloat`); settle `memory` + `disallowedTools` with one run; add Cursor's filename-derived naming to the README | Low–medium | Low | No | Cursor: E10 |
| 17 | Make Codex MCP launch robust: `required = true` for `apex-tools`/`apex-lsp`, a git-root `cwd` or wrapper, `env_vars` for BrowserStack | Low | Low | No | Codex: D4, D5 |
| 18 | Generate `.codex/agents/*.toml` (name, description, developer_instructions, model, effort), with a comment that tools and isolation do not port | Low | Medium | Light: AGENTS.md rule 11's generated list | Codex |
| 19 | Do not build agent teams (enabling them silently turns a named spawn into a teammate in the main checkout, dropping `isolation` from frontmatter), parallel writers on coupled files, nested fan-out, lightweight-model cross-checks or flat self-coordinating peers | Avoids waste | None | No | No |

The sequencing follows from the columns:

- **Ship now.** Items 4, 5, 9, 14, 16 and 17 need no rule change.
- **One bundled rules PR for Bryce's single yes.** The hook fixes across all three hosts (1, 2, 3, 7, 10, 11), the delegation contract (6), the symlink test (8) and the AGENTS.md edits (12, 13). Items 1–3 are a few lines each and close the largest silent holes.
- **Two live sessions, in parallel.** One Codex session and one Cursor session, desktop plus one cloud agent, clear the whole confirmation column in a sitting. They should run before the rules PR goes ready, so it lands verified rather than inferred.

## Conclusion

The thread through all three questions is that **enforcement lives at different layers in each host**. A Claude subagent's `tools` list, a Codex agent's instructions and a Cursor agent's `readonly` flag look like the same feature but are not. Only the first is a boundary. Only Cursor imports the other tools' hooks, and it runs them fail-open. The repo's zero-exception rules hold everywhere only where every host passes through the same gate: git's pre-commit hook, CI and the deploy-branch ruleset. The hooks report reached this conclusion for guards. It extends to agents, because a "read-only reviewer" is a Claude-only promise.

The cheapest high-value multi-agent pattern is one the repo already half-owns. The measured value of teams is mostly a fresh pass over the seams, and cross-vendor review adds recall that a second same-model review does not. Bugbot is exactly that reviewer, but it has been reviewing without the canonical rules. Linking them, and optionally adding a Codex Sol lane as a union reviewer, beats adding agents.

Agent bodies have also turned out to rot like code. Three of their claims (maxTurns, spawn depth, background tools) were overtaken by Claude Code releases within weeks. The durable fix is to pin harness facts in tests, or keep them out of bodies, as the repo already does for model tiers. What remains unknown is whether Codex hooks fire in cloud tasks at all, and how accurately the parent routes among eleven custom agents. Only the repo's own delegation eval can answer the second.
