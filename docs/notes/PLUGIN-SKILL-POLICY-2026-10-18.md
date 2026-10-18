# Plugin skills: which to use, which to disable — 2026-10-18

Bryce asked for every account-synced plugin skill family to be invoked and judged against this repo (one Sonnet
subagent per family, read-only, each skill run on a real target here). This note is the result and the policy.
The MCP-server half of the same review is [MCP-REVIEW-2026-10-18.md](MCP-REVIEW-2026-10-18.md).

**Finding.** About 110 plugin skills were tested. They are generic templates for web services (npm test, staging,
canary, trunk-based `main`, REST/DB). None knows the gate ladder, rule 12 (the draft PR body is the session log),
merge-commit-only, the one-browser-group rule or the no-browser-in-subagent rule. Two are worth using as written,
about twelve with a caveat; the rest duplicate a project skill or contradict a repo rule.

## Use (trigger in this repo)

| Skill | When |
|---|---|
| `agent-protocols:source-driven-development` | Before relying on a Web / WebGL2 / WebGPU / three.js / Playwright / Actions behaviour not checked this session. Same rule as AGENTS.md "web research is part of design". |
| `agent-protocols:research-spike-and-poc` | Feasibility unknown (a WGX feature, an asset format, a net transport): a four-line charter in the draft PR body, timeboxed, ending Proceed / Pivot / Stop; delete the spike code. |

## Use with a caveat

| Skill | Use it for | Ignore |
|---|---|---|
| `agent-protocols:test-driven-development` | A `js/` bug with a unit seam: failing `tests/unit/*.test.mjs` first, run that file only | "run the full suite" |
| `agent-protocols:api-and-interface-design` | Changing the `G` façade, an `__apex` hook or `scenery(api)`: Hyrum's Law, additive only; then `types/game-ctx.d.ts`, `docs/DEBUG-HOOKS.md` | REST/GraphQL sections |
| `agent-protocols:security-and-hardening` | Parsing external data (Jolpica/OpenF1, VS FRIEND room codes, designer share codes) or setting `innerHTML` | auth/DB/secrets sections |
| `agent-protocols:debugging-and-error-recovery` | Reproduce → localise → reduce → guard; `__apex` is the reproducer | npm checklists |
| `agent-protocols:incremental-implementation`, `documentation-and-adrs`, `performance-optimization`, `deprecation-and-migration` | Principles only; ADR-shaped notes go in `docs/notes/`, changelog via `docs/changelog.d/`, measuring via playwright-probe / gpu-census | `tasks/`, `docs/decisions/`, `SPEC.md` |
| `claude-code-toolkit:dispatch` | file:line discovery before a mechanical multi-file sweep; hand the work to agent `worker` in worktrees | its generic agents, browser runs in agents |
| `claude-perfectionist:perfectionist` | Read-only audit of the agent harness; route findings through skill `agent-config` | `apply` mode (edits guarded surfaces) |
| `engineering:architecture` | Only on an explicit ADR request; output in `docs/notes/` | scalability/cost/team rows |
| `design:ux-copy` | New error / empty / offline strings (Data Hub, multiplayer) | sentence case — buttons are ALL CAPS |
| `agent-debugging:agent-incident-diagnose` | Cold post-mortem of a failed session, fed a `tools/ci/session-transcript.mjs` digest | — |
| `claude-context-optimizer:cco-overhead` | Real first-turn token total from the transcript (98.0 K on 2026-10-18) after adding skills, MCP servers or AGENTS.md rules | its itemised list (misses AGENTS.md and skill descriptions) |

## Disable or never invoke

Name collisions (a session can load the wrong one):

| Plugin skill | Collides with |
|---|---|
| `agent-protocols:ship` | project `ship` (deploy.mjs, ready-gate, never merges) |
| `handoff:handoff` | project `handoff` (writes to `.git/handoffs/`, lost with the container) |
| `claude-code-toolkit:init` | built-in `/init` (scaffolds under `~/Development`; contradicts no-build) |
| `engineering:code-review`, `engineering:debug` | built-in `/code-review`; renderer-debug / agent-view / mcp-probe |

Rule conflicts:

