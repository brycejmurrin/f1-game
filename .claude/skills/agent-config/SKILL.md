---
name: agent-config
description: "Use when adding or editing a skill (SKILL.md, fat body, description, paths), AGENTS.md/CLAUDE.md, .claude/hooks, rules, subagents, the phone.json routing prompts, or a description budget fails. Not for: bloat → slim-bloat."
---

# Edit the agent surface — instructions, skills, subagents, hooks

| Surface | Where | Rule |
|---|---|---|
| Instructions | `AGENTS.md` (canonical); `CLAUDE.md` only imports it | add a rule as a hook or test when it must hold every time; a one-clause pointer at the hook replaces its prose; a decision goes to `docs/DECISIONS.md` |
| Nested instructions | `js/track/`, `js/circuits/` `AGENTS.md` | a symlink to the sibling `CLAUDE.md`, never a copy |
| Skills | `.claude/skills/<name>/SKILL.md` + `references/` | frontmatter `name` + `description` ("Use when …", one "Not for: X → skill" clause); `paths:` (documented at code.claude.com/docs/en/skills) only on a skill whose work IS a file family (render, circuits, css, sw.js, physics) — it adds file-scoped auto-load, the description still routes chat |
| Codex mirror | `.agents/skills/<name>` → `../../.claude/skills/<name>` | `bash tools/env/mirror-skills.sh` after an add/rename; no Cursor fork (`.claude/rules/claude-config.md`) |
| Subagents | `.claude/agents/<name>.md` | a `tools:` list must hold every `mcp__<server>__*` the body names; enforce read-only with `disallowedTools: Write, Edit, NotebookEdit`; `.claude/agents/README.md` §Parent and child is the parent/child protocol |
| Area rules | `.claude/rules/*.md` (`paths:` frontmatter) | loads with the matching paths; `npm run gen` regenerates `.cursor/rules` (`gen-cursor-rules.mjs`) |
| Hooks | `.claude/hooks/*.sh`/`*.py`, wired in `.claude/settings.json` | a must-hold rule lives here, listed in `.claude/rules/claude-config.md`; a hook or settings PR needs Bryce's own `config-ok` label (merge-gate `config` row); tests: `bash-guard-hardening.test.mjs`, `memory-sync.test.mjs`, `agent-config.test.mjs` |

## Budgets the tests enforce (`tests/unit/agent-config.test.mjs`, `skill-descriptions.test.mjs`)

The figures live in `tests/data/agent-config-budgets.json` (the test reads them as
`BUDGET.*`), not here; each failure message prints the current total, so trim one to add one.

- `AGENTS.md` ≤ `agentsMdBytes` (9,000; Codex's project-doc cap is 32 KiB for the whole root-to-nested chain,
  `agentsChainBytes`) and ≤ `agentsMdRuleLines` rule-bearing lines.
- All skill descriptions together under `skillDescriptionWords` / `skillDescriptionChars`; one
  description ≤ 1,024 chars (the Agent Skills spec cap; Claude Code cuts its listing
  at 1,536 for description + `when_to_use` combined, so 1,024 is deliberately
  stricter — never raise it); every `→ name` must be a skill or agent.
- `tests/unit/skill-descriptions.test.mjs` (deterministic, no model calls): every model-visible description starts
  "Use when", has a "Not for … → x" clause whose targets exist, shares ≥ 2 stemmed content words with its own
  `tests/data/skill-routing/phone.json` prompts and no OTHER description shares more; every `paths:` glob matches a
  tracked file; every `node|python3|bash tools/…` path a SKILL.md names exists.
- SKILL.md body under 500 lines; frontmatter keys only from `SKILL_KEYS` in
  `tests/unit/agent-surface.test.mjs`.

## New skill — in order

1. Check `.claude/skills/README.md` and `ls .claude/skills` for a sibling that
   already covers it; extend that one instead when the trigger words overlap.
2. `.claude/skills/<name>/SKILL.md`: `name`, `description` ("Use when …", one
   "Not for: X → skill" clause), keys only from `SKILL_KEYS`; trim another description by what this one adds.
3. `tests/data/skill-routing/phone.json`: add `"<name>": {"fire": [three prompts ≤ 8 words in Bryce's register],
   "near": [{"q": "…", "expect": "<neighbour>"}]}`.
4. `bash tools/env/mirror-skills.sh`, a row in `.claude/skills/README.md`
   (`docs-integrity.test.mjs` checks it), then `npm run gen`; retest as below.

## Workflow: survey → fix → retest → A/B

1. Survey: spawn agent `surface-reviewer` on the SET of files the change touches (read-only, writes a report to
   `scratch/`): it tests every claim file A makes about file B against B.
2. Fix the description first (it is what routes), then the body.
3. Retest:
   ```sh
   node --test tests/unit/agent-config.test.mjs tests/unit/agent-surface.test.mjs tests/unit/skill-progressive.test.mjs \
     tests/unit/skill-descriptions.test.mjs tests/unit/docs-integrity.test.mjs tests/unit/rulebook-guards.test.mjs
   bash tools/env/mirror-skills.sh --check
   npm run gen:check          # tools/README.md is generated from @doc / @skill headers
   ```
   `npm run test:docs-guards` is the wider group (CI, assets, licences…); the PR runs it.
4. A/B the routing (optional, model calls). It needs the `claude` CLI on PATH, logged in, and spends one `claude -p`
   per prompt per run per side; each call boots every `.mcp.json` server and hook, so run it as one background task.
   Run it after a fold, a rename or a description rewrite that moves trigger words; skip it for body-only edits:
   ```sh
   git worktree add ../wt-base origin/claude/f1-game-project-26h3ng
   python3 tools/check/skill-routing-eval.py --root ../wt-base --out artifacts/route-base.json --runs 3 --grace 2
   python3 tools/check/skill-routing-eval.py --out artifacts/route-head.json --runs 3 --grace 2
   python3 tools/check/skill-routing-eval.py --compare artifacts/route-base.json artifacts/route-head.json
   ```
   `--alias old=new` scores a renamed or folded skill on the base side. Clean up with
   `git worktree remove ../wt-base`.

## Pitfalls

- A fold is only correct when the hub description absorbs the folded trigger
  words (`skill-progressive.test.mjs` pins some); otherwise the workflow is unreachable.
- Never claim a hook, test or function a body names without grepping it.
- A prose-only commit runs `docs-integrity` alone (AGENTS.md docs-only fast path); run the retest block anyway.
