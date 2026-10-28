# Measure skill routing instead of counting words

Every vendor now agrees on what a good agent skill looks like. It is a small, spec-compliant `SKILL.md` folder. Its description says when the skill should fire. Its body holds only what the model would otherwise get wrong: gotchas, defaults and a verification loop. Bulk material sits in reference files one level deep, and deterministic work goes in scripts. The bigger finding is that skills fail at activation, not in their content. Vercel saw a skill go unused in **56% of eval cases**. Databricks traced most of the accuracy lost in large skill libraries to confusable descriptions, which it calls "shadowing". Test queries written by the skill's own author overstate routing accuracy by **up to 44 points**. For Apex 26, this means the 1,500-word / 11,000-character description budget optimizes a stand-in for the real goal. The repo's own audit measured routing at **84% after a fold and a description trim made to fit the budget**, against 99% before (different samples), and neither change was evaluated before it shipped. None of the **341 routing queries** expects "no skill", so the keyword hint hook's false positives go unmeasured. A spot check for this report found the hook naming a wrong skill on **3 of 10** process questions. The highest-value fixes are cheap, and most of them change one of the repo's own rules:

- add queries that should match no skill, plus queries seeded from real session transcripts;
- A/B the hint hook's existing generic mode against its lexical mode;
- make the routing A/B a gate on any description edit;
- re-derive the static caps from what each host actually allows.

Merging confusable skills and slimming AGENTS.md come next but cost more. Two popular levers, `paths:` scoping and `disable-model-invocation` on `ship`/`check`/`handoff`, are ruled out by this repo's own measurements and by how its owner works.

## SKILL.md is a shared format that breaks at three seams

