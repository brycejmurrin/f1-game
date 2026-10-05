# Agent surface survey — 2026-10-05

Fifth pass over the agent surface (after `AGENT-TOOLING-RESEARCH-2026-09-22.md`,
whose §5 gap list this re-measures). The method this time: read every
skill, subagent, hook, rule and MCP catalog in the tree, then grade each
against the CURRENT docs — Claude Code's skills, sub-agents, hooks, MCP and
memory pages (all re-read today), the open Agent Skills specification, the
MCP 2025-06-18 tools spec, and the skill-creator skill's authoring guide.
Numbers are from the tree at `a7d27757`; nothing below was changed by this pass.

## 0. Inventory

| Layer | Count | Shape |
|---|---|---|
| Skills `.claude/skills/*/SKILL.md` | 30 | 21–157 lines; descriptions 168–609 chars (≈12 k chars always-on for the set); 24 carry `references/`, 2 `scripts/`, 0 `assets/` |
| Subagents `.claude/agents/*.md` | 6 | all carry `name`, `description`, `tools`, `model` tier, `maxTurns`, `background: true`; 2 carry `memory: project` |
| Hooks `.claude/settings.json` | 4 events, 9 hook rows | `SessionStart`, `PreToolUse` (3 matchers), `PostToolUse`, `Stop`; all `type: command`, block with exit 2 |
| Path-scoped rules `.claude/rules/` | 2 | `paths:` frontmatter, mirrored byte-for-byte to `.cursor/rules/` (test-enforced) |
| Project MCP `.mcp.json` | 3 stdio servers | `apex-tools` (26 tools), `playwright-official` (pinned `@0.0.79`), `chrome-devtools` |
| Workflows `.claude/workflows/` | 4 | `code-survey`, `total-audit`, `test-semantics-audit`, `redesign-judge-panel` |
| Always-on prose | `AGENTS.md` 199 lines + `CLAUDE.md` one-line import | nested `AGENTS.md` in `js/track/`, `js/circuits/` |
| In-house skill evals | 2 runners | `skill-smoke.mjs` (30/30 offline contracts), `skill-routing-eval.py` (216 queries, 214/216 on 2026-09-30) |

What the tests already pin (so this pass did not re-argue them):
`skill-progressive.test.mjs` (name = folder, description ≤ 1024 chars with a
"Use when" trigger, body ≤ 500 lines, the folded skills stay gone, hub
descriptions keep folded trigger words), `agent-config.test.mjs` (three MCP
catalogs in lockstep, every hook row has a script, the Bash guard's kill /
commit / subagent shapes, AGENTS.md ≤ 200 lines, the always-on budget),
`agent-surface.test.mjs` (wrap map = catalog), `skill-smoke.test.mjs`.

## 1. Skills, graded

| Rule (source) | Verdict |
|---|---|
| `name` 1–64 chars, lowercase/digits/hyphens, matches folder (agentskills.io spec) | **Pass**, 30/30, test-enforced |
| `description` ≤ 1024 chars, says what AND when, carries keywords (spec; Claude Code allows 1536 incl. `when_to_use`) | **Pass** on the limit (max 609). Three descriptions are off the house form — see below |
| Body ≤ 500 lines, < 5000 tokens; detail in `references/` (spec, Claude Code skills page) | **Pass**, max 157 (`steward`); test cap 500, 180 for the previously fat ones |
| References one level deep from SKILL.md; keep each file focused (spec §File references) | **Gap**: `mcp-probe/references/traps.md` fans out to `traps-chrome.md`, `traps-camera.md`, `traps-scene.md` — a two-level chain, the only one in the tree |
| A reference file over ~300 lines carries a table of contents (skill-creator guide) | **Gap**: `mcp-probe/references/recipes.md` (352 lines) and `garage-parts-livery/references/garage-angles.md` (311) have none |
| Descriptions a little "pushy", imperative body, explain why over MUST (skill-creator guide) | **Mostly pass**. The house form is "Use when X, Y, Z; near-miss → other-skill", and 27/30 follow it |
| Frontmatter extensions: `allowed-tools`, `disable-model-invocation`, `context: fork` + `agent`, `paths`, `hooks`, `disallowed-tools` (new), `!command` injection, `$ARGUMENTS` (Claude Code skills page) | `context: fork` + `agent: track-surveyor` on **survey-track** only — correct use. `paths:` was tried and MEASURED worse (routing eval 182 → 214/216 after its removal, header of `skill-routing-eval.py`): stays withdrawn. Nothing uses `!command` injection or `$ARGUMENTS`; see §7 |

