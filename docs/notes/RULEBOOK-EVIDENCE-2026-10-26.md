# Rulebook size and rule compliance: the evidence — 2026-10-26

Lane R5 of the system-audit implementation (PR #3785), for the rulebook lane. Question: how long can the
always-loaded rulebook (CLAUDE.md → AGENTS.md, unscoped `.claude/rules/`, the memory index) be before rules
stop being followed, and what does the published evidence say about where rules should sit?

## Measured here

- First-turn cost of that rulebook: **12,397 tokens** (`claude -p` with and without
  `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`, everything else equal; [HARNESS-SETTINGS-2026-10-26](HARNESS-SETTINGS-2026-10-26.md) §1).
- AGENTS.md: 198 lines but 21.8 KB (~5.4k tokens) — under Anthropic's line target, about 2-3× over it in
  content, because its lines are paragraphs. It holds 45 occurrences of never/must/always/only/do not.
- The audit (§3) counted rules restated in up to 15 files and 20 contradictions between them.

## Citations

1. **Anthropic, Claude Code memory docs** (here CLAUDE.md imports AGENTS.md, so the target covers both) — "target under 200 lines per CLAUDE.md file. Longer files consume
   more context and reduce adherence." "Imports help you organize a long file but don't reduce its context
   cost." "if two instructions contradict each other, Claude may pick one arbitrarily." "Block-level HTML
   comments … are stripped before the content is injected." Path-scoped rules "only load when Claude works with
   matching files"; memory "treats them as context, not enforced configuration. To block an action regardless
   of what Claude decides, use a PreToolUse hook". https://code.claude.com/docs/en/memory
2. **Anthropic, Claude Code best practices** — "Keep it concise. For each line, ask: 'Would removing this cause
   Claude to make mistakes?' If not, cut it. Bloated CLAUDE.md files cause Claude to ignore your actual
   instructions!" "If Claude keeps doing something you don't want despite having a rule against it, the file is
   probably too long and the rule is getting lost." "If you emphasize many lines, none of them stands out."
   "Unlike CLAUDE.md instructions which are advisory, hooks are deterministic."
   https://code.claude.com/docs/en/best-practices
3. **Jaroslawicz et al., "How Many Instructions Can LLMs Follow at Once?"** (arXiv:2507.11538, July 2025) —
   "even the best frontier models only achieve 68% accuracy at the max density of 500 instructions", with a
   "bias towards earlier instructions". https://arxiv.org/abs/2507.11538
4. **Harada et al., "When Instructions Multiply"** (EMNLP 2025 Findings, arXiv:2509.21051) — across ten LLMs
   performance "consistently degrades as the number of instructions increases"; a logistic regression on
   instruction count alone predicts it within ~10 %. https://arxiv.org/abs/2509.21051
5. **Liu et al., "Lost in the Middle"** (TACL, arXiv:2307.03172) — "performance is often highest when relevant
   information occurs at the beginning or end of the input context". https://arxiv.org/abs/2307.03172
6. **Hong, Troynikov, Huber, "Context Rot"** (Chroma, July 2025; 18 models) — "model performance consistently
   degrades with increasing input length"; "Even a single distractor reduces performance relative to the
   baseline". https://www.trychroma.com/research/context-rot
7. **Anthropic, "Effective context engineering for AI agents"** (Sept 2025) — context has an "attention budget";
   aim the system prompt at "the right altitude"; sub-agents return "a condensed, distilled summary of its work
   (often 1,000-2,000 tokens)". https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

What these do and do not show: 3-4 measure many simultaneous constraints on one output, not standing rules
over a long agent session, and 5-6 measure retrieval, not obedience; together with 1-2 they point the same way
(fewer, non-duplicated, early, concrete rules), but none gives a hard threshold for a system prompt like ours.
Duplicates are the worst case of 6: a restated rule with drifted wording is a distractor for the other copy.

## Recommendation for the rulebook lane

Keep the always-loaded rulebook to **≤ 150 lines and ≤ 3k tokens** for AGENTS.md (one-line rules, no
paragraphs, no history, no measured numbers that a tool can print), **≤ 30 lines** for the one unscoped rule
file (`fleet-core.md`), and ≤ 25 lines of memory index — about 5k tokens in all, down from 12.4k. Put the few
rules whose violation costs money or authority (merge commits only, MERGE-HOLD, never cancel a run, one browser
run, never hand-edit generated files) in the first screen, each stated once; every other copy becomes a link.
Anything enforceable moves to a hook or test and leaves the prose with a one-line pointer (docs: memory is
"context, not enforced configuration"); role procedure goes to skills (loaded on demand) and area rules to
`paths:`-scoped rules. Contradictions are bugs: add a test that fails on a duplicated rule sentence or a known
contradiction pair, and run `/doctor prompt-audit` (documented in the memory page) before merging rule edits.
Add a ≤ 5-line `# Compact instructions` block to CLAUDE.md if orchestrators move to in-place compaction.
These targets are a judgement from the sources above, not a measured threshold; verify by re-measuring the
first-turn delta (`scratch/sysaudit-research/bin/ctx-ab.sh`) and by watching whether the audit's top
violations (polling loops, duplicate owners, retired desk actions) recur over the following week.