The format itself is settled. A skill is a directory with a `SKILL.md`: YAML frontmatter, a Markdown body, and optional `scripts/`, `references/` and `assets/` folders. Only two fields are required. `name` is at most 64 lowercase-hyphen characters and must match the folder. `description` is at most **1,024 characters** and should say both what the skill does and when to use it ([Agent Skills specification](https://agentskills.io/specification)). Loading happens in three tiers. About 100 tokens of metadata per skill are always in context. The body loads on activation, and should stay under 500 lines or about 5,000 tokens. Bundled files load only when read, and a script costs only its output ([Anthropic platform overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview); [Anthropic Engineering](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)). Anthropic published the format as an open standard in December 2025. OpenAI Codex, Cursor, GitHub Copilot and Gemini CLI now implement it natively ([OpenAI Codex skills](https://developers.openai.com/codex/build-skills); [Cursor skills](https://cursor.com/docs/skills); [GitHub Copilot skills](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills); [Gemini CLI skills](https://geminicli.com/docs/cli/skills/)).

Portability breaks in three places.

**Discovery paths.** Claude Code's docs list only `.claude/skills/` locations and never mention `.agents/skills`. Codex scans only `.agents/skills`. Cursor and Copilot read both ([Claude Code skills](https://code.claude.com/docs/en/skills); [Codex](https://developers.openai.com/codex/build-skills)).

**Extension fields.** Claude Code adds about fifteen frontmatter fields, including `when_to_use`, `disable-model-invocation`, `context: fork`, `agent`, `paths`, `hooks`, `model` and `arguments`. claude.ai uploads and the Skills API reject any non-spec key as a **hard error** ([Claude Code skills](https://code.claude.com/docs/en/skills)). Turning off implicit invocation is `disable-model-invocation` in Claude Code and Cursor, but `agents/openai.yaml` with `allow_implicit_invocation: false` in Codex. Only Claude Code and Cursor support `paths`.

**Listing budgets.** Claude Code keeps every skill name in its listing, but descriptions share a budget of **1% of the context window**. Each entry is capped at 1,536 characters. On overflow, the descriptions of the least-invoked skills are dropped first. Codex budgets **2% of context, or 8,000 characters when the window is unknown**. It shortens descriptions first and then omits whole skills, so OpenAI advises authors to "front-load the key use case and trigger words" ([Codex](https://developers.openai.com/codex/build-skills)).

Apex 26's layout is the right answer to the path problem for its two main hosts. The canonical skills live in `.claude/skills`, and tracked `.agents/skills` symlinks point at them. Codex follows symlinks, and all 36 skill names match their folders. One risk is untested. Cursor, which this repo uses for cloud lanes, scans both directories, and its docs don't say whether it de-duplicates a symlinked skill. Claude Code documents that it de-duplicates; Codex says outright that it does not merge same-name skills. If Cursor shows every skill twice, each one gets a guaranteed confusable twin. Frontmatter drift is minor. Three skills set `user-invocable: true`, which is already the default. `survey-track` carries `argument-hint`, which is harmless in Claude Code but would fail a claude.ai upload. The repo writes descriptions as "Use when…" plus "Not X → y" boundary clauses. That follows agentskills.io's imperative style ([Optimizing descriptions](https://agentskills.io/skill-creation/optimizing-descriptions)) and Codex's "when this skill should and should not trigger" template. Anthropic's platform instead asks for a third-person "what it does, and when" ([Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)). No source has measured which of these voices routes better.

## Skills fail at activation, so routing has to be measured

In every host, the model decides when to load a skill. No vendor documents keyword matching inside the host itself ([Claude Code skills](https://code.claude.com/docs/en/skills); [Cursor](https://cursor.com/docs/skills)). Claude also consults a skill only when it thinks it needs one. Even a perfectly matching description may not trigger on "simple, one-step queries" ([skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md)). So skill-creator asks authors to make descriptions "a little bit pushy". Anthropic's prompting guide warns the other way: Opus 4.5 and 4.6 over-trigger on wording such as "CRITICAL: You MUST use this tool", and the fix is plain phrasing ([Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)). Those two pulls can only be balanced by measuring.

The measurements that exist all point at activation:

- **Vercel.** The skill was never invoked in **56% of cases**, and with default behaviour it scored the same as having no docs at all (53%). A compressed 8 KB docs index in AGENTS.md scored **100%** ([Vercel](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals)).
- **Scott Spence's sandboxed Claude Code runs.** Once a skill activated, the right one was chosen, so the gap was "activation, not selection". With no hook, 50–55% of 22 prompts activated a skill. A forced-evaluation hook raised that to **100%**. In it, the model goes through the skill list and answers yes or no for each, with "none" a valid outcome. On a harder set of 24 prompts it produced **zero false positives** on the five negatives. On that same set, a hook that *named* skills from a model pre-classifier produced **4 false positives out of 5** ([Spence, 2026-02-08](https://scottspence.com/posts/measuring-claude-code-skill-activation-with-sandboxed-evals)). These are small samples on Sonnet 4.5 in one domain.
- **A 2026 study of skill pools.** As the pool grew from 5 to 100 skills, actual-use precision fell from **29.6% to 3.3%**. It also found that invoking exactly the right skill is "neither sufficient nor necessary" for task success ([arXiv 2608.14036](https://arxiv.org/abs/2608.14036)).

Two official tools measure, separately, whether a skill fires and whether it helps.

- **skill-creator's trigger loop** uses 20 realistic queries: 8–10 that should trigger and 8–10 near-miss negatives that share vocabulary but need something else. It runs each query 3 times, splits the set 60/40 into train and held-out, iterates up to 5 times, and keeps the description that scores best on the held-out part ([skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md); [agentskills.io](https://agentskills.io/skill-creation/optimizing-descriptions)). It improved triggering on **5 of 6** of Anthropic's public skills ([Claude blog](https://claude.com/blog/improving-skill-creator-test-measure-and-refine-agent-skills)).
- **`claude plugin eval`** runs each case with and without the skill, 3 times per arm. It has a `tool_used: Skill` grader and CI exit codes, and it asks you to pin both models. The docs say the most common first finding is a delta near zero with the Skill grader failing: Claude isn't choosing the skill on natural phrasing ([Plugin evals](https://code.claude.com/docs/en/plugin-evals)).

Where the queries come from matters as much as the harness. On 690 skills, queries written by the authors overstated top-5 retrieval by **up to 44 points** compared with realistic queries that don't echo the description ([arXiv 2608.06196](https://arxiv.org/abs/2608.06196)).

Apex 26 is ahead of most teams here. It keeps a query file per skill (5 should-fire, 3 near-miss), and it has a `claude -p` harness modelled on skill-creator with `--runs`, `--grace` and `--compare` (`tools/check/skill-routing-eval.py`). That harness scored **214/216 on 2026-09-30**. There are three gaps.

**The eval is a convention, not a gate.** The 2026-10-26 system audit found that a fold of 8 skills and a description trim from 12,586 to 10,213 characters landed with no routing run. Partial runs afterwards scored **43/51 (84%)** against 99% before. The runs used different queries on a loaded machine, so the drop is a signal, not an exact figure (`docs/notes/system-audit-3/skills-a-l.md`). The offline proxy also showed `tune-physics` losing slow-corner understeer prompts to `agent-view` after that trim (`docs/notes/system-audit-3/skills-m-z.md`). The test file records the trade-off directly: the budget left "~0 slack, so every skill edit traded routing recall … for budget" (`tests/unit/agent-config.test.mjs`).

**There are no negatives that should match nothing.** None of the 341 queries expects "none", and the schema test requires every `expect` to name a skill or agent. Neither the eval nor the hook's offline floor can see a false positive. That floor checks that the hint's top two include the expected skill for at least 85% of queries. For this report, ten hand-written process questions went through the hook's `matches()`:

- "Go through the PR backlog: which PRs are stale…" named `slim-bloat`.
- "Is the race weekend PR merged yet?" named `race-weekend`.
- A request to synthesize a research report on skills and AGENTS.md named `agent-config` and `agent-view`.

**All queries are author-written.** The measured main loss is still `none:Bash`: the session runs a command before it loads the skill. The audit confirmed this loss persists with the hint hook on.

Claude Code's hooks reference shapes how such a hook should be built. UserPromptSubmit output is added as context, capped at **10,000 characters**, and replayed on `--resume`. It also fires on turns Claude starts on its own. The guidance is to write facts, not commands ([Claude Code hooks](https://code.claude.com/docs/en/hooks)). `skill-hint.py` already does all of this well: it skips host envelopes, prints one factual line, fails open, and ships `targeted`, `generic` and `off` modes for exactly this A/B. What has never been run is that A/B with negatives in the set. Spence's skill-naming hook used a model pre-classifier, not idf-weighted word overlap, so the comparison is between designs that name skills, not between identical mechanisms. Still, a lexical score that can clear its threshold on two rare shared words is the riskier of the two designs.

## The best skill bodies carry only what the model gets wrong

Anthropic starts from the assumption that "Claude is already very smart" and asks whether each paragraph "justif[ies] its token cost" ([Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)). The Claude Code team says "don't state the obvious" ([Shihipar, Anthropic](https://claude.dev/blog/lessons-from-building-claude-code-how-we-use-skills/)). PostHog's test is to ask the agent to do the task first: "If it can accomplish it efficiently, it doesn't need a skill" ([PostHog](https://newsletter.posthog.com/p/what-nobody-tells-you-about-writing)). The open standard's version: "Would the agent get this wrong without this instruction? If the answer is no, cut it" ([agentskills.io best practices](https://agentskills.io/skill-creation/best-practices)). The supporting data is SkillsBench. Curated skills raised average pass rates from **33.9% to 50.5%**, and focused skills with at most three modules beat exhaustive bundles ([SkillsBench](https://arxiv.org/abs/2602.12670)).

What survives that cut has a consistent shape:

- **Gotchas.** Anthropic and agentskills.io both call the gotchas list the highest-signal section: environment facts that defy reasonable assumptions, built up from real failures ([Shihipar](https://claude.dev/blog/lessons-from-building-claude-code-how-we-use-skills/); [agentskills.io best practices](https://agentskills.io/skill-creation/best-practices)). Anthropic's production `docx` skill pairs each critical rule with its reason, such as "docx-js defaults to A4; use US Letter" ([docx SKILL.md](https://github.com/anthropics/skills/blob/main/skills/docx/SKILL.md)).
- **Verification.** "Verification skills have had the most measurable impact on Claude's output quality internally" ([Shihipar](https://claude.dev/blog/lessons-from-building-claude-code-how-we-use-skills/)). The pattern Anthropic recommends most often is a run validator → fix → repeat loop ([best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)).
- **Defaults, not menus.** Give one default with an escape hatch rather than a list of options.
- **Scripts for repeated or deterministic logic.** Say whether the agent should run the script or read it. Point to `--help` instead of documenting every flag ([superpowers writing-skills](https://github.com/obra/superpowers/blob/main/skills/writing-skills/SKILL.md); [Simon Willison](https://simonwillison.net/2025/Oct/16/claude-skills/)).
- **Agent-friendly scripts.** No interactive prompts, structured stdout, and output of a predictable size, because harnesses truncate around 10–30K characters ([agentskills.io scripts](https://agentskills.io/skill-creation/using-scripts)).

Structure now matters for correctness, not only for tidiness:

- **One level of references.** Keep reference files one level deep, because Claude may preview a nested file with `head -100` and miss the rest ([best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)).
- **Say when to read each file.** A bare "see references/" leaves the agent guessing. Anthropic's `mcp-builder` labels its references "Load During Phase 2" and so on ([mcp-builder](https://github.com/anthropics/skills/blob/main/skills/mcp-builder/SKILL.md)).
- **Standing instructions.** A rendered skill enters the conversation once and is **never re-read**, so its guidance should be written as standing instructions.
- **Most important first.** After compaction, Claude Code keeps only **the first 5,000 tokens of each invoked skill**, within 25,000 tokens in total ([Claude Code skills](https://code.claude.com/docs/en/skills)).

The sources disagree on style, and the disagreement resolves in a specific way:

- **Capitals.** Anthropic's own best-practices page shows strengthening "always filter" to "MUST filter". skill-creator calls all-caps ALWAYS/NEVER "a yellow flag" and asks authors to explain the reasoning instead. Vercel found that "You MUST invoke the skill" made the agent anchor on the docs and miss a required config change.
- **Superpowers' middle ground.** It keeps emphatic prohibitions for discipline rules that get skipped under pressure. Its own self-reported micro-tests found prohibitions worse than positive recipes when the problem is output shape.
- **"Why" versus "what".** Claude Code's docs say to "state what to do rather than narrating how or why", because loaded skill text is a recurring token cost. These fit together: a non-obvious rule gets a one-clause reason, and nothing gets a narrative.
- **Descriptions.** A description must trigger, not summarize. When a description summarized a skill's workflow ("code review between tasks"), the agent did one review where the body required two ([superpowers](https://github.com/obra/superpowers/blob/main/skills/writing-skills/SKILL.md)).
- **Volatile specifics.** Skills should not quote line numbers, counts or versions. Point to the source that owns them ([PostHog](https://newsletter.posthog.com/p/what-nobody-tells-you-about-writing)).

Apex 26's bodies are in good shape against these standards:

- 36 bodies total about 22,900 words. The longest, `steward`, is about 1,550 words over 155 lines, well under 500 lines.
- 31 of the 36 skills split detail into `references/`.
- The repo's "overrides, not the protocol" convention is the vendor consensus under another name.
- Its drift tests already go beyond public tooling. One fails any skill that names a path that no longer exists (`tests/unit/docs-integrity.test.mjs`). Another fails a skill that names a test group that doesn't exist (`tests/unit/skill-progressive.test.mjs`).

Public validators check frontmatter, links and token counts ([skill-validator](https://github.com/agent-ecosystem/skill-validator)). `claude plugin validate` passes a skill that has no frontmatter at all ([MossBySea](https://mossbysea.com/tools/the-validator-will-pass-a-skill-that-never-runs/)). What the repo does not yet enforce is ordering. Nothing checks that standing gotchas come before routing tables, or that each reference says when to read it. Both matter once a long session compacts.

## Confusable clusters, not skill count, decide a portfolio's accuracy

Two 2026 studies show that a larger skill library degrades accuracy and pin the cause on overlap.

**Databricks** ran libraries of 52, 102 and 202 skills on Claude Haiku 4.5 and Sonnet 4.6 ([Song & Wei, arXiv 2605.24050](https://arxiv.org/abs/2605.24050)):

- Pass rates fell by 0.08, 0.14 and 0.21 against an oracle with only the right skills.
- Shadowing was the only statistically significant component, about **68% of the drop** at 202 skills. Context overhead was not significant.
- Trajectories that used only the right skills fell from **88% to 52.6%**.
- The harm tracked how much a description overlapped with the correct skill's.

**Li's GPT-4o study** ([arXiv 2601.04748](https://arxiv.org/abs/2601.04748)) used synthetic libraries on two OpenAI models:

- Selection stayed above 90% up to about 20 skills and declined past 30.
- Adding one competitor per skill cut accuracy by 7–30%.
- Hierarchical routing recovered **9 to 40 points**.

By count alone, 36 skills sits inside the range vendors describe ("potentially 100+"). The groups that compete for the same prompt are what matter:

| Cluster | Skills |
|---|---|
| Status and landing | `check`, `check-changes`, `steward`, `ship` |
| Seeing the game | `playwright-probe`, `mcp-probe`, `agent-view`, `js-debugger` |
| UI | `css-play`, `ui-menu-a11y`, `survey-ui-matrix` |
| Game modes | `season-mode`, `career-mode` |
| Racing behaviour | `tune-physics`, `game-feel`, `ai-racecraft`, `race-incidents-control`, `race-weekend` |

The "Not X → y" clauses are the disambiguation the papers propose. They also put neighbours' vocabulary into every description the model reads; the hook strips them, but the model does not. Only measurement can settle whether they help on balance.

The vendors also agree on where everything else goes ([Claude Code features overview](https://code.claude.com/docs/en/features-overview); [Steering Claude Code](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more)):

| Mechanism | Holds | Loads |
|---|---|---|
| Always-loaded files | Facts every task needs | Every request |
| Path-scoped rules | Area conventions | When a matching file is opened |
| Skills | Procedures and bulky reference | On demand |
| Subagents | Noisy or parallel side work | In their own context, returning a summary |
| Hooks and CI | Anything that must hold every time | On their event |
| MCP | Live external systems | Tool names up front, schemas deferred |
| Plugins | A setup reused across repos | On install |

An instruction in a prompt is "a request, not a guarantee". "A real guardrail needs to be deterministic." Apex 26 follows this more rigorously than most: protected-file and bash guards, a rulebook test that gives each rule one home, and generated files with drift checks.

Two consequences apply to its worker fleet:

- **Urgent rule changes belong in hooks or CI.** In-repo skills version with each branch. A worker on an old branch keeps old skill text, and a session keeps an invoked skill's copy until it re-invokes it. That is a rolling, mixed-version deployment of the kind Anthropic runs on purpose for its agents ([Anthropic multi-agent system](https://www.anthropic.com/engineering/multi-agent-research-system)). So a rule that must reach live workers at once belongs in a hook or CI check that runs against merged state, not in skill text.
- **Unattended skills must be decision-complete.** Subagents never get `AskUserQuestion` ([Claude Code subagents](https://code.claude.com/docs/en/sub-agents)), so a skill used by an unattended worker cannot end in "ask the user".

Always-on context is where the cost evidence is sharpest:

- **ETH Zurich.** Developer-written context files raised success by only about **4%** and cost by up to **19%**. LLM-generated files lowered success while raising cost about 20%. Codebase overviews did not shorten the path to the right files ([Gloaguen et al., arXiv 2602.11988](https://arxiv.org/abs/2602.11988)).
- **IFScale.** The best model reached 68% accuracy at 500 instructions, with a bias toward earlier ones ([arXiv 2507.11538](https://arxiv.org/abs/2507.11538)).
- **Chroma.** Performance degraded with input length across all 18 models tested ([Context Rot](https://research.trychroma.com/context-rot)).
- **Vercel (the counterweight).** Knowledge needed on most tasks did best always loaded, as a compressed index.
- **Host limits.** Claude Code targets under 200 lines per CLAUDE.md and notes that imports don't reduce the cost ([Claude Code memory](https://code.claude.com/docs/en/memory)). Codex stops reading AGENTS.md at 32 KiB ([Codex AGENTS.md](https://developers.openai.com/codex/agent-configuration/agents-md)).

Apex 26's AGENTS.md is **193 lines and 22,439 bytes**. That is at Claude's line target and about 68% of Codex's cap. Every Claude session also pays for content that serves another tool or a narrow moment: Cursor Cloud bootstrap, Codex hook details and release-train medians. The test that caps its rule-bearing lines justifies the cap with a ~150–200-instruction ceiling. That figure comes from a practitioner blog ([HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md)), not from IFScale's data. The `CLAUDE.md` → `@AGENTS.md` import should stay. Claude Code's docs still recommend it for sessions that can't read AGENTS.md natively, and it never loads the file twice ([Claude Code memory](https://code.claude.com/docs/en/memory)).

Two levers that the general evidence favours are ruled out by this repo's own data.

**`paths:` scoping.** It auto-loads a skill only while matching files are in play ([Claude Code skills](https://code.claude.com/docs/en/skills)). Apex tried it, and routing went from **182/216 with it to 214/216 after removing it** (header of `tools/check/skill-routing-eval.py`; `docs/notes/AGENT-SURFACE-SURVEY-2026-10-05.md`). Question-first prompts touch no files. No published study had quantified that cost, and this repo has.

**`disable-model-invocation` on `ship`, `check` and `handoff`.** Claude Code recommends it for deploy-style side effects. But Apex's owner triggers those skills by typing "ship it" or "check" on a phone, and the hook's regexes route exactly those phrases. A user-only skill would not load from prose. The deploy risk it guards against is already enforced by `bash-guard.sh` and the branch ruleset.

## Eleven changes for Apex 26, ranked by payoff per hour

The ranking weighs impact, meaning expected effect on correct skill loads and context cost, against effort, meaning engineering time plus billed model runs. "Rule change" marks items that edit one of the repo's own enforced rules: a budget, a test, AGENTS.md, or a skill whose guidance a test pins.

| # | Change | Impact | Effort | Rule change? | Evidence |
|---|---|---|---|---|---|
| 1 | Add queries that should match no skill (`expect: "none"`) and queries seeded from real session transcripts to `tests/data/skill-routing/`. Report false-positive rate beside hit rate in the eval and in the hook's offline floor. | High | Low | **Yes**: the schema test in `agent-config.test.mjs` requires every `expect` to be a skill or agent; the 5 + 3 per-skill convention gains a shared negatives file | 0 of 341 rows expect none; author-written queries inflate accuracy by up to 44 pts ([arXiv 2608.06196](https://arxiv.org/abs/2608.06196)); spot check: 3/10 wrong names |
| 2 | A/B the hook's three existing modes (`targeted` / `generic` / `off`) on that set with `--runs 3 --grace 2`, and ship the winner. If `targeted` stays, require a score margin over the runner-up and name at most one skill. | High | Low–Med | **Yes**: `skill-hint-hook.test.mjs`'s 85% top-two floor rewards the lexical design and ignores false positives | Forced evaluation with "none" allowed: 100% activation, 0 false positives; a skill-naming hook: 4 false positives of 5 ([Spence](https://scottspence.com/posts/measuring-claude-code-skill-activation-with-sandboxed-evals)); `none:Bash` is the measured loss |
| 3 | Make the routing A/B a merge gate for any PR that edits a description, folds or renames a skill, or edits queries. Either run `--only <changed>,<neighbours> --runs 3` in CI on a pinned model, or require a committed `--compare` JSON that a test checks. Pass `--strict-mcp-config` to cut per-call boot cost. | High | Med | **Yes**: `agent-config` step 4 is advice today and becomes an enforced check | The 10-26 fold and trim shipped without an eval; routing measured 84% afterwards against 99% before; `claude plugin eval` is built for CI gating ([Plugin evals](https://code.claude.com/docs/en/plugin-evals)) |
| 4 | Re-derive the static caps from the hosts. Keep the 1,024-character per-description cap. Add a check that trigger words sit in the first ~150 characters. Drop the 1,500-word cap, which duplicates the character cap. Set the total from a measured overflow check (`/context` Skills row, `/doctor`) instead of a ratchet. | Med | Low | **Yes**: `tests/data/agent-config-budgets.json` and its "raise only with a reason" rule | Codex shortens descriptions first and Claude Code drops the least-used first ([Codex](https://developers.openai.com/codex/build-skills); [Claude Code skills](https://code.claude.com/docs/en/skills)); the cap's units are undocumented; the budget sits at 10,622/11,000 and "traded routing recall" |
| 5 | Measure real use. Count `Skill` tool calls per skill in session transcripts, split by model-initiated versus `/`-typed. Run `/skill-doctor` in attended sessions. Retire or merge never-invoked skills. | Med | Low | No | `/skill-doctor` and OTel `skill_activated` with `invocation_trigger` ([Claude Code monitoring](https://code.claude.com/docs/en/monitoring-usage)); Anthropic logs skill use with a PreToolUse hook ([Shihipar](https://claude.dev/blog/lessons-from-building-claude-code-how-we-use-skills/)) |
| 6 | In a live Cursor session, check whether each skill is listed twice (via `.claude/skills` and `.agents/skills`). If it is, exclude one path for Cursor. | Med (Cursor lanes) | Low | No (only if the mirror's lockstep test changes) | Cursor scans both directories and doesn't document de-duplication ([Cursor skills](https://cursor.com/docs/skills)) |
| 7 | Order every SKILL.md so standing gotchas and hard constraints come first, followed by a routing table whose rows say when to read each reference. Replace capitals with one-clause reasons. Add a light lint for the order. | Med | Low–Med | No (`agent-config` guidance) | Compaction keeps a skill's first 5,000 tokens and skills are never re-read ([Claude Code skills](https://code.claude.com/docs/en/skills)); Opus 4.5 and 4.6 over-trigger on aggressive wording ([Prompting](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)) |
| 8 | Merge the clusters that the eval's confusion matrix confirms are confusable, starting with `check` / `check-changes` / `steward` / `ship` and the probe quartet. Each merged hub's SKILL.md routes into `references/`. | Med–High | High | No, but depends on #3 | Shadowing explains about 68% of the loss at scale ([Song & Wei](https://arxiv.org/abs/2605.24050)); hierarchical routing +9 to +40 pts ([Li](https://arxiv.org/abs/2601.04748)) |
| 9 | Cut AGENTS.md to always-true invariants plus a compressed index of where everything lives. Cut prose that a hook's refusal message already carries. Move Cursor-Cloud and Codex-hook detail to `.cursor/` and `.codex/`, and release-train timings to `steward`. | Med | Med–High | **Yes**: AGENTS.md is the one home that `rulebook-guards` maps | Context files: +~4% success for up to +19% cost ([ETH](https://arxiv.org/abs/2602.11988)); an 8 KB index scored 100% ([Vercel](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals)) |
| 10 | On each model upgrade, run a with/without outcome suite for the verification skills (`check-changes`, `steward`) using `claude plugin eval` against the project skills directory. | Med | Med (billed) | No | Verification skills are the biggest quality lever; a skill whose evals pass without it is obsolete ([Claude blog](https://claude.com/blog/improving-skill-creator-test-measure-and-refine-agent-skills)) |
| 11 | Drop the redundant `user-invocable: true` from three skills. Keep `argument-hint` only while no claude.ai or API upload is planned. | Low | Low | No | Non-spec keys are a hard error on upload ([Claude Code skills](https://code.claude.com/docs/en/skills)) |

The first three items are one package and should land together. #1 makes false positives visible. #2 uses that set to choose the hook design. #3 stops the next budget-driven trim from shipping blind. #4 follows naturally once the eval is the gate: a static total exists only to protect the hosts' real listing budgets, so it should be derived from them. #8 is the largest structural change, and it should wait for #3. The October fold of eight skills is the cautionary case, since routing was not re-measured after it. #9 is the largest rule change. The safe version shrinks only prose that a hook already enforces with an explanatory refusal, plus details specific to one tool. The always-on rules that nearly every session needs, such as branch, commit and PR handoff, stay put, because a skill that is skipped (the `none:Bash` loss) cannot carry them.

## Conclusion

The repo already turns rules into hooks and tests wherever a rule must hold every time. For routing, it applied that habit in the wrong shape. Whether a skill gets picked is a probabilistic behaviour, but the repo gates it with a deterministic stand-in: a word and character count. The count is easy to check and easy to satisfy while routing gets worse. The routing equivalent of "make it a hook" is "make it an eval gate": repeated runs, a pinned model, near-miss and none-expected negatives, and a held-out set drawn from real prompts. The tooling already exists in `skill-routing-eval.py`. What is missing is the rule that requires it.

The most decision-relevant data in this report did not come from the literature. It came from the repo: `paths:` measured worse, routing dropped after an unevaluated trim, and the hint hook named wrong skills on process questions. The open questions the research leaves are how much `paths` costs on question-only prompts, and how lexical hint hooks compare with forced-evaluation hooks on about 40 overlapping skills. Apex 26 can answer both on its own fleet. Every source points the same way: fewer model-visible choices, each with a distinct intent, measured on the prompts people actually type.