**The three descriptions off the house form.** `f1-animation-cameras`
("Builds and validates…") and `replay-camera` ("Validates…") open with a
capability sentence and put the trigger second; `track-realism` is 168 chars
with no near-miss redirect at all. The routing eval has NO queries for
`f1-animation-cameras` and `replay-camera` (`tests/data/skill-routing/queries/`
covers 28 of 30), so their triggering has never been measured — exactly the
case the skill-creator's description optimiser is for.

**The skills index table is broken.** `.claude/skills/README.md` has a blank
line before the `replay-camera` and `f1-animation-cameras` rows, so they
render as a second header-less table (lines 50–53).

**Duplicated rules, re-counted** (09-22 §4.2 item 8 asked for a trim): the
`?v=dev` / no-bump rule appears in 25 skill files, `awaitSoftPresent` in 7,
`{ polling: 100 }` in 4. Each has one canonical home
(`check-changes/references/bump.md`, `docs/notes/CI-RENDERING-PERFORMANCE.md`,
`tools/check/wait-polling-lint.mjs`). Not harmful, but every restatement is
a line that can go stale independently.

**Bulk is where it should be.** The two heaviest skills by total bytes
(`garage-parts-livery` 58 KB, `mcp-probe` 53 KB) keep 90 % of it in
`references/`, loaded on demand — progressive disclosure working as designed.

## 2. Subagents, graded

| Rule (Claude Code sub-agents page) | Verdict |
|---|---|
| `name` + 1–2 sentence action-oriented `description` | **Pass**, 6/6 |
| `tools` allowlist; read-only agents list no Write/Edit | **Pass** — five of six are read-only; `track-surveyor` carries `Edit` and is scoped by prose to one circuit's pair |
| `model` as a tier, `maxTurns` on every agent | **Pass**, test-enforced tiers (haiku scan-and-report, sonnet log triage, inherit for judgement) |
| `memory: user\|project\|local` for agents that run repeatedly (new in 2026) | **Pass** — `verify-agent`, `bloat-auditor`; stores tracked under `.claude/agent-memory/` with a schema and an expiry rule (test-enforced) |
| `background: true` runs with a smaller tool set and surfaces permissions in the main session | **Pass** and documented; the Cursor twins `readonly` / `is_background` are ignored by Claude Code and kept deliberately |
| `isolation: worktree`, `permissionMode`, `disallowedTools` | Unused. `isolation: worktree` would let two `track-surveyor` runs edit different circuits in parallel without sharing a checkout; `settings.json` already sets `worktree.baseRef: "head"` for it. Low priority until a campaign runs two surveyors at once |
| Subagents may now nest five levels deep and background agents may commit / push / open draft PRs (new) | **Watch**: the browser ban in `bash-guard.sh` keys on `agent_id` / `agent_type` / a `subagents/` transcript path, which nested agents still carry. A background agent that pushes would bypass rule 12's "one push per verified batch" — no agent here has push tools, keep it that way |

## 3. Hooks, graded

| Rule (Claude Code hooks page) | Verdict |
|---|---|
| Exit 2 blocks; 0 with JSON is honoured; other codes are non-blocking | **Pass** — every blocking path in `bash-guard.sh` / `protect-files.sh` exits 2; `stop-guard.sh` exits 2 once |
| Matchers may be regex, including `mcp__server__.*` | **Pass** — the MCP browser guard matches `^mcp__(playwright-official__.*\|chrome-devtools__.*\|apex-tools__apex_(eval\|shot\|…))$`, test-checked against positive and negative names |
| Events: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `Stop`, `PreToolUse`, `PostToolUse`, `PreCompact`, `SubagentStart`, … | Four in use. `SessionStart` fires for startup, resume AND compact; `session-start.sh` is idempotent (skips `npm install` when `node_modules/.package-lock.json` is newer than the lockfile), so the post-compaction re-run costs one status line, which is the intended orientation line. The 09-22 proposals for a `SubagentStart` browser ban and a `PreCompact` re-inject are therefore already covered by `PreToolUse` + `agent_id` and by `SessionStart` on compact — **withdraw both** |
| Hook types `command` / `http` / `mcp` / `prompt` / `agent`; `hooks:` in skill and agent frontmatter (new) | All `command`. A per-skill `hooks:` block would let `mcp-probe` carry its own `chrome_*` guard, but the global matcher enforces it whether or not the skill loaded — the global form is the right one here |

