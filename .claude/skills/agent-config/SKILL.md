---
name: agent-config
description: "Use when editing AGENTS.md/CLAUDE.md, a skill or its description, subagents, hooks, skill-routing queries or eval, or a description budget fails. Code or docs bloat → slim-bloat."
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

Read the live figures in the test, not here; each failure message prints the
current total, so trim one to add one.

- `AGENTS.md` and every root-to-nested AGENTS.md chain under byte caps (Codex's
  32 KiB project-doc cap), plus a rule-bearing line cap (`AGENTS_MAX`,
  `CHAIN_MAX` and the line budget in the test).
- All skill descriptions together under the word and char budgets; one
  description ≤ 1,024 chars (the spec cap); every `→ name` must be a skill or agent.
- Every skill needs a routing query file and a smoke recipe (§New skill steps 3–4;
  `tests/unit/skill-progressive.test.mjs`).
- SKILL.md body under 500 lines; frontmatter keys only from the allowlist in
  `tests/unit/agent-surface.test.mjs`.

## New skill — in order

1. Check `.claude/skills/README.md` and `ls .claude/skills` for a sibling that
   already covers it; extend that one instead when the trigger words overlap.
2. `.claude/skills/<name>/SKILL.md`: `name`, `description` ("Use when …", one
   "Not X → skill" clause), keys only from `SKILL_KEYS` in `agent-surface.test.mjs`;
   trim another description by what this one adds.
3. `tests/data/skill-routing/queries/<name>.json`: an array of
   `{"query": "…", "expect": "<skill or agent>"}` rows, 5+ expecting `<name>`
   and 3 near-misses expecting the neighbour.
4. A recipe in `tools/check/skill-smoke-recipes.json` `recipes[]` (copy a
   sibling's `skill` / `task` / `fixture` / `pattern` / `expected` row).
5. `bash tools/env/mirror-skills.sh`, a row in `.claude/skills/README.md`, then
   `npm run gen`; retest as below.

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
4. A/B the routing. It needs the `claude` CLI on PATH, logged in, and spends
   real model calls: one `claude -p` per query per run per side, so
   `--only <skill>,<neighbour> --runs 3` on 8-row files is 2 × 8 × 3 × 2 = 96
   calls. Run it only when a description change is contested:
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
