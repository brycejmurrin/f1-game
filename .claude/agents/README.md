# Apex 26 custom subagents

Markdown agents with YAML frontmatter under `.claude/agents/`. Claude Code and
Cursor both load this path (Cursor also accepts `.cursor/agents/`; we keep the
single Claude tree to avoid drift). Twelve agents. Folded away:
`worktree-regression-check` into **verify-agent** `--base`;
`doc-drift-auditor` into the `total-audit` workflow's `docs-ref` / `docs-idx`
lenses (`.claude/workflows/README.md`); `release-auditor` into
**deploy-research** (its exact-bytes recipe); `ci-watcher` and `merge-desk`
deleted 2026-10-26 with the retired Merge Desk (PR sweeps: skill `steward` and
`tools/ci/pr-board.mjs`).

| Agent | Use when |
|---|---|
| **Explore** | Open-ended codebase search: files by pattern, keyword greps, a JS symbol through apex-lsp, "where / how does X work" with `path:line` evidence, at the thoroughness the caller names (quick / medium / very thorough). Named to override Claude Code's built-in Explore, which inherits the session's model; this one runs on Haiku at `effort: medium` and, like the built-in, without CLAUDE.md (2026-10-28, https://code.claude.com/docs/en/sub-agents). Read-only by `tools:`; its Bash is read-only by prompt, as the built-in's is (it is not in `protect-files.py`'s READONLY_AGENTS). |
| **deploy-research** | Post-deploy liveness, shipped-JS marker checks, exact-byte asset hashes and headers, public-web / track reference research via the host fetch tool (WebFetch / hosted TinyFish). Read-only; no Chrome, no Playwright, never the in-repo tinyfish wrapper (egress-blocked). |
| **verify-agent** | Run `tools/ci/verify-change.mjs --fast` against the current tree and report the JSON verdict; `--base <ref>` repeats it on an ephemeral worktree at the session SHA / deploy tip and answers "same-red / new-on-session / already-red-on-ref". WGX edits also get `wgx-validate.mjs --static`. Read-only; never starts Playwright / `--wait` / `test-solo`; names leftover `batches` as notRun. |
| **track-surveyor** | Survey + improve ONE circuit with the track CLIs (not the `apex_*` MCP wraps, which read the main checkout): writes only circuit def + scenery files (hook-enforced through `agent_type`), in its own worktree (`isolation: worktree` — parallel surveyors never share a checkout; it commits, never pushes, and the parent merges the fork's branch), verifies with `verify-track.cjs`, reports baseline deltas instead of moving them. No browser runs. |
| **physics-contract-auditor** | Read-only `curvature-channels.test.mjs` gate first, then `Tracks.curvature` / arc-derivative column classification (AI-only / assist-gated / broadcast / surface); `vstd-lint` only for a named speed-comparison scope. No Playwright. |
| **bloat-auditor** | Read-only agent-bloat / simplify pass. `bloat-scan.mjs` + one assigned scope; returns `BLOAT` rows. No edits, no web, no Playwright, no chrome-start. Parent applies one carve via **slim-bloat**. |
| **ci-red-triage** | A red `ci.yml` / `pages.yml` run: names test, assertion, lane, base verdict, and stale `gen:check` / agent-index drift (prescribe `npm run gen`); for Pages, the nested `ci / …` job and the merge since the last green Pages run. Read-only; never re-runs locally. |
| **prior-art-scout** | Step 0 of a hunt or audit: greps `docs/notes/DEFECT-LEDGER.md`, `docs/BUGS.md`, hunt/survey notes and `git log` for one slice or topic and returns ≤ 30 `KNOWN` rows — the do-not-re-report list. Haiku, 12 turns; never judges whether an item is still true. |
| **code-hunter** | Bug / perf / dead-code hunt over ONE slice, one agent per slice in parallel; takes the scout's list as `known:` and prints ≤ 12 `FINDING` rows as found, then `covered:` / `not covered:` / `measured:`. Node-only checks (`node --test` one file, VM runs under `timeout 180`); the whole run stays well under 10 min. The one opus pin. |
| **agent-surface-reviewer** | Reviews ONE skill, agent, hook, rule file or AGENTS.md section (trigger, paths, commands, walkthrough, structure, enforcement) and writes a ≤ 60-line report to the `scratch/` path it is given; `retest <old report>` adds BEFORE/AFTER. Its one write is that report (hook-enforced: Write/Edit to `scratch/**.md` only, no Bash writes). Returns VERDICT + top 2 gaps. |
| **finding-verifier** | Re-reads up to 15 `file:line — claim` rows on the current tree and returns `CONFIRMED / STALE / REFUTED / NEEDS-BROWSER` with evidence, then `refuted: k/N stale: k/N`. Run it before acting on any hunt, survey, review or audit finding; never fixes. |
| **worker** | ONE scoped change handed off by the parent, with an explicit `tools:` list naming each connected MCP server as `mcp__<server>` (the six in `.mcp.json` plus GitHub, Claude sessions, Context7, Docs, TinyFish, BrowserStack; the local browser servers are listed but `mcp-browser-guard.sh` refuses them in a subagent, browserstack is not matched). Its own worktree (`isolation: worktree`), node-only verification, commits on its branch, coordinates mid-task with `SendMessage` (`main` for blocked / question / collision / scope / checkpoint, a named peer only for an interface it moves). The spawn prompt names goal, OWNED, FORBIDDEN, verify command, peers, and whether it pushes. Never merges, arms, readies or cancels; no browser runs. Ends with a fixed `WORKER <name>:` report. |

**Token routing:** prefer these over attaching fat skills. Codebase search →
`Explore` (Haiku), not a general-purpose agent. Deploy/version →
`deploy-research` (not full `mcp-probe`). Pre-push verify → `verify-agent`;
same-red on tip → `verify-agent --base <ref>`. One circuit →
`track-surveyor`. Stale prose → the `total-audit` workflow (`docs-ref` /
`docs-idx` lenses), not a bespoke agent. Curvature / PACE semantics →
`physics-contract-auditor`. Fat skill / extract / dead code → `bloat-auditor`
(parent applies via **slim-bloat**). A red Actions or Pages run → `ci-red-triage`. The open-PR board → `node tools/ci/pr-board.mjs` (skill `steward`). A hunt → `prior-art-scout`, then one `code-hunter` per slice, then `finding-verifier` on the rows before anyone fixes. A skill / agent / hook / AGENTS.md edit → `agent-surface-reviewer`. A scoped implementation to hand off and talk to while it runs → `worker` (one per disjoint path set, named so peers can message it). The parent keeps the PR: its readiness (`ready-gate`, then the `land` label; `docs/WORKERS.md` §5); nobody fast-forwards the deploy branch.

**One prohibition line, not five blocks.** Every agent body ends with:
"Flat prohibitions: AGENTS.md §Verification 10, 5 and 4 (no
Playwright/test-bg/test-solo/chrome-start, no --wait); the
js/css/index.html write ban is hook-enforced." That last clause means
`protect-files` refuses js/css/index.html edits while a browser run is live
(every session), not a standing per-agent ban. What actually stops a
reporter writing: `disallowedTools: Write, Edit, NotebookEdit` and a `tools:`
list without them (Claude Code), `readonly: true` (Cursor), and the
REPORTER / SURVEYOR scopes in `protect-files.py` for agent-surface-reviewer
and track-surveyor. A reporter's Bash can still write; no hook scopes that
yet. Agent-specific scope rules stay short and sit above the line.

Skills (workflows) live in `.claude/skills/`. Canonical rules live in
`AGENTS.md`. Which CLIs are wrapped as `apex_*`: `docs/AGENT-SURFACE.md`.
New agents must be listed here and remain trackable
(`.gitignore` allowlists `!.claude/agents/`).

Frontmatter is read by two hosts, and each ignores the other's fields:
`name` (matches the filename) and `description` (what + when) for both;
`tools:` is the Claude Code allowlist (read-only agents list no Write/Edit; track-surveyor and agent-surface-reviewer write, scoped by `protect-files.py`; worker writes within its brief's OWNED paths and lists every tool, MCP servers as `mcp__<server>`)
and `background: true` keeps a Claude Code agent off the foreground;
`readonly: true` and `is_background: true` are the Cursor equivalents
(`https://cursor.com/docs/subagents`) — Claude Code ignores both. readonly is
Cursor's switch; `disallowedTools: Write, Edit, NotebookEdit` is Claude Code's,
so the eight read-only reporters and Explore carry both (system audit 4, 2026-10-26). `model:` is a TIER, pinned by
`tests/unit/skill-progressive.test.mjs`: `haiku` for scan-and-report agents
(verify-agent, deploy-research, prior-art-scout, Explore), `sonnet` for log triage,
refactor and reachability judgement (ci-red-triage, bloat-auditor, physics-contract-auditor, finding-verifier, agent-surface-reviewer),
`opus` for the one agent whose product is depth (code-hunter), `inherit` for track-surveyor and worker. Only Explore sets `effort:`
(a per-call `effort` or `CLAUDE_CODE_EFFORT_LEVEL` overrides it). Every agent carries `maxTurns`; the two that run repeatedly
carry `memory: project` (`.claude/agent-memory/<name>/MEMORY.md`, tracked, one
line per remembered fact with a SHA). The test asserts all of it.