| Plugin | Breaks |
|---|---|
| `claude-code-toolkit:build` (+ planner/coder/reviewer agents) | full suite inside a subagent (rules 4, 5, 10); no draft PR, ratchet or generated-file handling |
| `agent-army` | trees of agents on its own `agent-army/*` branches; agent-fleet, branch naming, one browser group |
| `claude-review-loop` | assumes `master`; writes `.review-*.md` at the repo root; fixer edits `js/` in the main checkout |
| `cc-bootstrapper` | scaffolds a parallel `.claude/` tree over the harness and the synced memory |
| `claude-cursor-orchestration:app-development` | gcloud deploy and its own PR flow, bypassing deploy.mjs and claims |
| `agent-protocols:plan`, `git-workflow-and-versioning`, `ci-cd-and-automation`, `shipping-and-launch` | `tasks/*.md` plans (rule 12), trunk-based `main`, generic CI |
| `engineering:deploy-checklist`, `engineering:incident-response` | staging/canary/pager model vs PR → CI → release train → Merge Desk |
| `claude-context-optimizer:cco-patterns`, `cco-shield apply` | commit `.cco/` / `.contextignore` into the tree |
| `agent-smith:create-agent` | replaces settings.json (137 allow rules, 16 deny, 11 hooks) with a template |
| `agent-context-kit:*` | `directives` adds a blocking pre-task step to AGENTS.md and an out-of-tree artifacts default (contradicts `artifacts/`/`scratch/`) |

Redundant (harmless, but a project skill does it with the repo's rules): the rest of `agent-protocols`, `engineering`
(documentation, standup, system-design, tech-debt, testing-strategy), `design` (accessibility-review, design-system,
design-critique, design-handoff, user-research, research-synthesis), `agent-debugging` repair/verify, `agent-smith`
analyze-agent, the rest of `claude-context-optimizer` (its hooks also spawn `node` on every tool call), `claude-md-optimizer`,
`claude-automation-recommender`, `superdesign`, and the two Cowork skills.

## Ideas worth borrowing (not adopted yet)

- agent-army's phantom-completion check: compare a worker's reported files with `git diff` before accepting a hand-back.
- agent-context-kit's `scripts`: every `tools/` CLI's `--help` must be fast and side-effect-free — a `tools/check` lint.
- handoff plugin: stamp a handoff with the commit it was written at, so a reader sees staleness.
- After any MCP `merge_pull_request`, check the merge commit has two parents (the #1743 squash); `post-merge.mjs` prints
  it, a PostToolUse hook would surface it at once. Repo settings still allow squash and rebase merges (Bryce's call).

## Enforcement

The plugins are synced from the claude.ai account, not installed by this repo. Their ids are `<name>@synced`
(`claude plugin list`; not the meta.json `marketplace_name`). The committed `.claude/settings.json` does two things,
because cloud sessions read only project settings
([settings precedence](https://code.claude.com/docs/en/settings.md),
[plugin loading](https://code.claude.com/docs/en/plugins/loading.md),
[cloud sessions](https://code.claude.com/docs/en/claude-code-on-the-web)):

- `enabledPlugins: {"<name>@synced": false}` turns off the whole plugin when nothing in it is worth keeping:
  agent-army, agent-context-kit, cc-bootstrapper, claude-code-toolkit, claude-context-optimizer (its hooks also cost a
  `node` spawn per tool call), claude-cursor-orchestration, claude-review-loop, handoff. Measured 2026-10-18:
  `claude plugin list` run inside the repo reports each `× disabled`, and agent-protocols, which is kept, as `√ loaded`.
- `permissions.deny: ["Skill(<plugin>:<skill>)"]` blocks single skills in plugins that are otherwise kept
  ([restrict skill access](https://code.claude.com/docs/en/skills.md)): agent-protocols ship/build/plan/git-workflow/ci-cd/
  shipping-and-launch, engineering code-review/debug/deploy-checklist/incident-response, agent-smith create-agent.

Turning off claude-code-toolkit and claude-context-optimizer also drops `dispatch` and `cco-overhead` from the caveat
table above. Run the overhead script by hand when it is needed (`node <plugin>/src/overhead.js`, from the plugin's
synced path in `claude plugin list`). A plugin the org marks required cannot be turned off this way.
