VERDICT: FIX — sound, short skill; but it omits harness facts (ignored Cursor-only keys, 1,536 cap, MCP cost of the eval) and the "fat skill" route contradicts slim-bloat.
METRICS: 77 lines / ~4.6 KB / description 150 chars / 0 references files
PATHS: OK (all 8 named files, tests, npm scripts test:docs-guards + gen:check, agent-surface-reviewer, live-run.py exist)
COMMANDS: OK — every skill-routing-eval.py flag (--queries --out --root --only --alias --runs --grace --compare) is in its argparse (py:203-213).
WALKTHROUGH: Edit a description -> table (:12) -> fix description first (:51) -> retest block (:54-57) -> A/B (:59). Fine. A worker has no guidance on the eval's cost beyond the call count: the eval (skill-routing-eval.py:110) runs `claude -p ... --verbose` with no `--strict-mcp-config`, so every call boots all six .mcp.json servers + hooks. 96 calls = 96 boots. Not mentioned. Also no step says to run the eval via background/serialised (browser servers contend with Playwright rule 5).
STRUCTURE: small, no lines >400 chars, no stale dates, no line anchors. Duplicates: budget lines (:22-30) say "read the live figures in the test", good. One-home overlap: "no .cursor/skills tree" (:13) restates claude-config.md:"Never fork under .cursor/skills/" (same sentence, 2 homes) — shorten to a pointer.
ENFORCEMENT: Description budget, keys allowlist, 500-line cap, routing-query file, smoke recipe are all test-enforced and the skill says so (good). Prose-only: "Never claim a hook, test or function a body names without grepping it" (:75) — partial hook candidate, but agent-config.test.mjs already checks `→ name`; fine.

ROWS (tag):
1. 1,024 vs 1,536 — STILL OK / NEW note: SKILL.md:26 says "(the spec cap)" with no mention that Claude Code truncates description+when_to_use at 1,536 (web-claude-code.md:46,56). 1,024 is the Agent Skills spec cap, stricter, so safe; but the skill should say "Claude Code listing cut is 1,536 combined with when_to_use; 1,024 is deliberately stricter", else an editor may "raise" it. Test comment agent-config.test.mjs:813 is the only record. NEW (low).
2. Eval trigger — :59-60 "Run it only when a description change is contested". Pass 3 S1: no fold triggers it, so it never runs; fold/rename edits (the Pitfall at :73) are exactly when --alias is needed (:69). Fix: say "run it after any fold, rename or description rewrite that moves trigger words; skip for body-only edits". STILL OPEN (pass3 S1).
3. --strict-mcp-config — eval cmd at skill-routing-eval.py:110 lacks it (web-claude-code D7). Not skill-owned but the skill sends workers to it with a call count and no mention of load. STILL OPEN (D7, pass3 S2); skill should note "each call starts every MCP server until D7 lands".
4. "fat skill" route contradiction — AGENTS.md:"dead code / fat skill → skill `slim-bloat`" vs slim-bloat SKILL.md:3 "Not CSS (css-play) or skills (agent-config)" and slim-bloat:55 "editing a skill's description ... → agent-config". agent-config's own description (:3) says "Code or docs bloat → slim-bloat", which is consistent with slim-bloat for docs but not for a fat SKILL.md (trimming a skill body: whose?). Three files disagree on who owns "trim a fat skill". Fix: pick agent-config for skill bodies and edit AGENTS.md route to "dead code / bloated docs -> slim-bloat; fat skill or description -> agent-config". STILL OPEN (pass3 S5).
5. Ignored frontmatter keys — skill never tells editors that `readonly` and `is_background` are Cursor-only and ignored by Claude Code (web-claude-code.md:17,61 D1). Evidence: agent-surface-reviewer.md:6 `is_background: true`, and the 8 cards in D1 carry readonly. Row 14 (:14) only covers `tools:`; the Subagents row should add "frontmatter allowed by the agent-surface test, but readonly/is_background do nothing in Claude Code; enforce read-only with `disallowedTools` or a hook". Skill-side half of pass3 H1. STILL OPEN (H1) / adds evidence.
6. Description trigger — "skill-routing queries or eval" and "a description budget fails" are good words; collides only with slim-bloat ("simplify this / too much context" vs "skill ... bloat"). "Code or docs bloat -> slim-bloat" is the one Not-clause. Missing user words: "new skill", "add a skill", "routing query", "SKILL.md" — only partly there. A new-skill ask could route to a sibling. NEW (low).
7. Pitfall :76 "A commit of prose only runs docs-integrity; run the tests above anyway" — consistent with AGENTS docs-only fast path, which names agent-config.test.mjs already; mild duplicate (AGENTS.md "Docs-only fast path"). NEW (low).
8. iPhone/TLX safety — nothing in the skill touches the game; N/A.

GAPS (ranked):
1. .claude/skills/agent-config/SKILL.md:14 + :59-60 — add the Cursor-only keys warning (readonly, is_background) and widen the eval trigger to folds/renames/description rewrites; add the 1,536 note at :26.
2. AGENTS.md "Agent extensions" route line / .claude/skills/slim-bloat/SKILL.md:3,55 / agent-config SKILL.md:3 — one owner for "fat skill" (agent-config for skill bodies).
3. tools/check/skill-routing-eval.py:110 — add `--strict-mcp-config` (D7); then drop the load caveat from SKILL.md.
4. .claude/skills/agent-config/SKILL.md:13 — shorten the .cursor/skills sentence to a pointer to claude-config.md.

OUT OF SCOPE:
tools/check/skill-routing-eval.py:110 — missing `--strict-mcp-config`.
.claude/agents/agent-surface-reviewer.md:6 — `is_background: true` ignored by Claude Code.
AGENTS.md (Agent extensions) — "dead code / fat skill -> slim-bloat" contradicts slim-bloat/SKILL.md:3.
