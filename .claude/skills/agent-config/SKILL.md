---
name: agent-config
description: "Use when editing AGENTS.md or CLAUDE.md, a SKILL.md or its description, subagents (.claude/agents), hooks (.claude/hooks), skill-routing queries or the routing eval, or a description word/char budget fails. Code or docs bloat → slim-bloat."
---

# Edit the agent surface — instructions, skills, subagents, hooks

| Surface | Where | Rule |
|---|---|---|
| Instructions | `AGENTS.md` (canonical); `CLAUDE.md` only imports it | add a rule as a hook or test when it must hold every time; evidence goes in `docs/notes/` |
| Nested instructions | `js/track/`, `js/circuits/` `AGENTS.md` | a symlink to the sibling `CLAUDE.md`, never a copy |
| Skills | `.claude/skills/<name>/SKILL.md` + `references/` | frontmatter `name` + `description` ("Use when …", one "Not X → skill" clause); no `paths:` |
| Codex mirror | `.agents/skills/<name>` → `../../.claude/skills/<name>` | `bash tools/env/mirror-skills.sh` after an add/rename; never a `.cursor/skills` tree |
| Subagents | `.claude/agents/<name>.md` | a `tools:` list must hold every `mcp__` tool the body names |
| Hooks | `.claude/hooks/*.sh`/`*.py`, wired in `.claude/settings.json` | a must-hold rule lives here; tests: `bash-guard-hardening.test.mjs`, `memory-sync.test.mjs`, `agent-config.test.mjs` (`live-run.py --help`) |

## Budgets the tests enforce (`tests/unit/agent-config.test.mjs`)

- `AGENTS.md` ≤ 28,500 B; every root-to-nested AGENTS.md chain ≤ 31,000 B
  (Codex's 32 KiB project-doc cap); ≤ 75 rule-bearing lines.
- All skill descriptions together ≤ 1,600 words and ≤ 12,000 chars; one
  description ≤ 1,024 chars; every `→ name` must be a skill or agent. The
  failure message prints the live totals — trim one to add one.
- Every skill needs `tests/data/skill-routing/queries/<skill>.json` (5+
  should-fire, 3 near-miss rows naming the neighbour) and a recipe in
  `tools/check/skill-smoke-recipes.json` (`tests/unit/skill-progressive.test.mjs`).
- SKILL.md body under 500 lines; frontmatter keys only from the allowlist in
  `tests/unit/agent-surface.test.mjs`.

## Workflow: survey → fix → retest → A/B

1. Survey: spawn agent `agent-surface-reviewer` on ONE unit (read-only, writes
   a report to `scratch/`); grep every file, function and test the skill names.
2. Fix the description first (it is what routes), then the body.
3. Retest:
   ```sh
   node --test tests/unit/agent-config.test.mjs tests/unit/agent-surface.test.mjs tests/unit/skill-progressive.test.mjs
   bash tools/env/mirror-skills.sh --check
   npm run gen:check          # tools/README.md is generated from @doc / @skill headers
   npm run test:docs-guards   # the whole agent-surface group
   ```
4. A/B the routing (one `claude -p` per query — budget it):
   ```sh
   git worktree add ../wt-base origin/claude/f1-game-project-26h3ng
   python3 tools/check/skill-routing-eval.py --queries tests/data/skill-routing/queries --root ../wt-base --out artifacts/route-base.json --only <skill>,<neighbour> --runs 3 --grace 2
   python3 tools/check/skill-routing-eval.py --queries tests/data/skill-routing/queries --out artifacts/route-head.json --only <skill>,<neighbour> --runs 3 --grace 2
   python3 tools/check/skill-routing-eval.py --compare artifacts/route-base.json artifacts/route-head.json
   ```
   `--alias old=new` scores a renamed or folded skill on the base side.

## Pitfalls

- A fold is only correct when the hub description absorbs the folded trigger
  words (`skill-progressive.test.mjs` pins some); otherwise the workflow is unreachable.
- Never claim a hook, test or function a body names without grepping it.
- A commit of prose only runs `docs-integrity`; run the tests above anyway.
