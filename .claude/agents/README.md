# Apex 26 custom subagents

Markdown agents with YAML frontmatter under `.claude/agents/`. Claude Code and
Cursor both load this path (Cursor also accepts `.cursor/agents/`; we keep the
single Claude tree to avoid drift). Fourteen agents. Two older ones were folded
away: `worktree-regression-check` into **verify-agent** `--base`, and
`doc-drift-auditor` into the `total-audit` workflow's `docs-ref` / `docs-idx`
lenses (`.claude/workflows/README.md`).

| Agent | Use when |
|---|---|
| **deploy-research** | Post-deploy liveness, shipped-JS marker checks, public-web / track reference research via the host fetch tool (WebFetch / hosted TinyFish). Read-only; no Chrome, no Playwright, never the in-repo tinyfish wrapper (egress-blocked). |
| **release-auditor** | Read-only exact-byte release evidence: live `apex-sha`, shell/service-worker references, lazy-asset response hashes, headers and git ancestry. No browser, writes, cache deletion, dispatch or merge. |
| **verify-agent** | Run `tools/ci/verify-change.mjs --fast` against the current tree and report the JSON verdict; `--base <ref>` repeats it on an ephemeral worktree at the session SHA / deploy tip and answers "same-red / new-on-session / already-red-on-ref". WGX edits also get `wgx-validate.mjs --static`. Read-only; never starts Playwright / `--wait` / `test-solo`; names leftover `batches` as notRun. |
| **track-surveyor** | Survey + improve ONE circuit: writes only circuit def + scenery files (hook-enforced through `agent_type`), in its own worktree (`isolation: worktree` — parallel surveyors never share a checkout; it commits, never pushes, and the parent merges the fork's branch), verifies with `verify-track.cjs`, reports baseline deltas instead of moving them. No browser runs. |
| **physics-contract-auditor** | Read-only `vstd-lint` + `Tracks.curvature` column classification (AI-only / assist-gated / broadcast / surface). No Playwright. |
| **bloat-auditor** | Read-only agent-bloat / simplify pass. `bloat-scan.mjs` + one assigned scope; returns `BLOAT` rows. No edits, no web, no Playwright, no chrome-start. Parent applies one carve via **slim-bloat**. |
| **ci-red-triage** | A red `ci.yml` / `pages.yml` run: names test, assertion, lane, base verdict, and stale `gen:check` / agent-index drift (prescribe `npm run gen`). Read-only; never re-runs locally. |
| **ci-watcher** | Read-only `pr-board.mjs` table with suggested ARM/READY/SYNC/FIX actions. Merge Desk acts are dormant unless a desk session is live. Protocol: skill `ci-watch`. |
| **merge-desk** | **Dormant** unless designated in the launch prompt. When live: skill `ci-watch` sweep — board, ready-gate, disarm foreign arms, staff lanes. Never merges (merge desk / orchestrator at Level 3). |
| **prior-art-scout** | Step 0 of a hunt or audit: greps `docs/notes/DEFECT-LEDGER.md`, `docs/BUGS.md`, hunt/survey notes and `git log` for one slice or topic and returns ≤ 30 `KNOWN` rows — the do-not-re-report list. Haiku, 12 turns; never judges whether an item is still true. |
| **code-hunter** | Bug / perf / dead-code hunt over ONE slice, one agent per slice in parallel; takes the scout's list as `known:` and prints ≤ 12 `FINDING` rows as found, then `covered:` / `not covered:` / `measured:`. Node-only checks (`node --test` one file, VM runs under `timeout 180`); the whole run stays well under 10 min. The one opus pin. |
| **agent-surface-reviewer** | Reviews ONE skill, agent, hook, rule file or AGENTS.md section (trigger, paths, commands, walkthrough, structure, enforcement) and writes a ≤ 60-line report to the `scratch/` path it is given; `retest <old report>` adds BEFORE/AFTER. Its one write is that report (hook-enforced: Write/Edit to `scratch/**.md` only, no Bash writes). Returns VERDICT + top 2 gaps. |
| **finding-verifier** | Re-reads up to 15 `file:line — claim` rows on the current tree and returns `CONFIRMED / STALE / REFUTED / NEEDS-BROWSER` with evidence, then `refuted: k/N stale: k/N`. Run it before acting on any hunt, survey, review or audit finding; never fixes. |
| **worker** | ONE scoped change handed off by the parent: an explicit `tools:` list of every tool — all ten MCP servers by `mcp__<server>` (GitHub, Claude sessions, apex-tools, Context7, Docs, Drive, TinyFish, and the three browser servers that the subagent hook still refuses), git and shell via Bash, edits, web, SendMessage / ListAgents, tasks, worktrees, artifacts — its own worktree (`isolation: worktree`), node-only verification, commits on its branch, and coordinates mid-task with `SendMessage` (`main` for blocked / question / collision / scope / checkpoint, a named peer only for an interface it moves). Several run in parallel on disjoint OWNED paths; the spawn prompt names goal, OWNED, FORBIDDEN, verify command, peers, and whether it pushes. Never merges, arms, readies or cancels; no browser runs. Ends with a fixed `WORKER <name>:` report. |

**Token routing:** prefer these over attaching fat skills. Deploy/version →
`deploy-research` (not full `mcp-probe`). Pre-push verify → `verify-agent`;
same-red on tip → `verify-agent --base <ref>`. One circuit →
`track-surveyor`. Stale prose → the `total-audit` workflow (`docs-ref` /
`docs-idx` lenses), not a bespoke agent. Curvature / PACE semantics →
`physics-contract-auditor`. Fat skill / extract / dead code → `bloat-auditor`
(parent applies via **slim-bloat**). A red Actions run → `ci-red-triage`. The open-PR board → `ci-watcher` (acted on per skill `ci-watch`). A hunt → `prior-art-scout`, then one `code-hunter` per slice, then `finding-verifier` on the rows before anyone fixes. A skill / agent / hook / AGENTS.md edit → `agent-surface-reviewer`. A scoped implementation to hand off and talk to while it runs → `worker` (one per disjoint path set, named so peers can message it). Parent keeps cache bump, PR readiness and deploy FF.

**One prohibition line, not five blocks.** Every agent body ends with:
"Flat prohibitions: AGENTS.md §Verification 10, 5 and 4 (no
Playwright/test-bg/test-solo/chrome-start, no --wait); the
js/css/index.html write ban is hook-enforced." Agent-specific scope rules stay
short and sit above it.

