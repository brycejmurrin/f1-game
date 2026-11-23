# Agent-instruction design: research and what it means for Apex 26 (2026-10-28)

Companion to `AGENT-SURFACE-AUDIT-2026-10-28.md`. Sources were read on 2026-10-28 with WebSearch, Context7
(`/websites/code_claude`) and TinyFish fetch. Every recommendation below is a PROPOSAL for Bryce: none is applied.

## What the sources say

**Always-loaded instruction files (AGENTS.md / CLAUDE.md)**
- Target under 200 lines per instruction file (the Claude Code memory doc). "Longer files consume more context and reduce adherence." `@imports`
  "don't reduce its context cost". Instructions that matter for only part of the tree go in `.claude/rules/`
  with `paths:`. Contradictions get resolved arbitrarily: "Claude may pick one arbitrarily." `/doctor
  prompt-audit` reports stale or conflicting instructions. HTML comments are stripped before injection.
  (https://code.claude.com/docs/en/memory)
- For each line, ask "Would removing this cause Claude to make mistakes?" Exclude anything Claude can read from
  the code, information that changes frequently, and long explanations. "If you add emphasis to a CLAUDE.md line
  and Claude still misses it, that's a sign the line belongs in a hook", and preference-only hooks should be
  deleted. "Only write down what Claude can't find by reading the repo." (https://code.claude.com/docs/en/best-practices)
- ETH Zurich study (arXiv 2602.11988 v3, 2026-09-29): across agents and LLMs, context files "do not generally
  improve task success rates, while increasing inference cost by over 20%". Instructions in them "are well
  followed", but "repository overviews … are not helpful". They are "useful for specifying non-standard coding
  practices". (https://arxiv.org/abs/2602.11988)
- Counterpoint (arXiv 2601.20404, 124 PRs): with an AGENTS.md, median runtime was 28.6 % lower and output tokens
  16.6 % lower, with comparable completion. (https://arxiv.org/abs/2601.20404)
- Codex stops reading at `project_doc_max_bytes`, 32 KiB by default, summed over the root-to-cwd AGENTS.md chain.
  Nested AGENTS.md files override from closer directories.
  (https://developers.openai.com/codex/guides/agents-md → learn.chatgpt.com; https://agents.md/)

**Skills**
- Progressive disclosure has three levels: the name and description are always loaded, the body loads on match,
  and reference files load on demand. The description is the trigger, so put the key use case first. The combined
  `description`+`when_to_use` is truncated at 1,536 characters. (https://code.claude.com/docs/en/skills;
  https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- Keep the SKILL.md body under 500 lines. Keep references one level deep, because nested references get read
  partially with `head`. Avoid time-sensitive text (put it in an "old patterns" section). Use consistent terminology.
  Match the degrees of freedom to how fragile the task is. Give copyable checklists for multi-step workflows. "Build
  evaluations first": baseline without the skill, write minimal instructions, iterate.
  (https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)

**Subagents and orchestration**
- Subagents should be focused on one task, with descriptions that single out one subagent and limited tools. The
  combined subagent descriptions have a 15,000-token budget. Use a subagent when its output is verbose and you
  need only a summary. Use the main thread for back-and-forth or shared multi-phase context.
  (https://code.claude.com/docs/en/sub-agents)
- Anthropic Research system: "Teach the orchestrator how to delegate". Each subagent needs "an objective, an
  output format, guidance on the tools and sources to use, and clear task boundaries". Short, vague briefs led to
  duplicated work. Write explicit effort-scaling rules (how many agents for what size of task). Instill "good
  heuristics rather than rigid rules", plus explicit guardrails. Subagents return condensed results.
  (https://www.anthropic.com/research/multi-agent-research-system)
- Write prompts at the "right altitude", between brittle if-else rules and vague guidance. Use a minimal set of
  information, start minimal, and add instructions only for observed failures. Load context just in time through
  identifiers (paths, queries). Use structured notes for long tasks.
  (https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Start with the simplest thing that works, and use orchestrator-workers only when you can't predict the subtasks
  in advance (https://www.anthropic.com/engineering/building-effective-agents). Cognition's counterpoint: "share
  full agent traces", because "actions carry implicit decisions". Parallel workers on overlapping work make
  conflicting choices (https://cognition.ai/blog/dont-build-multi-agents).

## Apex 26 measured against it (numbers from this tree, 2026-10-28)

| finding | measurement | proposal |
|---|---|---|
| AGENTS.md sits near the 200-line target but carries a lot of text | 195 lines, 22,792 B, plus CLAUDE.md. Codex's 32 KiB cap leaves ~9 KiB for nested files on a deep path | Trim by bytes, not lines. The audit note lists ~5 KB of duplicates and ~1.4 KB of measurements |
| §Verification is almost half the file | 10,378 B of 22,792. The 13 "session shape" rules are mostly lane and CI mechanics | Move rules 4–8 and 12–13 (backgrounding, test-bg, PR body, CI watch) into skills `check-changes` / `steward` / `ship`, which already trigger on those tasks. Keep a one-line pointer each. The always-loaded file then holds only what every session needs |
| Measurements inside rules | e.g. "30–45 minutes … (one dated sample, 2026-09-16)", train medians and p90s | Rules keep the decision ("a browser group is the slowest step: run one spec"), and the numbers move to `docs/notes/` (the skills doc says avoid time-sensitive text) |
| Emphasis as enforcement | 22 "never"s and CAPS headings (THE GATE IS A LADDER …) | Per best-practices: a rule that still gets missed belongs in a hook. Many already are (`bash-guard.sh`, `protect-files.sh`). Where a hook enforces a rule, AGENTS.md can drop to a one-clause pointer |
| Path-scoped rules are already right | all 7 `.claude/rules/*.md` carry `paths:` | keep |
| Skills mostly fit the guidance | 37 skills, 215 KB. Largest body 173 lines (steward), all under 500 | Check every description puts the use case first and fits 1,536 chars. Run the repo's routing eval after any change |
| Subagent descriptions are small | 13 agents, ~4 KB of descriptions, far under 15k tokens | keep |
| Worker briefs follow the delegation recipe | `tools/ci/dispatch.mjs:283-306` gives the task, claim, STOP AT, cost cap and end-at-`land` | Add an explicit output format and the OWNED/FORBIDDEN paths (Cognition: overlapping actions conflict). `dispatch.mjs:306` says "the gate's base-behind row holds other merges meanwhile", but merge-gate has no such row (rows: open, hold, plan, ci, gen, ratchets, distance). This is a tool fix (PROPOSAL; out of scope for docs) |
| No effort-scaling rule for fan-out | memory "fan out with subagents" vs repo cap "≤ 6 subagents" in briefs | One table in skill `steward` or WORKERS.md: task size → 0 / 1–2 / 3–6 subagents (Anthropic's 1 / 2–4 / 10+ pattern scaled to this box's CPU) |
| Contradictions get resolved arbitrarily | C1–C4 in the audit note | Run `/doctor prompt-audit` (or the repo's `agent-surface-reviewer`) on each rule-touching PR |

## Recommended order (smallest first)
1. Land the audit fixes (C2, C4, and the C1 prose).
2. Fix `dispatch.mjs:306` and the needs-sync distance blind spot (tools PRs).
3. Move the measurements out of AGENTS.md (low risk, about 1.4 KB).
4. Move the lane mechanics from §Verification into skills (the big win, ≈ 6–8 KB). Do one rule per PR, and run
   the skill-routing eval each time.
5. Add the fan-out effort table and the brief's output-format line.