## 4. MCP, graded

| Rule | Verdict |
|---|---|
| `.mcp.json` project scope: `mcpServers.{name}.{type,command,args,env,url,headers}` (Claude Code MCP page) | **Pass** — three stdio rows, `command: bash` + `args` so Cursor's PATH lookup works, `timeout` on apex-tools, `@playwright/mcp` pinned, `enabledMcpjsonServers` lists the three. `claude mcp list` in this container shows them "Pending approval", as `AGENT-SURFACE.md` documents (trust dialog first) |
| Tool search is on by default since v2.1.265: hundreds of tools scale, servers connect in the background | **Good news**: the 09-22 item "price the two browser MCP schemas with `/context`" is moot — this session saw all `apex_*`, `browser_*` and chrome-devtools tools as deferred names |
| Tool `description`: action, inputs, limits, side effects, idempotency (Claude Code MCP page); `title`, `outputSchema`, `annotations` fields (MCP tools spec) | Descriptions **pass** and are unusually good: every one opens `Tree —` or `Browser (lock first) —`, states the pin, the runtime, and the owning skill. **Gap**: zero `annotations` and zero `outputSchema` in `apex-tools-mcp.mjs`. The server already knows each tool's `kind` (10 `tree`, 6 `browser`), so `readOnlyHint` (default false), `destructiveHint` (default true), `idempotentHint` (default false) and `openWorldHint` (default true) are a one-line map per tool: tree → readOnly true / destructive false / openWorld false; browser → readOnly false (lock + artifacts) / destructive false; `apex_job_cancel` destructive true. Clients treat annotations as untrusted hints, so this is conformance and self-description, not security — but the defaults the spec assumes (destructive, open-world) are the WRONG ones for 25 of these 26 tools |
| `structuredContent` SHOULD be mirrored as serialized text; `resource_link` for files (spec) | **Pass** — `toolResult` emits structuredContent, its text copy first, and `resource_link`s for PNG / findings / report. An `outputSchema` per `--json` tool would let the client validate that; moderate value |
| Output limits: 25 k tokens default, files over 50 k chars spill to disk (Claude Code MCP page) | **Pass** — `apex_hud_survey` returns a summary plus links, never the matrix |
| Server `instructions` and `capabilities` | **Pass** — `initialize` returns both; `listChanged: false` is honest |

Doc drift found on the way: `docs/AGENT-SURFACE.md:75` still says apex-tools
pins "twelve committed `tools/` CLIs" while the wrap map below it lists 26
tools over ~20 CLIs.

## 5. AGENTS.md, CLAUDE.md, rules, memory

| Rule (Claude Code memory page) | Verdict |
|---|---|
| CLAUDE.md under ~200 lines, specific not vague | **At the ceiling**: `AGENTS.md` is 199 lines against a test cap of 200; the next rule must displace one |
| `@imports`, max 4 hops | **Pass** — `CLAUDE.md` is the single `@AGENTS.md` line |
| AGENTS.md read directly since v2.1.277 (default `claude-md-or-agents-md`: AGENTS.md is used when no CLAUDE.md exists at or above cwd) | The stub is now optional for Claude Code ≥ 2.1.277. Keep it: Cursor and older CLIs still need it, and `agent-config.test.mjs` asserts it. **Unverified**: whether the nested `js/track/AGENTS.md` and `js/circuits/AGENTS.md` load on demand the way nested `CLAUDE.md` does; worth one check with `/context` in a local session |
| `.claude/rules/*.md` with `paths:` frontmatter, one rule per file | **Pass**, 2 files, Cursor mirror test-enforced |
| Auto memory: first 200 lines / 25 KB of `MEMORY.md` load; disabled in background sessions | **Pass** — 10 index lines; `memory-sync.sh` carries it across containers |
| `/doctor prompt-audit` finds outdated or conflicting instructions (new) | Not runnable over Remote Control; run once locally and paste the findings here |