Skills (workflows) live in `.claude/skills/`. Canonical rules live in
`AGENTS.md`. Which CLIs are wrapped as `apex_*`: `docs/AGENT-SURFACE.md`.
New agents must be listed here and remain trackable
(`.gitignore` allowlists `!.claude/agents/`).

Frontmatter is read by two hosts, and each ignores the other's fields:
`name` (matches the filename) and `description` (what + when) for both;
`tools:` is the Claude Code allowlist (read-only agents list no Write/Edit; track-surveyor and agent-surface-reviewer write, scoped by `protect-files.py`; worker writes within its brief's OWNED paths and lists every tool, MCP servers as `mcp__<server>`)
and `background: true` keeps a Claude Code agent off the foreground;
`readonly: true` and `is_background: true` are the Cursor equivalents
(`https://cursor.com/docs/subagents`). `model:` is a TIER, pinned by
`tests/unit/skill-progressive.test.mjs`: `haiku` for scan-and-report agents
(verify-agent, deploy-research, ci-watcher, prior-art-scout), `sonnet` for log triage,
refactor and reachability judgement (ci-red-triage, bloat-auditor, physics-contract-auditor, finding-verifier, agent-surface-reviewer),
`opus` for the one agent whose product is depth (code-hunter), `inherit` for track-surveyor and worker. Every agent carries `maxTurns`; the two that run repeatedly
carry `memory: project` (`.claude/agent-memory/<name>/MEMORY.md`, tracked, one
line per remembered fact with a SHA). The test asserts all of it.
