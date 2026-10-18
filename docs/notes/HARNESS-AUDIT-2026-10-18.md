# Harness audit — 2026-10-18

Scope: Bryce's grant to run the config/context/protocol plugin skills against `.claude/**` and AGENTS.md, apply only
safe findings. Companion to `PLUGIN-SKILL-POLICY-2026-10-18.md` (branch
`cursor/plugin-policy-fixes-9c4d`). Edits limited to `.claude/**`, AGENTS.md and this note; `enabledPlugins` and the
`Skill(...)` deny lines belong to #2862.

## Plugin audits

The first sibling (made by `create_session`, no synced plugins) could not load any plugin skill and ran the lenses by
hand (table below). A second session with the plugins loaded ran them; each ran as a read-only subagent, and every
finding was re-read on the tree before it was applied.

| Plugin skill | Result |
|---|---|
| `claude-context-optimizer:cco-overhead` | first-turn baseline **100.3 K tokens** (latest of 1 session; a 28-plugin session, so plugin skill/agent listings inflate it): project agents ~2.7 K, memory index ~1.3 K, CLAUDE.md ~61, system prompt + tools + MCP ~96.3 K. The earlier figure (98.0 K, Project overview session) is the same order. MCP usage audit: every server `? not observed` (no data yet, not a verdict). This PR's net AGENTS.md change is +4 B, so neither figure moves measurably |
| `cco-claudemd`, `cco-doctor`, `cco-config` | CLAUDE.md 8 lines ~69 tokens (the analyzer does not follow `@AGENTS.md`); doctor 8 pass / 2 warn (no pattern/global stats yet) / 0 fail; config all defaults |
| `agent-protocols:context-engineering` | 12 rows; 6 applied, 3 already fixed by 565c87f7 (the reviewer read a tree memory-sync had re-polluted) |
| `agent-smith:analyze-agent` | about 7.6/10 (hooks 9, context 6); 13 rows, 5 applied |
| `claude-perfectionist` (propose) | grade B, 0 critical, 2 major; always-on load estimated ~12.6 K tokens of repo text; 12 rows, 4 applied (+1 major recorded as a hook follow-up) |
| Project overview session (forwarded) | perfectionist grade A; 3 README rows, 2 applied |

By-hand lenses (first sibling, still valid): `node --test` agent-config, agent-surface, docs-integrity, skill-hint-hook
95/95; 0 broken backticked paths in skills/agents/rules/hooks; `mirror-skills.sh --check` and `gen:check` clean;
137 `permissions.allow` rules, 0 duplicates.

## Applied

| # | file | finding | source |
|---|---|---|---|
| 1 | `.claude/memory/MEMORY.md` | two `merge-desk-session` lines contradict (gone vs live) — stale line removed | by hand, cco |
| 2 | `.claude/memory/MEMORY.md` | two `fixers-may-screenshot` lines; the second contradicts the file — removed | by hand, cco |
| 3 | `.claude/memory/MEMORY.md`, `standing-merge-desk.md` | index and description said the desk "runs sweeps, woken hourly" — now says it is gone | by hand, cco |
| 4 | `.claude/skills/README.md` | compound-debug/review/verify and agent-fleet rows joined by a literal `\n` | Project overview |
| 5 | `.claude/skills/README.md` | no `lighting-tuner` row (every other skill dir has one) | Project overview |
| 6 | `.claude/memory/MEMORY.md` | Merge Desk line said "find the live desk via list_sessions"; AGENTS.md §Concurrent PRs says never hunt, `SWEEP-N/A` | cco, agent-smith |
| 7 | `.claude/memory/MEMORY.md` | named the retired push hold (`APEX_PUSH_HOLD=0`) | cco |
| 8 | `.claude/memory/merge-desk-session.md` | description still said "persistent" desk | cco |
| 9 | `.claude/hooks/bash-guard.sh` header | said a queue-depth hold refuses the push (retired 2026-10-16, line 334); and that merges "ask", omitting the `APEX_MERGE_DESK=1` silence — comments only | cco, perfectionist |
| 10 | `AGENTS.md` §Seeing the game | duplicate "`version.json` → deploy-research" route (kept in §Agent extensions) | cco |
| 11 | `.claude/agents/worker.md` | listed `mcp__plugin_browser-use_browser-use` and claimed `mcp-browser-guard.sh` refuses it; the guard regex does not match it — removed from `tools:`, body says why | agent-smith |
| 12 | `.claude/agents/README.md` | worker row "all ten MCP servers … three browser servers the hook refuses"; merge-desk "ready-gate + cap" (cap retired); tier lists missed release-auditor (haiku) and merge-desk (inherit) | agent-smith |
| 13 | `.claude/agents/ci-watcher.md` | `ready-full-cap.mjs` marked informational | agent-smith |
| 14 | `AGENTS.md` docs-only fast path | "an open PR still gets a fast tier" — a draft without `run-ci` runs only the skip notice (ci.yml, and this PR's own run 39110073043: "hollow") | perfectionist |
| 15 | `AGENTS.md` hooks paragraph, `subagent-contract.py` header | named it SubagentStop only; settings.json also wires it as PreToolUse `SubagentHandback` | perfectionist |
| 16 | `.claude/skills/README.md` steward row | "ready-gate + ready-full-cap" — cap is informational | perfectionist |

Verify: `node --test tests/unit/{docs-integrity,agent-config,agent-surface,skill-progressive,skill-hint-hook}.test.mjs`.

## Not applied

| Item | Reason |
|---|---|
| **memory-sync re-adds deleted index lines** (perfectionist major; seen live twice this session) | `memory-sync.sh` keeps live index lines the branch lacks after a HEAD move (#2128), so a line deleted in a commit comes back from any container whose live dir predates it. Fix needs a hook change (drop a live line whose `(file.md)` is already indexed, or one removed in HEAD's history) plus a `memory-sync` test — follow-up issue, not a prose fix |
| `mcp-browser-guard.sh` regex does not match `plugin_browser-use_browser-use` | hook change; worker no longer lists it (row 11), but `settings.json:22` still allows it top-level |
| `subagent-contract.py` PreToolUse `onFailure: block` vs "fails open" | behaviour decision for the owner |
| `docs/README.md:146` rows joined by literal `\n` | outside the grant's paths (`.claude/**`, AGENTS.md) |
| compound-* descriptions "Use when compound-debug." | the three skills came from a description-budget fit commit (e4dc6d10); budget 12,662/12,800 chars — leave to the routing owner |
| merge-level-3 memory "04:19Z" vs role card "19:51Z" | both may be real (grant, then reaffirm); the card stays the single source |
| "1 h gate" in `merge-fast-verify-on-ci` memory | Bryce's own phrasing for the override; meaning unverified |
| AGENTS.md trims (rule 4 dated parentheticals, line 112 duplicate, Cursor section, asset-pack section, verification-table cell, Merge Desk procedure line) | restructures; asset-pack text is test-read (`docs-integrity.test.mjs`); AGENTS.md is 199/200 lines, 27,335/28,500 B |
| settings.json: blanket `Bash`/`Edit`/`Write` make scoped allows dead; no sensitive-file `Read` denies; 5 unnamed UUID MCP allows; merge-desk `model: inherit` | permission policy / tier decisions (tiers pinned by `skill-progressive.test.mjs`) |
| `enabledPlugins`, `Skill(...)` deny lines | owned by #2862 |
| `.cco/`, `.contextignore`, `commands/`, `tasks/`, `SPEC.md`, cc-bootstrapper / create-agent scaffolds | declined earlier; would overlay the harness |
