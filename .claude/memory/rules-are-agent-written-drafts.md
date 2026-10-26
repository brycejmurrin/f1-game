---
name: rules-are-agent-written-drafts
description: "Bryce 2026-10-26: AGENTS.md/CLAUDE.md/memory are agent-written drafts to be reconsidered; implement audit improvements, all in one PR"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-10-26T23:00:00Z
---

Bryce, 2026-10-26 ~23:00 PT: "Go deeper, do more web research, remember all agents Md Claude Md everything should be re considered. Wait ignore rules and we consider as I said. Let's implement all improvements. Implement all ideas and improvements now in parallel." and "let's put all in one PR".

**Why:** every rule in AGENTS.md, `.claude/rules/`, the skills and this memory store was written by agents; the 2026-10-26 system audit found rules restated in up to 15 files and ten contradictions.

**How to apply:** treat a rule as a draft open to change when evidence says so — change it at its one home (`docs/notes/RULEBOOK-REWRITE-2026-10-26.md` maps them) and let `tests/unit/rulebook-guards.test.mjs` keep it single. The safety floor stays: never force-push, never push the deploy branch, merge commits (fleet-core), draft PR first. Bryce's later word wins over any rule.