## 6. The eval loop the repo already has, vs the skill-creator's

The skill-creator skill proposes: write → run with/without the skill →
grade → optimise the description against should/should-not-trigger queries.
Apex 26 has the last stage in-house and better instrumented than the
generic script: `skill-routing-eval.py` runs 8 queries per skill (5 fire,
3 near-misses a named neighbour owns) through the REAL skill set via
`claude -p` and scores the first Skill call. What it lacks: the two
uncovered skills above, and any body-quality eval (does following the skill
produce a better result than not). The installed CLI (2.1.289) ships
`claude plugin eval`, which runs case files with graders and adds a
no-plugin baseline arm, and `claude plugin details <name>` prints a
component inventory with a projected token cost — both candidates to
replace bespoke runners; neither was run in this pass.

## 7. Ranked, one PR each

1. **Annotations + `outputSchema` on apex-tools** — map `kind` to the four
   hints and `title`, add an `outputSchema` to each `--json` wrap, assert
   both in `apex-tools-mcp.test.mjs`. One file, conformance, and fixes the
   spec defaults that currently misdescribe 25 tools as destructive and
   open-world.
2. **Routing queries + descriptions for the two unmeasured skills** — write
   8 queries each for `f1-animation-cameras` and `replay-camera`, rewrite
   their descriptions and `track-realism`'s into the house form, re-run the
   routing eval (~30 min, `--workers 6`).
3. **Skills README table** — delete the blank line before the two orphaned rows.
4. **`AGENT-SURFACE.md:75`** — "twelve CLIs" → the wrap map's count, or drop the number.
5. **TOCs** for `mcp-probe/references/recipes.md` and
   `garage-parts-livery/references/garage-angles.md`; flatten or annotate the
   `traps.md` → `traps-*.md` chain.
6. **Trim the restated rules** — 25 `?v=dev` lines to a link each.
7. **Experiment, measured**: `!command` injection in `check-changes`
   (e.g. `pick-tests --json` at load) and `$ARGUMENTS` in `new-track` /
   `agent-view`, scored by the routing eval and one timed session each.
8. **Local-only diagnostics once**: `/doctor prompt-audit`, `claude plugin
   details` on the skills dir, `/context` for the nested AGENTS.md question.

Not worth doing (measured or superseded): `paths:` on skills (routing eval);
`disable-model-invocation` (restricts activation); `SubagentStart` /
`PreCompact` hooks (covered); per-skill `hooks:` (global matcher is stronger);
`isolation: worktree` on `track-surveyor` until two surveyors run at once.

## Sources

- https://code.claude.com/docs/en/skills.md — frontmatter fields, 1536-char description cap, 500-line body, `!command`, `$ARGUMENTS`, `context: fork`, `disallowed-tools`, `hooks:`
- https://agentskills.io/specification — `name` / `description` constraints, `references/` one level deep, progressive disclosure budgets
- https://code.claude.com/docs/en/sub-agents — `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `background`, `isolation`, `memory`, nesting depth
- https://code.claude.com/docs/en/hooks.md — events, matchers, exit codes, JSON output, hook types, frontmatter hooks
- https://code.claude.com/docs/en/mcp — `.mcp.json` schema, tool naming, tool search default (v2.1.265+), description guidance, output limits
- https://modelcontextprotocol.io/specification/2025-06-18/server/tools — `title`, `outputSchema`, `annotations`, `structuredContent`, `resource_link`, annotations are untrusted hints
- https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/2025-06-18/schema.ts — `ToolAnnotations` defaults (`readOnlyHint` false, `destructiveHint` true, `idempotentHint` false, `openWorldHint` true)
- https://code.claude.com/docs/en/memory — CLAUDE.md size, `@imports`, `.claude/rules/`, AGENTS.md direct support (v2.1.277), auto-memory limits, `/doctor prompt-audit`
- skill-creator skill (Anthropic, synced into this session) — authoring guide, eval loop, description optimiser
