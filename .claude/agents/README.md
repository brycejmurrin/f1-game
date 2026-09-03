# Apex 26 custom subagents

Markdown agents with YAML frontmatter under `.claude/agents/`. Claude Code and
Cursor both load this path (Cursor also accepts `.cursor/agents/`; we keep the
single Claude tree to avoid drift). Five agents (seven until 2026-09:
`worktree-regression-check` folded into **verify-agent** `--base`, and
`doc-drift-auditor` into the `total-audit` workflow's `docs-ref` / `docs-idx`
lenses — `.claude/workflows/README.md`).

| Agent | Use when |
|---|---|
| **deploy-research** | Post-deploy liveness, shipped-JS marker checks, public-web / track reference research via the host fetch tool (WebFetch / hosted TinyFish). Read-only; no Chrome, no Playwright, never the in-repo tinyfish wrapper (egress-blocked). |
| **verify-agent** | Run `tools/ci/verify-change.mjs --fast` against the current tree and report the JSON verdict; `--base <ref>` repeats it on an ephemeral worktree at the session SHA / deploy tip and answers "same-red / new-on-session / already-red-on-ref". WGX edits also get `wgx-validate.mjs --static`. Read-only; never starts Playwright / `--wait` / `test-solo`; names leftover `batches` as notRun. |
| **track-surveyor** | Survey + improve ONE circuit: writes only that `js/circuits/<id>.js`, verifies with `verify-track.cjs`, reports baseline deltas instead of moving them. No browser runs. |
| **physics-contract-auditor** | Read-only `vstd-lint` + `Tracks.curvature` column classification (AI-only / assist-gated / broadcast / surface). No Playwright. |
| **bloat-auditor** | Read-only agent-bloat / simplify pass. `bloat-scan.mjs` + one assigned scope; returns `BLOAT` rows. No edits, no Playwright, no chrome-start. Parent applies one carve via **slim-bloat**. |

**Token routing:** prefer these over attaching fat skills. Deploy/version →
`deploy-research` (not full `mcp-probe`). Pre-push verify → `verify-agent`;
same-red on tip → `verify-agent --base <ref>`. One circuit →
`track-surveyor`. Stale prose → the `total-audit` workflow (`docs-ref` /
`docs-idx` lenses), not a bespoke agent. Curvature / PACE semantics →
`physics-contract-auditor`. Fat skill / extract / dead code → `bloat-auditor`
(parent applies via **slim-bloat**). Parent keeps edits, cache bump, and deploy FF.

**One prohibition line, not five blocks.** Every agent body ends with:
"Flat prohibitions: AGENTS.md §Verification 3 and 7 (no
Playwright/test-bg/test-solo/chrome-start, no --wait, no bump); the
js/css/index.html write ban is hook-enforced." Agent-specific scope rules stay
short and sit above it.

Skills (workflows) live in `.claude/skills/`. Canonical rules live in
`AGENTS.md`. Which CLIs are wrapped as `apex_*`: `docs/AGENT-SURFACE.md`.
New agents must be listed here and remain trackable
(`.gitignore` allowlists `!.claude/agents/`).

Frontmatter (Cursor `https://cursor.com/docs/subagents`): `name` (matches the
filename), `description` (what + when), `model: inherit` unless a specific
model is justified. `readonly: true` for research/verify agents;
`is_background: true` when the job is a long verify/fetch that must not hold
the parent. `tests/unit/skill-progressive.test.mjs` asserts name/description/model.
